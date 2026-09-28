import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/core/session/BandSession';
import { useLibrary } from './LibraryProvider';
import type { Song } from './model';
import { createNote, listNotes, saveNote, type NoteEntry, type NoteScope } from './repository';

/** Notes of a song incl. merged songs (F4 §6.4, §6.8). Loaded when the song is opened. */
export function useSongNotes(song: Song | undefined) {
  const { store } = useLibrary();
  const { currentMember } = useSession();
  const memberId = currentMember?.id ?? 'unknown';
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const songIds = song ? [song.id, ...song.mergedSongIds] : [];
  const key = songIds.join(',');

  const reload = useCallback(async () => {
    if (!key) return;
    try {
      setEntries(await listNotes(store.storage, store.appRoot, key.split(','), memberId));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [key, memberId, store]);

  useEffect(() => {
    setStatus('loading');
    void reload();
  }, [reload]);

  const replace = (next: NoteEntry) =>
    setEntries((list) => {
      const others = list.filter((e) => e.note.id !== next.note.id);
      return next.note.deletedAt ? others : [...others, next];
    });

  return {
    status,
    entries,
    memberId,
    add: async (scope: NoteScope, text: string, positionSec: number | null, recordingId: string | null) => {
      if (!song) return;
      replace(await createNote(store.storage, store.appRoot, song.id, scope, memberId, { text, positionSec, recordingId }));
    },
    change: async (entry: NoteEntry, change: 'edit' | 'pin' | 'unpin' | 'delete' | 'restore', text?: string) => {
      const saved = await saveNote(store.storage, store.appRoot, entry, memberId, change, text);
      replace(saved);
      return saved;
    },
  };
}
