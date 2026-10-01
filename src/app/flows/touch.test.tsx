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
