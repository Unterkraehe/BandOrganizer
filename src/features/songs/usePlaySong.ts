import { useCallback } from 'react';
import { usePlayer } from '@/core/audio/PlayerProvider';
import type { Recording, Song } from './model';

/** Plays a song (Band-Version by default) from a tap: unlocks audio synchronously first (iOS). */
export function usePlaySong() {
  const { engine, state } = usePlayer();
  const play = useCallback(
    (song: Song, recording: Recording = song.recording, startAt?: number) => {
      if (recording.missing) return;
      engine.unlock();
      void engine.playTrack({
        id: recording.id,
        songId: song.id,
        title: song.title,
        subtitle: recording.label ?? (recording.folder || undefined),
        path: recording.path,
      }, startAt);
    },
    [engine],
  );
  const isCurrent = (song: Song) => state.track?.songId === song.id;
  const isPlaying = (song: Song) => isCurrent(song) && (state.status === 'playing' || state.status === 'loading');
  return { play, isCurrent, isPlaying, state, engine };
}
