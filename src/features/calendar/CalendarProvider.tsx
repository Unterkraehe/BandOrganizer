import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useSession } from '@/core/session/BandSession';
import { CalendarStore } from './store';

const CalendarContext = createContext<CalendarStore | null>(null);

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
  return <CalendarContext.Provider value={store}>{children}</CalendarContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCalendar() {
  const store = useContext(CalendarContext);
  if (!store) throw new Error('useCalendar must be used inside CalendarProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, state };
}
