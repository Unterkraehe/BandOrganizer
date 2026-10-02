import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service worker registration and update handling (F3 §6.4).
 * The app never reloads by itself; the user confirms the update.
 * Call this hook in ONE place only (UpdateToast): every call registers the service worker again.
 */
export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW();
  const newer = useNewerWaiting(needRefresh);
  return {
    needRefresh: needRefresh && newer,
    dismiss: () => setNeedRefresh(false),
    update: () => applyUpdate(),
  };
}

/** "0.19.10" > "0.19.9" */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff > 0;
  }
  return false;
}

const VERSION_ANSWER_MS = 2_000;

/** Asks a service worker for its app version (sw-version-<version>.js, vite.config.ts); null without an answer. */
export function askVersion(worker: Pick<ServiceWorker, 'postMessage'>, timeoutMs = VERSION_ANSWER_MS): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<{ version?: unknown }>) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(typeof event.data?.version === 'string' ? event.data.version : null);
    };
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

/** How often to ask the server again while an older version is waiting (the CDN catches up within ~10 min). */
const RECHECK_MS = 2 * 60_000;

/**
 * Right after a deploy the CDN serves old and new files for a few minutes, so the browser may install
 * the OLD service worker as "update" – offering it made "Aktualisieren" swap versions endlessly
 * (v0.19.4). Only a waiting version that is newer than the running app counts. Versions without an
 * answer (built before v0.19.4) are older. While an older one waits, the server is asked again until
 * the current version replaces it (an identical copy then waits harmlessly until the next start).
 */
function useNewerWaiting(needRefresh: boolean): boolean {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    if (!needRefresh || !('serviceWorker' in navigator)) return;
    let stopped = false;
    let recheck: ReturnType<typeof setInterval> | undefined;
    let registration: ServiceWorkerRegistration | undefined;
    const evaluate = async () => {
      const waiting = registration?.waiting;
      const version = waiting ? await askVersion(waiting) : null;
      if (stopped) return;
      const offer = version !== null && isNewerVersion(version, __APP_VERSION__);
      const older = !!waiting && (version === null || isNewerVersion(__APP_VERSION__, version));
      setNewer(offer);
      if (older) {
        recheck ??= setInterval(() => void registration?.update().catch(() => {}), RECHECK_MS);
      } else {
        clearInterval(recheck);
        recheck = undefined;
      }
    };
    // a newer service worker replacing the waiting one: evaluate again once it is installed
    const onUpdateFound = () => {
      const worker = registration?.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') void evaluate();
      });
    };
    void navigator.serviceWorker.getRegistration().then((found) => {
      if (stopped || !found) return;
      registration = found;
      registration.addEventListener('updatefound', onUpdateFound);
      void evaluate();
    });
    return () => {
      stopped = true;
      clearInterval(recheck);
      registration?.removeEventListener('updatefound', onUpdateFound);
    };
  }, [needRefresh]);
  return newer;
}

/** "Nach Updates suchen": asks the server for a newer service worker. */
export async function checkForUpdate(): Promise<'checked' | 'unavailable'> {
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (!registration || !navigator.onLine) return 'unavailable';
  await registration.update();
  return 'checked';
}

/** How long a new version may take to finish installing / to take over before we reload anyway. */
const INSTALL_WAIT_MS = 10_000;
const TAKEOVER_WAIT_MS = 3_000;

function installed(worker: ServiceWorker, timeoutMs: number): Promise<ServiceWorker | null> {
  if (worker.state === 'installed') return Promise.resolve(worker);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'redundant') {
        clearTimeout(timer);
        resolve(worker.state === 'installed' ? worker : null);
      }
    });
  });
}

export interface UpdateDeps {
  container: Pick<ServiceWorkerContainer, 'getRegistration' | 'addEventListener'> | null;
  reload: () => void;
}

const browserDeps = (): UpdateDeps => ({
  container: 'serviceWorker' in navigator ? navigator.serviceWorker : null,
  reload: () => window.location.reload(),
});

let applying: Promise<void> | null = null;

/**
 * "Aktualisieren" – must always do something visible (v0.14.2). Tells the waiting new version to
 * take over (or waits for one that is still installing), reloads as soon as it controls the page,
 * and reloads after a few seconds at the latest in any case: e.g. when the new version was
 * already activated from another window, nothing is waiting any more and a reload alone suffices.
 */
export function applyUpdate(deps: UpdateDeps = browserDeps()): Promise<void> {
  applying ??= (async () => {
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      deps.reload();
    };
    try {
      const registration = await deps.container?.getRegistration();
      const next = registration?.waiting ?? (registration?.installing ? await installed(registration.installing, INSTALL_WAIT_MS) : null);
      if (next) {
        deps.container!.addEventListener('controllerchange', reload, { once: true });
        next.postMessage({ type: 'SKIP_WAITING' });
        await new Promise((resolve) => setTimeout(resolve, TAKEOVER_WAIT_MS));
      }
    } catch (error) {
      console.warn('Update failed, reloading anyway', error);
    }
    reload();
  })().finally(() => {
    applying = null;
  });
  return applying;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_HINT_KEY = 'bandapp.installHintDismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Install hint, shown once until dismissed (F3 §6.4). */
export function useInstallHint() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_HINT_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(INSTALL_HINT_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === 'accepted') dismiss();
  }, [promptEvent, dismiss]);

  const mode: 'prompt' | 'ios' | null =
    dismissed || isStandalone() ? null : promptEvent ? 'prompt' : isIos() ? 'ios' : null;

  return { mode, install, dismiss };
}
