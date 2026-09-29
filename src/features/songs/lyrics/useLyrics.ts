import { useEffect, useState } from 'react';
import { loadLyrics, type LyricsContent } from '@/core/lyrics/renderers';
import { useLibrary } from '../LibraryProvider';
import type { Song } from '../model';

/** Loads the linked lyrics of a song (F4 §6.3). */
export function useLyrics(song: Song | undefined) {
  const { store } = useLibrary();
  const [content, setContent] = useState<LyricsContent | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const lyrics = song?.lyrics;
  const path = lyrics && !lyrics.missing ? lyrics.path : null;
  const fileName = lyrics?.fileName ?? '';

  useEffect(() => {
    if (!path) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    store.storage
      .readBlob(path)
      .then((blob) => loadLyrics(blob, fileName))
      .then((loaded) => {
        if (cancelled) return;
        setContent(loaded);
        setStatus('idle');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [path, fileName, store]);

  return { content, status };
}
