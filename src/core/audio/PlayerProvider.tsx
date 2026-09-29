import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useSession } from '@/core/session/BandSession';
import { AudioEngine, type PlayerState, type PracticeSettings, type Track } from './engine';

const PlayerContext = createContext<AudioEngine | null>(null);

/** One audio engine for the whole app session (R-UX-08). Disposed on profile switch/disconnect. */
export function PlayerProvider({
  children,
  onDuration,
  onSettingsChange,
}: {
  children: ReactNode;
  onDuration?: (track: Track, seconds: number) => void;
  onSettingsChange?: (track: Track, settings: PracticeSettings) => void;
}) {
  const { storage, band } = useSession();
  const [engine] = useState(
    () =>
      new AudioEngine({
        loadBlob: (path) => {
          if (!storage) return Promise.reject(new Error('No storage'));
          return storage.readBlob(path);
        },
        onDuration: (track, seconds) => onDuration?.(track, seconds),
        onSettingsChange: (track, settings) => onSettingsChange?.(track, settings),
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

const shallowEqual = (a: unknown, b: unknown) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/**
 * Subscribes to a SLICE of the player state. The position changes ~4 times a second while playing –
 * components that only need "which track / playing?" must not re-render for that (list performance).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerSelect<T>(select: (state: PlayerState) => T): T {
  const engine = useContext(PlayerContext);
  if (!engine) throw new Error('usePlayerSelect must be used inside PlayerProvider');
  const cache = useRef<{ state: PlayerState; value: T } | null>(null);
  const selectRef = useRef(select);
  selectRef.current = select;
  const getSnapshot = useCallback(() => {
    const state = engine.getState();
    if (cache.current?.state === state) return cache.current.value;
    const value = selectRef.current(state);
    const stable = cache.current && shallowEqual(cache.current.value, value) ? cache.current.value : value;
    cache.current = { state, value: stable };
    return stable;
  }, [engine]);
  return useSyncExternalStore(engine.subscribe, getSnapshot);
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerEngine(): AudioEngine {
  const engine = useContext(PlayerContext);
  if (!engine) throw new Error('usePlayerEngine must be used inside PlayerProvider');
  return engine;
}
