import { describe, expect, it, vi } from 'vitest';
import { channelLoader } from '../../../scripts/channel-loader.mjs';
import { BETA_BASE, STABLE_BASE, switchChannel } from './channel';

const deps = (ok: boolean) => ({
  fetch: vi.fn(() => Promise.resolve({ ok } as Response)),
  storage: { setItem: vi.fn(), removeItem: vi.fn() },
  go: vi.fn(),
});

describe('switchChannel', () => {
  it('marks the device and loads the beta when one is published', async () => {
    const d = deps(true);
    expect(await switchChannel('beta', d)).toBe('switching');
    expect(d.storage.setItem).toHaveBeenCalledWith('bandapp.channel', 'beta');
    expect(d.go).toHaveBeenCalledWith(BETA_BASE);
  });

  it('changes nothing when no beta is published', async () => {
    const d = deps(false);
    expect(await switchChannel('beta', d)).toBe('unavailable');
    expect(d.storage.setItem).not.toHaveBeenCalled();
    expect(d.go).not.toHaveBeenCalled();
  });

  it('goes back to the released version', async () => {
    const d = deps(true);
    await switchChannel('stable', d);
    expect(d.storage.removeItem).toHaveBeenCalledWith('bandapp.channel');
    expect(d.go).toHaveBeenCalledWith(STABLE_BASE);
  });
});

/** Runs the inline loader of index.html against a fake browser; returns where it sent the page. */
function boot(build: 'stable' | 'beta', url: string, local: Record<string, string> = {}, session: Record<string, string> = {}) {
  const store = (data: Record<string, string>) => ({
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = String(v)),
    removeItem: (k: string) => void delete data[k],
  });
  const location = new URL(url, 'https://example.test');
  let replaced: string | null = null;
  let state: string | null = null;
  const win: Record<string, unknown> = {};
  const run = new Function('window', 'location', 'localStorage', 'sessionStorage', 'history', 'URLSearchParams', channelLoader(build, '/BandOrganizer/'));
  run(
    win,
    { pathname: location.pathname, search: location.search, hash: location.hash, replace: (to: string) => (replaced = to) },
    store(local),
    store(session),
    { replaceState: (_: unknown, __: unknown, to: string) => (state = to) },
    URLSearchParams,
  );
  return { replaced, state, local, session, redirecting: win.__bandappRedirecting === true };
}

describe('channel loader (index.html)', () => {
  it('leaves the released version alone without the mark', () => {
    expect(boot('stable', '/BandOrganizer/songs').replaced).toBeNull();
  });

  it('sends a beta device from the released version to the beta, keeping the address', () => {
    const r = boot('stable', '/BandOrganizer/songs/abc?view=lyrics', { 'bandapp.channel': 'beta' });
    expect(r.replaced).toBe('/BandOrganizer/beta/songs/abc?view=lyrics');
    expect(r.redirecting).toBe(true);
  });

  it('sends a device without the mark from the beta to the released version', () => {
    expect(boot('beta', '/BandOrganizer/beta/chat').replaced).toBe('/BandOrganizer/chat');
  });

  it('starts the beta, counts the start and restores a deep address', () => {
    const r = boot('beta', '/BandOrganizer/beta/', { 'bandapp.channel': 'beta' }, { 'bandapp.betaPath': 'songs/abc?view=lyrics', 'bandapp.betaTry': '1' });
    expect(r.replaced).toBeNull();
    expect(r.local['bandapp.betaBoot']).toBe('1');
    expect(r.state).toBe('/BandOrganizer/beta/songs/abc?view=lyrics');
    expect(r.session['bandapp.betaTry']).toBeUndefined();
  });

  it('falls back to the released version after two beta starts that never showed the app', () => {
    const r = boot('beta', '/BandOrganizer/beta/', { 'bandapp.channel': 'beta', 'bandapp.betaBoot': '2' });
    expect(r.replaced).toBe('/BandOrganizer/');
    expect(r.local['bandapp.channel']).toBeUndefined();
  });

  it('beta address answered by the released page (deep link): tries the beta start page once', () => {
    const r = boot('stable', '/BandOrganizer/beta/songs/abc', { 'bandapp.channel': 'beta' });
    expect(r.replaced).toBe('/BandOrganizer/beta/');
    expect(r.session['bandapp.betaPath']).toBe('songs/abc');
  });

  it('… and gives up when there is no beta at all (no loop)', () => {
    const r = boot('stable', '/BandOrganizer/beta/', { 'bandapp.channel': 'beta' }, { 'bandapp.betaTry': '1' });
    expect(r.replaced).toBe('/BandOrganizer/');
    expect(r.local['bandapp.channel']).toBeUndefined();
  });

  it('rescue address ?kanal=stabil clears the mark', () => {
    const r = boot('stable', '/BandOrganizer/?kanal=stabil', { 'bandapp.channel': 'beta', 'bandapp.betaBoot': '1' });
    expect(r.replaced).toBeNull();
    expect(r.local['bandapp.channel']).toBeUndefined();
  });
});
