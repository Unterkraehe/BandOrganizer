/**
 * "The app is back": fires when the app returns after a while in the background (v0.12.3).
 * Phones freeze background PWAs – timers stop and data gets stale. Detected by
 * - visibilitychange (hidden → visible after ≥ 20 s),
 * - pageshow from the back/forward cache,
 * - a heartbeat gap (the device slept or the app was frozen without a visibility event, iOS).
 */
type Listener = () => void;

const listeners = new Set<Listener>();
const MIN_AWAY_MS = 20_000;
const HEARTBEAT_MS = 10_000;
const FROZEN_GAP_MS = 45_000;
let started = false;
let hiddenAt: number | null = null;
let lastBeat = Date.now();
let lastFire = 0;

function fire() {
  const now = Date.now();
  if (now - lastFire < 5_000) return; // several signals for the same return → once
  lastFire = now;
  listeners.forEach((l) => {
    try {
      l();
    } catch (error) {
      console.error('Resume listener failed', error);
    }
  });
}

function start() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else {
      if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_AWAY_MS) fire();
      hiddenAt = null;
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) fire();
  });
  setInterval(() => {
    const now = Date.now();
    if (now - lastBeat > FROZEN_GAP_MS && document.visibilityState === 'visible') fire();
    lastBeat = now;
  }, HEARTBEAT_MS);
}

export function onAppResume(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests */
export function triggerAppResume() {
  lastFire = 0;
  fire();
}
