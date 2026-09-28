import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '@/core/theme/theme';
import { App } from './App';

type User = ReturnType<typeof userEvent.setup>;

/** Demo mode: welcome → band setup → first profile → app shell. */
async function enterDemo(user: User, path = '/') {
  render(<App initialPath={path} autoStart={false} />);
  await user.click(screen.getByRole('button', { name: 'Demo ausprobieren' }));
  await user.type(await screen.findByRole('textbox', { name: 'Bandname' }), 'Overload');
  await user.click(screen.getByRole('radio', { name: 'Signalrot' }));
  await user.click(screen.getByRole('button', { name: 'Band einrichten' }));
  await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Lisa');
  await user.type(screen.getByRole('combobox', { name: /Instrument/ }), 'Gesang');
  await user.click(screen.getByRole('button', { name: "Los geht's" }));
}

describe('App (M1 flow in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('shows the welcome screen when not connected', () => {
    render(<App initialPath="/" autoStart={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Overload App' })).toBeInTheDocument();
    // HiDrive login is disabled until the client ID is configured
    expect(screen.getByRole('button', { name: 'Mit HiDrive verbinden' })).toBeDisabled();
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

describe('Songs (M2 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('finds the demo songs, searches and plays one', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    expect(await screen.findByText('5 Songs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Midnight Engine/ })).toBeInTheDocument();
    // hidden folders are skipped
    expect(screen.queryByText(/nicht-scannen/)).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Songs durchsuchen' }), 'rust thund');
    expect(await screen.findByText('1 Song')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rust and Thunder abspielen' }));
    expect(await screen.findByRole('region', { name: 'Läuft gerade' })).toHaveTextContent('Rust and Thunder');
    expect(screen.getByRole('button', { name: 'Rust and Thunder pausieren' })).toBeInTheDocument();
  });

  it('filters new songs and opens the detail page', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('5 Songs');
    await user.click(screen.getByRole('button', { name: 'Neu' }));
    expect(screen.getByText('1 Song')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Slow Burn/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Slow Burn (Probe)' })).toBeInTheDocument();
    expect(screen.getByText('Proben/2026-09-17')).toBeInTheDocument();
  });
});
