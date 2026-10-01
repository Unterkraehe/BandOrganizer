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
  return {
    needRefresh,
    dismiss: () => setNeedRefresh(false),
    update: () => applyUpdate(),
  };
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
