import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '@/core/theme/theme';
import { App } from './App';

describe('App shell (M0)', () => {
  it('renders the start screen with navigation', () => {
    render(<App initialPath="/" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Start' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Hauptmenü' });
    expect(within(nav).getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Einstellungen' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Mehr' })).toBeInTheDocument();
  });

  it('switches the theme in the settings and remembers it', async () => {
    const user = userEvent.setup();
    render(<App initialPath="/settings" />);
    await user.click(screen.getByRole('radio', { name: 'Dunkel' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    await user.click(screen.getByRole('radio', { name: 'Hell' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('lists "Mehr" items and shows a helpful 404', () => {
    const { unmount } = render(<App initialPath="/more" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mehr' })).toBeInTheDocument();
    unmount();
    render(<App initialPath="/gibt-es-nicht" />);
    expect(screen.getByRole('button', { name: 'Zur Startseite' })).toBeInTheDocument();
  });
});

describe('phone navigation', () => {
  it('highlights "Mehr" while a screen from "Mehr" is open', () => {
    render(<App initialPath="/settings" />);
    const nav = screen.getByRole('navigation', { name: 'Hauptmenü' });
    expect(within(nav).getByRole('link', { name: 'Mehr' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Start' })).not.toHaveAttribute('aria-current');
  });
});
