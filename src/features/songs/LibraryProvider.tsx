import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PlayerProvider } from '@/core/audio/PlayerProvider';
import { useSession } from '@/core/session/BandSession';
import { dirname } from '@/core/storage';
import { LibraryStore } from './library';
import { deriveSongs, type Song } from './model';

const LibraryContext = createContext<LibraryStore | null>(null);

/** Song library + player for the ready app. Scans in the background on every start (F1 §4). */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const { storage, band, appRoot, mode } = useSession();
  const [store] = useState(() => {
    if (!storage || !band || !appRoot) throw new Error('LibraryProvider needs a ready session');
    return new LibraryStore({
      storage,
      home: dirname(appRoot),
      skip: [appRoot, ...band.scan.excludedPaths],
      cacheKey: mode === 'demo' ? null : `bandapp.library.${band.id}`,
    });
  });

  useEffect(() => {
    void store.scan();
    return () => store.dispose();
  }, [store]);

  return (
    <LibraryContext.Provider value={store}>
      <PlayerProvider onDuration={(id, seconds) => store.setDuration(id, seconds)}>{children}</PlayerProvider>
    </LibraryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary() {
  const store = useContext(LibraryContext);
  if (!store) throw new Error('useLibrary must be used inside LibraryProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { appRoot } = useSession();
  const home = appRoot ? dirname(appRoot) : '/';
  const songs: Song[] = useMemo(() => deriveSongs(state.files, home, state.durations), [state.files, state.durations, home]);
  return { store, state, songs };
}
