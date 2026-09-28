import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useSession } from '@/core/session/BandSession';
import { AudioEngine, type PlayerState, type Track } from './engine';

const PlayerContext = createContext<AudioEngine | null>(null);

/** One audio engine for the whole app session (R-UX-08). Disposed on profile switch/disconnect. */
export function PlayerProvider({ children, onDuration }: { children: ReactNode; onDuration?: (track: Track, seconds: number) => void }) {
  const { storage, band } = useSession();
  const [engine] = useState(
    () =>
      new AudioEngine({
        loadBlob: (path) => {
          if (!storage) return Promise.reject(new Error('No storage'));
          return storage.readBlob(path);
        },
        onDuration: (track, seconds) => onDuration?.(track, seconds),
        artist: band?.bandName,
      }),
  );
  useEffect(() => () => engine.dispose(), [engine]);
  return <PlayerContext.Provider value={engine}>{children}</PlayerContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer(): { engine: AudioEngine; state: PlayerState } {
  const engine = useContext(PlayerContext);
  if (!engine) throw new Error('usePlayer must be used inside PlayerProvider');
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  return { engine, state };
}
