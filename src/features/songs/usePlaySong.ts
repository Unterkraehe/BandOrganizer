import { useCallback } from 'react';
import { usePlayer } from '@/core/audio/PlayerProvider';
import { useLibrary } from './LibraryProvider';
import type { Recording, Song } from './model';

/** Plays a song (Band-Version by default) from a tap: unlocks audio synchronously first (iOS). */
export function usePlaySong() {
  const { engine, state } = usePlayer();
  const { store } = useLibrary();
  const play = useCallback(
    (song: Song, recording: Recording | null = song.recording, startAt?: number) => {
      if (!recording || recording.missing) return;
      engine.unlock(); // synchronously inside the tap (iOS)
      const track = {
        id: recording.id,
        songId: song.id,
        title: song.title,
        subtitle: recording.label ?? (recording.folder || undefined),
        path: recording.path,
      };
      if (engine.getState().track?.id === recording.id) {
        void engine.playTrack(track, startAt);
        return;
      }
      // remembered tempo / pitch / loop of this member for this version (F4 §7.4)
      void store.practice.settingsFor(song.id, recording.id).then((settings) => engine.playTrack(track, startAt, settings));
    },
    [engine, store],
  );
  const isCurrent = (song: Song) => state.track?.songId === song.id;
  const isPlaying = (song: Song) => isCurrent(song) && (state.status === 'playing' || state.status === 'loading');
  return { play, isCurrent, isPlaying, state, engine };
}
