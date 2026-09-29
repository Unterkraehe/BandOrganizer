import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/core/session/BandSession';
import { CalendarStore } from './store';
import { bandIcs, readSubscription, writeBandIcs, type Subscription } from './subscription';

interface SubscriptionState {
  subscription: Subscription | null;
  loaded: boolean;
  setSubscription: (sub: Subscription | null) => void;
  /** current band.ics content (for creating the link) */
  currentIcs: () => string;
}

const CalendarContext = createContext<CalendarStore | null>(null);
const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { storage, appRoot, band, mode, currentMember } = useSession();
  const member = useRef(currentMember?.id ?? 'unknown');
  member.current = currentMember?.id ?? 'unknown';
  const [store] = useState(() => {
    if (!storage || !appRoot || !band) throw new Error('CalendarProvider needs a ready session');
    return new CalendarStore({
      storage,
      appRoot,
      memberId: () => member.current,
      cacheKey: mode === 'demo' ? null : `bandapp.calendar.${band.id}`,
    });
  });
  useEffect(() => {
    void store.load();
    // refresh when the app comes back to the foreground
    const onVisible = () => document.visibilityState === 'visible' && void store.load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [store]);
  // Calendar subscription: keep band.ics current after changes (F5 §6.5b)
  const { t } = useTranslation('calendar');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subLoaded, setSubLoaded] = useState(false);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const currentIcs = () =>
    bandIcs(store.getState(), { title: (event) => event.title?.trim() || t(`types.${event.type}`), cancelledPrefix: `${t('cancelledEvent')}: ` }, band?.bandName ?? 'Band');
  const icsRef = useRef(currentIcs);
  icsRef.current = currentIcs;
  useEffect(() => {
    if (!storage || !appRoot) return;
    void readSubscription(storage, appRoot)
      .then(setSubscription)
      .catch(() => undefined)
      .finally(() => setSubLoaded(true));
  }, [storage, appRoot]);
  useEffect(() => {
    if (!subscription || !storage || !appRoot || state.status !== 'ready') return;
    const timer = setTimeout(() => {
      void writeBandIcs(storage, appRoot, icsRef.current(), mode === 'demo' ? null : `bandapp.calendar.ics.${band?.id}`).catch((error) =>
        console.warn('Updating band.ics failed', error),
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [subscription, state.events, state.exceptions, state.status, storage, appRoot, mode, band?.id]);

  return (
    <CalendarContext.Provider value={store}>
      <SubscriptionContext.Provider value={{ subscription, loaded: subLoaded, setSubscription, currentIcs }}>{children}</SubscriptionContext.Provider>
    </CalendarContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCalendar() {
  const store = useContext(CalendarContext);
  if (!store) throw new Error('useCalendar must be used inside CalendarProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, state };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCalendarSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useCalendarSubscription must be used inside CalendarProvider');
  return ctx;
}
