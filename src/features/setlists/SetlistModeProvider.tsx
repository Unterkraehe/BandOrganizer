import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePlayer } from '@/core/audio/PlayerProvider';
import type { Song } from '@/features/songs/model';
import { usePlaySong } from '@/features/songs/usePlaySong';
import { songEntries, type Setlist, type SongEntry } from './model';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';

/** Setlist mode (F3 §5): a setlist as practice/rehearsal queue. Device-local state. */

const KEY = 'bandapp.setlistMode';

interface QueueItem {
  entry: SongEntry;
  song: Song | undefined;
  playable: boolean;
}

interface ModeValue {
  setlist: Setlist | null;
  queue: QueueItem[];
  /** index of the playing/last played queue item */
  index: number;
  autoAdvance: boolean;
  start: (setlistId: string) => void;
  end: () => void;
  setAutoAdvance: (value: boolean) => void;
  playAt: (index: number) => void;
  next: () => void;
  previous: () => void;
}

const Ctx = createContext<ModeValue | null>(null);

function readState(): { setlistId: string | null; autoAdvance: boolean; index: number } {
  try {
    return { setlistId: null, autoAdvance: true, index: 0, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as object) };
  } catch {
    return { setlistId: null, autoAdvance: true, index: 0 };
  }
}

export function SetlistModeProvider({ children }: { children: ReactNode }) {
  const { setlists } = useSetlists();
  const { songById } = useSetlistInfo();
  const { play } = usePlaySong();
  const { state: player } = usePlayer();
  const [mode, setMode] = useState(readState);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(mode));
    } catch {
      // ignore
    }
  }, [mode]);

  const setlist = setlists.find((s) => s.id === mode.setlistId) ?? null;
  const queue: QueueItem[] = useMemo(
    () =>
      setlist
        ? songEntries(setlist).map((entry) => {
            const song = songById.get(entry.songId);
            return { entry, song, playable: Boolean(song?.recording && !song.recording.missing) };
          })
        : [],
    [setlist, songById],
  );

  // follow the player: if the playing song is in the queue, that's the current position
  const trackSongId = player.track?.songId;
  useEffect(() => {
    if (!trackSongId) return;
    const i = queue.findIndex((q, idx) => q.song?.id === trackSongId && (idx >= mode.index || !queue.slice(mode.index).some((x) => x.song?.id === trackSongId)));
    if (i >= 0 && i !== mode.index) setMode((m) => ({ ...m, index: i }));
  }, [trackSongId, queue]); // eslint-disable-line react-hooks/exhaustive-deps

  const playAt = useCallback(
    (index: number) => {
      const item = queue[index];
      if (!item?.song || !item.playable) return;
      setMode((m) => ({ ...m, index }));
      play(item.song);
    },
    [queue, play],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      for (let i = mode.index + dir; i >= 0 && i < queue.length; i += dir) {
        if (queue[i]!.playable) return playAt(i);
      }
    },
    [mode.index, queue, playAt],
  );

  // auto-advance; a direct transition (red arrow) always continues (F7 §6.2)
  const lastEnded = useRef(player.ended);
  useEffect(() => {
    if (player.ended === lastEnded.current) return;
    lastEnded.current = player.ended;
    const current = queue[mode.index];
    if (!setlist || !current || current.song?.id !== trackSongId) return;
    if (mode.autoAdvance || current.entry.segueToNext) step(1);
  }, [player.ended]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: ModeValue = {
    setlist,
    queue,
    index: mode.index,
    autoAdvance: mode.autoAdvance,
    start: (setlistId) => setMode((m) => ({ ...m, setlistId, index: 0 })),
    end: () => setMode((m) => ({ ...m, setlistId: null, index: 0 })),
    setAutoAdvance: (autoAdvance) => setMode((m) => ({ ...m, autoAdvance })),
    playAt,
    next: () => step(1),
    previous: () => step(-1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSetlistMode() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSetlistMode must be used inside SetlistModeProvider');
  return value;
}
