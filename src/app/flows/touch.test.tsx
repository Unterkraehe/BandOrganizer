import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enterDemo } from '@/test/demo';

describe('Touch behaviour (phone)', () => {
  beforeEach(() => localStorage.clear());
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  const asPhone = () => {
    window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('max-width: 767px') })) as typeof window.matchMedia;
  };
  const swipe = (target: Element, from: number, to: number, dy = 10) => {
    fireEvent.touchStart(target, { touches: [{ clientX: from, clientY: 400 }] });
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: to, clientY: 400 + dy }] });
  };

  it('swiping left/right moves through the bottom bar tabs', async () => {
    asPhone();
    const user = userEvent.setup();
    await enterDemo(user, '/');
    const main = screen.getByRole('main');
    swipe(main, 300, 100);
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
    swipe(screen.getByRole('main'), 300, 100);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kalender' })).toBeInTheDocument();
    swipe(screen.getByRole('main'), 100, 300);
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });

  it('does not swipe on mostly vertical moves, near the screen edge or on inputs', async () => {
    asPhone();
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    const main = screen.getByRole('main');
    await screen.findByRole('heading', { level: 1, name: 'Songs' });
    swipe(main, 300, 100, 200); // diagonal scroll
    swipe(main, 8, 250); // starts at the system edge
    swipe(screen.getByRole('searchbox'), 300, 100); // text field
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });

  it('does not swipe away from screens that are not bottom bar tabs', async () => {
    asPhone();
    const user = userEvent.setup();
    await enterDemo(user, '/setlists');
    swipe(screen.getByRole('main'), 300, 100);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByRole('heading', { level: 1, name: 'Setlists' })).toBeInTheDocument();
  });
});

describe('← back on every sub-screen (v0.15.0, R-UX-09)', () => {
  beforeEach(() => localStorage.clear());

  it('opened from outside (deep link): back walks up to the parent screens; tabs have no back', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings/band');
    await screen.findByRole('heading', { level: 1, name: 'Band bearbeiten' });
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument();
  });

  it('song → song list', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await user.click(await screen.findByRole('link', { name: /Rust and Thunder/ }));
    await screen.findByRole('heading', { level: 1, name: 'Rust and Thunder' });
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });
});

describe('Screen motion shows the direction (v0.15.0, R-UX-09)', () => {
  beforeEach(() => localStorage.clear());

  it('deeper = push, back = back, tab = fade', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    const direction = () => document.querySelector('[data-nav]')?.getAttribute('data-nav');
    await user.click(await screen.findByRole('link', { name: /Rust and Thunder/ }));
    await screen.findByRole('heading', { level: 1, name: 'Rust and Thunder' });
    expect(direction()).toBe('push');
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    await screen.findByRole('heading', { level: 1, name: 'Songs' });
    expect(direction()).toBe('back');
    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    await screen.findByRole('heading', { level: 1, name: 'Kalender' });
    expect(direction()).toBe('tab');
  });
});
