import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service worker registration and update handling (F3 §6.4).
 * The app never reloads by itself; the user confirms the update.
 */
export function usePwaUpdate() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration;
    },
  });

  const checkForUpdate = useCallback(async (): Promise<'checked' | 'unavailable'> => {
    const registration = registrationRef.current;
    if (!registration || !navigator.onLine) return 'unavailable';
    await registration.update();
    return 'checked';
  }, []);

  return {
    needRefresh,
    dismiss: () => setNeedRefresh(false),
    update: () => updateServiceWorker(true),
    checkForUpdate,
  };
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
