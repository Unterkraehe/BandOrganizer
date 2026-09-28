import type { ScannedFile } from '@/core/files/scan';
import { extensionOf } from '@/core/files/scan';
import type { RecordBase } from '@/core/data/record';
import { normalizeText } from '@/core/search/normalize';
import { basename, dirname } from '@/core/storage';

/* ------------------------------------------------------------------ */
/* Stored data (F4 §7)                                                 */
/* ------------------------------------------------------------------ */

export interface MetaRecording {
  /** deterministic: r_ + hash(fileId ?? path) */
  id: string;
  fileId?: string;
  path: string;
  size?: number;
  label: string | null;
  durationSec?: number;
  firstSeenAt?: string;
}

/** `_BandApp/songs/<songId>/meta.json` – created lazily when something is saved (F4 §5). */
export interface SongMeta extends RecordBase {
  displayTitle: string | null;
  recordings: MetaRecording[];
  bandVersion: { recordingId: string; setBy: string; setAt: string } | null;
  mergedSongIds: string[];
  mergedInto: string | null;
  key: string | null;
  bpm: number | null;
  tuning: string | null;
  lyrics: { fileId?: string; path: string } | null;
  hidden: boolean;
  archived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  tagIds: string[];
  source: 'scan' | 'app';
}

export const SONG_SCHEMA_VERSION = 1;

/** `_BandApp/tags/<tagId>.json` (F4 §7.3) */
export interface Tag extends RecordBase {
  name: string;
}

/** `songs/<songId>/notes/(public|private/<memberId>)/<noteId>.json` (F4 §7.2) */
export interface SongNote extends RecordBase {
  text: string;
  positionSec: number | null;
  recordingId: string | null;
  pinned: boolean;
}

export const NOTE_MAX_LENGTH = 2000;

/* ------------------------------------------------------------------ */
/* View model                                                          */
/* ------------------------------------------------------------------ */

export interface Recording {
  id: string;
  path: string;
  fileName: string;
  /** Folder relative to the HiDrive home */
  folder: string;
  size?: number;
  label: string | null;
  durationSec?: number;
  /** song the file originally belonged to (for splitting) */
  originSongId: string;
  missing: boolean;
  addedAt?: string;
}

export interface Song {
  id: string;
  title: string;
  /** Band-Version (F4 §6.8) */
  recording: Recording;
  recordings: Recording[];
  key: string | null;
  bpm: number | null;
  tuning: string | null;
  tagIds: string[];
  archived: boolean;
  hidden: boolean;
  /** all file names / path parts, for search */
  searchText: string;
  addedAt?: string;
  isNew: boolean;
  /** true if none of the files exists any more */
  missing: boolean;
  hasMeta: boolean;
  bandVersionSetBy: string | null;
  bandVersionSetAt: string | null;
  mergedSongIds: string[];
}

export const NEW_DAYS = 14;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** File name → readable title (F4 §6.2): "07_Hell_Is_Empty_(Demo).mp3" → "Hell Is Empty (Demo)". */
export function cleanTitle(fileName: string): string {
  const ext = extensionOf(fileName);
  const withoutExt = ext ? fileName.slice(0, -(ext.length + 1)) : fileName;
  const cleaned = withoutExt
    .replace(/_/g, ' ')
    .replace(/^\s*\d{1,3}\s*[-–.)]?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || withoutExt || fileName;
}

/** Title without additions in brackets, for version suggestions: "Slow Burn (Live)" → "slow burn". */
export function baseTitle(title: string): string {
  return normalizeText(title.replace(/\s*[([].*?[)\]]\s*/g, ' '));
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

/** Deterministic across devices (F4 §6.1). */
export const songIdFor = (file: Pick<ScannedFile, 'id' | 'path'>) => `song_${hash(file.id ?? file.path)}`;
export const recordingIdFor = (file: Pick<ScannedFile, 'id' | 'path'>) => `r_${hash(file.id ?? file.path)}`;

export function relativeFolder(path: string, home: string): string {
  const folder = dirname(path);
  if (folder === home) return '';
  return folder.startsWith(home + '/') ? folder.slice(home.length + 1) : folder;
}

/* ------------------------------------------------------------------ */
/* Building the song list from scan + stored metadata                  */
/* ------------------------------------------------------------------ */

interface FileRef {
  file: ScannedFile;
  recordingId: string;
  originSongId: string;
}

/**
 * Combines scanned files and meta.json records into songs (F4 §5, §6.1, §6.8).
 * Robust against partial writes: a file whose origin song is merged into another song
 * always shows up as a version of that song, even if the target's meta lacks it.
 */
export function buildSongs(files: ScannedFile[], metas: Record<string, SongMeta>, home: string, now = Date.now()): Song[] {
  // 1. Every file with its deterministic ids
  const refs: FileRef[] = files.map((file) => ({ file, recordingId: recordingIdFor(file), originSongId: songIdFor(file) }));
  const byRecordingId = new Map(refs.map((ref) => [ref.recordingId, ref]));

  // 2. Re-match stored recordings whose file moved/renamed and got a new id (fallback for spike S2)
  const claimed = new Set<string>();
  for (const [songId, meta] of Object.entries(metas)) {
    for (const rec of meta.recordings) {
      if (byRecordingId.has(rec.id)) {
        claimed.add(rec.id);
        continue;
      }
      const name = basename(rec.path);
      const candidate = refs.find(
        (ref) =>
          !claimed.has(ref.recordingId) &&
          !metas[ref.originSongId] &&
          ref.file.name === name &&
          (rec.size === undefined || ref.file.size === rec.size),
      );
      if (candidate) {
        claimed.add(candidate.recordingId);
        byRecordingId.delete(candidate.recordingId);
        candidate.recordingId = rec.id;
        candidate.originSongId = songId;
        byRecordingId.set(rec.id, candidate);
      }
    }
  }

  // 3. Owner song of every file (follow mergedInto)
  const ownerOf = (songId: string) => {
    let id = songId;
    for (let i = 0; i < 5; i++) {
      const next = metas[id]?.mergedInto;
      if (!next || next === id) break;
      id = next;
    }
    return id;
  };

  const groups = new Map<string, FileRef[]>();
  for (const ref of byRecordingId.values()) {
    const owner = ownerOf(ref.originSongId);
    groups.set(owner, [...(groups.get(owner) ?? []), ref]);
  }
  // songs that only exist as metadata (all files gone) – shown as missing if they aren't merged away
  for (const [songId, meta] of Object.entries(metas)) {
    if (!meta.mergedInto && !groups.has(songId) && meta.recordings.length > 0) groups.set(songId, []);
  }

  const songs: Song[] = [];
  for (const [songId, group] of groups) {
    const meta = metas[songId];
    const recordingsById = new Map<string, Recording>();

    const storedRec = (recId: string): MetaRecording | undefined => {
      const own = meta?.recordings.find((r) => r.id === recId);
      if (own) return own;
      for (const mergedId of meta?.mergedSongIds ?? []) {
        const found = metas[mergedId]?.recordings.find((r) => r.id === recId);
        if (found) return found;
      }
      return undefined;
    };

    for (const ref of group) {
      const stored = storedRec(ref.recordingId);
      recordingsById.set(ref.recordingId, {
        id: ref.recordingId,
        path: ref.file.path,
        fileName: ref.file.name,
        folder: relativeFolder(ref.file.path, home),
        size: ref.file.size,
        label: stored?.label ?? null,
        durationSec: stored?.durationSec,
        originSongId: ref.originSongId,
        missing: false,
        addedAt: stored?.firstSeenAt ?? ref.file.modifiedAt,
      });
    }
    for (const stored of meta?.recordings ?? []) {
      if (recordingsById.has(stored.id)) continue;
      recordingsById.set(stored.id, {
        id: stored.id,
        path: stored.path,
        fileName: basename(stored.path),
        folder: relativeFolder(stored.path, home),
        size: stored.size,
        label: stored.label,
        durationSec: stored.durationSec,
        originSongId: songId,
        missing: true,
        addedAt: stored.firstSeenAt,
      });
    }

    const recordings = [...recordingsById.values()].sort((a, b) => {
      if (a.originSongId === songId && b.originSongId !== songId) return -1;
      if (b.originSongId === songId && a.originSongId !== songId) return 1;
      return (a.addedAt ?? '').localeCompare(b.addedAt ?? '');
    });
    if (recordings.length === 0) continue;

    const present = recordings.filter((r) => !r.missing);
    const origin = recordings.find((r) => r.originSongId === songId) ?? recordings[0]!;
    const bandId = meta?.bandVersion?.recordingId;
    const bandRecording =
      recordings.find((r) => r.id === bandId && !r.missing) ?? (origin.missing ? present[0] : origin) ?? origin;

    const addedAt = recordings.map((r) => r.addedAt ?? '').sort()[0] || undefined;
    const added = addedAt ? Date.parse(addedAt) : NaN;
    const title = meta?.displayTitle?.trim() || cleanTitle(origin.fileName);

    songs.push({
      id: songId,
      title,
      recording: bandRecording,
      recordings,
      key: meta?.key ?? null,
      bpm: meta?.bpm ?? null,
      tuning: meta?.tuning ?? null,
      tagIds: meta?.tagIds ?? [],
      archived: meta?.archived ?? false,
      hidden: meta?.hidden ?? false,
      searchText: [title, ...recordings.map((r) => `${r.fileName} ${r.label ?? ''} ${r.folder}`)].join(' '),
      addedAt,
      isNew: Number.isFinite(added) && now - added < NEW_DAYS * 86_400_000,
      missing: present.length === 0,
      hasMeta: Boolean(meta),
      bandVersionSetBy: meta?.bandVersion?.setBy ?? null,
      bandVersionSetAt: meta?.bandVersion?.setAt ?? null,
      mergedSongIds: meta?.mergedSongIds ?? [],
    });
  }
  return songs;
}

/** Display name of a version: its label or the file name. */
export const recordingName = (recording: Recording) => recording.label ?? recording.fileName;

export type SongSort = 'az' | 'recent';

export function sortSongs(songs: Song[], sort: SongSort): Song[] {
  const copy = [...songs];
  if (sort === 'recent') return copy.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.title.localeCompare(b.title, 'de'));
  return copy.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base', numeric: true }));
}

/** Other songs that look like versions of this one (same title without bracket additions). */
export function versionSuggestions(song: Song, all: Song[]): Song[] {
  const base = baseTitle(song.title);
  if (!base) return [];
  return all.filter((other) => other.id !== song.id && !other.hidden && baseTitle(other.title) === base);
}

export const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
export const TUNING_SUGGESTIONS = ['Standard', 'Drop D', 'Eb-Standard', 'Drop C#', 'D-Standard', 'Drop C', 'Open G', 'DADGAD'];
