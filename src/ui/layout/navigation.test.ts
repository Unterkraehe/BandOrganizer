import { describe, expect, it } from 'vitest';
import { parentOf, type NavigationInfo } from './navigation';

/** Where ← back leads after a link from outside (F3 §4.4, R-UX-09). */
const info: NavigationInfo = {
  roots: ['/', '/songs', '/calendar', '/chat', '/setlists', '/members', '/settings', '/more'],
  routes: [
    { path: '/songs/:songId' },
    { path: '/songs/:songId/edit' },
    { path: '/songs/new' },
    { path: '/calendar/:eventId' },
    { path: '/calendar/:eventId/:occurrence', parent: '/calendar' },
    { path: '/calendar/:eventId/:occurrence/edit' },
    { path: '/setlists/:setlistId' },
    { path: '/setlists/:setlistId/stage' },
    { path: '/profile', parent: '/settings' },
    { path: '/search' },
  ],
};

describe('parent screen', () => {
  it('drops the last part until it is a known screen', () => {
    expect(parentOf('/songs/s_1/edit', info)).toBe('/songs/s_1');
    expect(parentOf('/songs/s_1', info)).toBe('/songs');
    expect(parentOf('/songs/new', info)).toBe('/songs');
    expect(parentOf('/setlists/x/stage', info)).toBe('/setlists/x');
    expect(parentOf('/calendar/e_1/2026-10-08/edit', info)).toBe('/calendar/e_1/2026-10-08');
  });

  it('uses an explicit parent', () => {
    expect(parentOf('/calendar/e_1/2026-10-08', info)).toBe('/calendar');
    expect(parentOf('/profile', info)).toBe('/settings');
  });

  it('falls back to the start screen', () => {
    expect(parentOf('/search', info)).toBe('/');
    expect(parentOf('/nowhere/at/all', info)).toBe('/');
  });
});
