import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useSession } from '@/core/session/BandSession';
import { SetlistStore } from './store';

const Ctx = createContext<SetlistStore | null>(null);

export function SetlistProvider({ children }: { children: ReactNode }) {
  const { storage, appRoot, band, mode, currentMember } = useSession();
  const member = useRef(currentMember?.id ?? 'unknown');
  member.current = currentMember?.id ?? 'unknown';
  const [store] = useState(() => {
    if (!storage || !appRoot || !band) throw new Error('SetlistProvider needs a ready session');
    return new SetlistStore({ storage, appRoot, memberId: () => member.current, cacheKey: mode === 'demo' ? null : `bandapp.setlists.${band.id}` });
  });
  useEffect(() => {
    void store.load();
  }, [store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSetlists() {
  const store = useContext(Ctx);
  if (!store) throw new Error('useSetlists must be used inside SetlistProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, state, setlists: state.setlists.map((s) => s.value).filter((s) => !s.deletedAt) };
}
