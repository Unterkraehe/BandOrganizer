import { useCallback } from 'react';
import { AlreadyExistsError, joinPath, type FileEntry } from '@/core/storage';
import { sanitizeFileName, uniqueName } from '@/core/uploads/names';
import type { UploadKind } from '@/core/uploads/validate';
import { useLibrary } from '../LibraryProvider';
import { useUploadQueue } from './UploadsProvider';

const LAST_KEY: Record<UploadKind, string> = { audio: 'bandapp.uploads.lastAudioFolder', lyrics: 'bandapp.uploads.lastLyricsFolder' };

export function lastFolder(kind: UploadKind): string | null {
  try {
    return localStorage.getItem(LAST_KEY[kind]);
  } catch {
    return null;
  }
}

function rememberFolder(kind: UploadKind, folder: string) {
  try {
    localStorage.setItem(LAST_KEY[kind], folder);
  } catch {
    // ignore
  }
}

/** Upload helpers (F10): create-only, unique names, background queue. */
export function useUploadActions() {
  const { store } = useLibrary();
  const queue = useUploadQueue();

  /** Writes a NEW file into `folder` (created on demand, create-only). Never overwrites (R-DATA-03). */
  const put = useCallback(
    async (folder: string, name: string, content: Blob, kind: UploadKind): Promise<FileEntry> => {
      rememberFolder(kind, folder);
      const clean = sanitizeFileName(name);
      return queue.run(clean, content.size, async (onProgress) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const finalName = await uniqueName(store.storage, folder, clean);
          try {
            return await store.storage.createFile(joinPath(folder, finalName), content, { onProgress });
          } catch (error) {
            if (!(error instanceof AlreadyExistsError)) throw error; // name taken meanwhile → next suffix
          }
        }
        throw new AlreadyExistsError(joinPath(folder, clean));
      });
    },
    [queue, store],
  );

  const uploadRecording = useCallback(
    async (songId: string, file: File, folder: string, options: { label?: string | null; makeBand?: boolean } = {}) => {
      const entry = await put(folder, file.name, file, 'audio');
      return store.attachRecording(songId, entry, options);
    },
    [put, store],
  );

  const uploadLyricsFile = useCallback(
    async (songId: string, file: File, folder: string) => {
      const entry = await put(folder, file.name, file, 'lyrics');
      await store.linkLyrics(songId, entry.path, entry.id);
    },
    [put, store],
  );

  /** Typed/edited lyrics → always a NEW .txt file (F10 §5.7). */
  const saveTypedLyrics = useCallback(
    async (songId: string, title: string, text: string, folder: string) => {
      const blob = new Blob([text.replace(/\r\n/g, '\n')], { type: 'text/plain;charset=utf-8' });
      const entry = await put(folder, `${title} - Text.txt`, blob, 'lyrics');
      await store.linkLyrics(songId, entry.path, entry.id);
    },
    [put, store],
  );

  /** Same name + size already on HiDrive? (F10 §5.5) */
  const findDuplicate = useCallback(
    (file: File, kind: 'audio' | 'lyrics') => {
      const list = kind === 'audio' ? store.getState().files : store.getState().documents;
      return list.find((f) => f.name.toLocaleLowerCase('de') === file.name.toLocaleLowerCase('de') && f.size === file.size) ?? null;
    },
    [store],
  );

  return { uploadRecording, uploadLyricsFile, saveTypedLyrics, findDuplicate };
}
