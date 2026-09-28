import { useCallback } from 'react';
import { usePlayer } from '@/core/audio/PlayerProvider';
import type { Song } from './model';

/** Plays a song from a tap: unlocks audio synchronously first (iOS), then loads (F9). */
export function usePlaySong() {
  const { engine, state } = usePlayer();
  const play = useCallback(
    (song: Song) => {
      engine.unlock();
      void engine.playTrack({ id: song.id, title: song.title, subtitle: song.folder || undefined, path: song.path });
    },
    [engine],
  );
  const isCurrent = (song: Song) => state.track?.id === song.id;
  const isPlaying = (song: Song) => isCurrent(song) && (state.status === 'playing' || state.status === 'loading');
  return { play, isCurrent, isPlaying, state };
}
