import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '@/core/theme/theme';
import { isHiDriveConfigured } from '@/config';
import { App } from './App';
import { enterDemo } from '@/test/demo';

describe('App (M1 flow in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('shows the welcome screen when not connected', () => {
    render(<App initialPath="/" autoStart={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Overload App' })).toBeInTheDocument();
    // HiDrive login is only enabled once the client ID is configured (src/config.ts)
    const connect = screen.getByRole('button', { name: 'Mit HiDrive verbinden' });
    if (isHiDriveConfigured()) expect(connect).toBeEnabled();
    else expect(connect).toBeDisabled();
  });

  it('sets up a band, creates the first profile and greets the member', async () => {
    const user = userEvent.setup();
    await enterDemo(user);
    expect(await screen.findByText(/, Lisa$/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Demo-Modus');
    const nav = screen.getByRole('navigation', { name: 'Hauptmenü' });
    expect(within(nav).getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Mitglieder' })).toBeInTheDocument();
    // band color applied
    expect(document.getElementById('band-theme')?.textContent).toContain('#E30613');
  });

  it('switches profiles and prevents duplicate names', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Profil wechseln' }));
    expect(await screen.findByRole('heading', { name: 'Wer bist du?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ich bin neu' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'lisa');
    await user.click(screen.getByRole('button', { name: "Los geht's" }));
    expect(await screen.findByText('Diesen Namen gibt es schon. Bist du das?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zu diesem Profil' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument();
  });

  it('marks a member as former and brings them back', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Profil wechseln' }));
    await user.click(await screen.findByRole('button', { name: 'Ich bin neu' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Tom');
    await user.click(screen.getByRole('button', { name: "Los geht's" }));
    // Tom opens Lisa's page via the members list
    const nav = await screen.findByRole('navigation', { name: 'Hauptmenü' });
    await user.click(within(nav).getByRole('link', { name: 'Mitglieder' }));
    await user.click(await screen.findByRole('link', { name: /Lisa/ }));
    await user.click(screen.getByRole('button', { name: 'Ist nicht mehr in der Band' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Als ehemalig markieren' }));
    expect(await screen.findByText('(ehemalig)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wieder aktivieren' }));
    expect(await screen.findByRole('button', { name: 'Ist nicht mehr in der Band' })).toBeInTheDocument();
  });

  it('switches the theme in the settings and remembers it', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    await user.click(await screen.findByRole('radio', { name: 'Dunkel' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('highlights "Mehr" on phones for its screens and shows a helpful 404', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/gibt-es-nicht');
    expect(await screen.findByRole('button', { name: 'Zur Startseite' })).toBeInTheDocument();
  });
});
