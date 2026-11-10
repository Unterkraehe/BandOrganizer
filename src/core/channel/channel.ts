/**
 * Release channels (roadmap §4d, v1.0.1): one app, one address, one install – two published versions.
 * The released version lives at `/BandOrganizer/`, the beta at `/BandOrganizer/beta/` (built from the
 * `beta` branch into the same GitHub Pages site). A device-local mark decides which one a device loads;
 * the redirect itself happens before the app starts (`scripts/channel-loader.mjs`, inlined into index.html).
 * Both versions share login, settings and caches on the device – a beta must keep them readable for
 * the released version (R-DATA-10).
 */

export const CHANNEL_KEY = 'bandapp.channel';
/** counts beta starts that never got as far as showing the app – the loader falls back after two */
export const BETA_BOOT_KEY = 'bandapp.betaBoot';

export type Channel = 'stable' | 'beta';

/** the version that is running */
export const channel: Channel = __APP_CHANNEL__;
export const isBeta = channel === 'beta';
/** address of the released version – also where the login returns to and where notifications are registered */
export const STABLE_BASE: string = __STABLE_BASE__;
export const BETA_BASE = `${STABLE_BASE}beta/`;

/** Call once the app is on screen: this start worked. */
export function confirmBoot(): void {
  try {
    localStorage.removeItem(BETA_BOOT_KEY);
  } catch {
    // ignore
  }
}

export interface ChannelDeps {
  fetch: typeof fetch;
  storage: Pick<Storage, 'setItem' | 'removeItem'>;
  go: (url: string) => void;
}

const browserDeps = (): ChannelDeps => ({
  fetch: (...args) => window.fetch(...args),
  storage: localStorage,
  go: (url) => window.location.replace(url),
});

/** Is a beta published right now? (A deploy without a `beta` branch has none.) */
export async function betaAvailable(deps: Pick<ChannelDeps, 'fetch'> = browserDeps()): Promise<boolean> {
  try {
    const response = await deps.fetch(`${BETA_BASE}index.html`, { cache: 'no-store' });
    // GitHub Pages answers unknown addresses with the released app's page and status 404
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Switch this device to the other version and load it. 'unavailable': no beta is published (or no
 * connection) – nothing changes. Otherwise the page is replaced and this never matters.
 */
export async function switchChannel(next: Channel, deps: ChannelDeps = browserDeps()): Promise<'switching' | 'unavailable'> {
  if (next === 'beta') {
    if (!(await betaAvailable(deps))) return 'unavailable';
    deps.storage.setItem(CHANNEL_KEY, 'beta');
    deps.go(BETA_BASE);
  } else {
    deps.storage.removeItem(CHANNEL_KEY);
    deps.storage.removeItem(BETA_BOOT_KEY);
    deps.go(STABLE_BASE);
  }
  return 'switching';
}
