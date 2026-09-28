import type { ScannedFile } from '@/core/files/scan';
import { extensionOf } from '@/core/files/scan';
import { basename, dirname } from '@/core/storage';

/** A song in the list (F4). In M2 derived from the scanned audio files only. */
export interface Song {
  id: string;
  title: string;
  fileName: string;
  path: string;
  /** Folder relative to the HiDrive home, e.g. "Songs" or "Proben/2026" */
  folder: string;
  size?: number;
  /** Used for "Zuletzt hinzugefügt" and "Neu" (file modification time in M2) */
  addedAt?: string;
  isNew: boolean;
  durationSec?: number;
}

export const NEW_DAYS = 14;

/** File name → readable title (F4 §6.2): "07_Hell_Is_Empty_(Demo).mp3" → "Hell Is Empty (Demo)". */
export function cleanTitle(fileName: string): string {
  const ext = extensionOf(fileName);
  const withoutExt = ext ? fileName.slice(0, -(ext.length + 1)) : fileName;
  const cleaned = withoutExt
    .replace(/_/g, ' ')
    .replace(/^\s*\d{1,3}\s*[-–.)]?\s+/, '') // leading track number "01 - ", "03 "
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || withoutExt || fileName;
}

/** 32-bit FNV-1a → base36; deterministic across devices (F4 §6.1). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

export function songIdFor(file: Pick<ScannedFile, 'id' | 'path'>): string {
  return `song_${hash(file.id ?? file.path)}`;
}

export function relativeFolder(path: string, home: string): string {
  const folder = dirname(path);
  if (folder === home) return '';
  return folder.startsWith(home + '/') ? folder.slice(home.length + 1) : folder;
}

export function deriveSongs(
  files: ScannedFile[],
  home: string,
  durations: Record<string, number>,
  now = Date.now(),
): Song[] {
  return files.map((file) => {
    const id = songIdFor(file);
    const added = file.modifiedAt ? Date.parse(file.modifiedAt) : NaN;
    return {
      id,
      title: cleanTitle(file.name || basename(file.path)),
      fileName: file.name || basename(file.path),
      path: file.path,
      folder: relativeFolder(file.path, home),
      size: file.size,
      addedAt: file.modifiedAt,
      isNew: Number.isFinite(added) && now - added < NEW_DAYS * 86_400_000,
      durationSec: durations[id],
    };
  });
}

export type SongSort = 'az' | 'recent';

export function sortSongs(songs: Song[], sort: SongSort): Song[] {
  const copy = [...songs];
  if (sort === 'recent') return copy.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.title.localeCompare(b.title, 'de'));
  return copy.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base', numeric: true }));
}
