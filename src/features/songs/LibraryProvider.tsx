import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PlayerProvider } from '@/core/audio/PlayerProvider';
import { useSession } from '@/core/session/BandSession';
import { dirname } from '@/core/storage';
import { DEFAULT_SUGGESTION_FOLDERS } from '@/core/band/band';
import { LibraryStore } from './library';
import { onAppResume } from '@/core/resume';

const LibraryContext = createContext<LibraryStore | null>(null);

/** Song library + player for the ready app. Loads data and scans in the background (F1 §4). */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const { storage, band, appRoot, mode, currentMember } = useSession();
  const memberRef = useRef(currentMember?.id ?? 'unknown');
  memberRef.current = currentMember?.id ?? 'unknown';
  const [store] = useState(() => {
    if (!storage || !band || !appRoot) throw new Error('LibraryProvider needs a ready session');
    return new LibraryStore({
      storage,
      home: dirname(appRoot),
      appRoot,
      skip: [appRoot, ...band.scan.excludedPaths],
      cacheKey: mode === 'demo' ? null : `bandapp.library.${band.id}`,
      memberId: () => memberRef.current,
      suggestionFolders: band.scan.suggestionFolders ?? DEFAULT_SUGGESTION_FOLDERS,
    });
  });
  const suggestionFolders = band?.scan.suggestionFolders ?? DEFAULT_SUGGESTION_FOLDERS;
  useEffect(() => store.setSuggestionFolders(suggestionFolders), [store, suggestionFolders]);

  useEffect(() => {
    void store.load();
    // back after a while: fresh song data from the band; a new file scan only if the last one is old
    const off = onAppResume(() => {
      void store.reloadMeta();
      const last = store.getState().scannedAt;
      if (!last || Date.now() - Date.parse(last) > 6 * 3_600_000) void store.scan();
    });
    return () => {
      off();
      void store.practice.flush();
      store.dispose();
    };
  }, [store]);

  return (
    <LibraryContext.Provider value={store}>
      <PlayerProvider
        onDuration={(track, seconds) => track.songId && void store.recordDuration(track.songId, track.id, seconds)}
        onSettingsChange={(track, settings) => track.songId && store.practice.save(track.songId, track.id, settings)}
      >
        {children}
      </PlayerProvider>
    </LibraryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary() {
  const store = useContext(LibraryContext);
  if (!store) throw new Error('useLibrary must be used inside LibraryProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, state, songs: state.songs, tags: state.tags.map((t) => t.value) };
}
