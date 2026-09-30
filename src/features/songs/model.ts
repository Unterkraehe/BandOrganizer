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
  /** original artist of a cover song ("Interpret" on the printed setlist) – optional, added in v0.12.1 */
  artist?: string | null;
  lyrics: { fileId?: string; path: string } | null;
  /** earlier lyrics links, newest first (F10 §5.7 "Frühere Fassungen") */
  lyricsHistory?: { path: string; savedAt: string; savedBy: string }[];
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

export interface SongLyrics {
  path: string;
  fileName: string;
  ext: string;
  missing: boolean;
}

export interface Song {
  id: string;
  title: string;
  /** Band-Version (F4 §6.8); null for songs created in the app without a recording yet (F10 §5.2) */
  recording: Recording | null;
  recordings: Recording[];
  key: string | null;
  bpm: number | null;
  tuning: string | null;
  artist: string | null;
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
  lyrics: SongLyrics | null;
  lyricsHistory: { path: string; savedAt: string; savedBy: string }[];
  source: 'scan' | 'app';
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
    // track numbers: "01-Holy Diver", "01 Holy Diver", "3. Song", "12 - Song" – but not "18 and life"
    .replace(/^\s*(\d{1,3}\s*[-–.)]\s*|0\d\s+)(?=\D)/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || withoutExt || fileName;
}

/** Words that describe a version of a song rather than the song itself (v0.12.3). */
const VERSION_WORDS = new Set(
  (
    'edit edited mix remix mixdown mastered master remaster remastered version ver v take final demo live probe proben ' +
    'rehearsal akustik acoustic unplugged instrumental instr radio extended backing backingtrack playback karaoke ' +
    'click klick fassung gesang vocals voc bearbeitet bearb aufnahme recording rec bounce export jam session test ' +
    'idee skizze sketch kopie stereo mono mp3 wav'
  ).split(' '),
);

/** Trailing version words and numbers/dates are not part of the title: "Hush edit 05" → "hush". */
function stripVersionWords(normalized: string): string {
  const words = normalized.split(' ').filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1]!;
    if (VERSION_WORDS.has(last) || /^\d+$/.test(last) || /^(v|take|t)\d+$/.test(last)) words.pop();
    else break;
  }
  return words.join(' ');
}

/**
 * Base title for version suggestions: without additions in brackets and without trailing version
 * words or numbers. "Slow Burn (Live)" → "slow burn", "Hush edit 05" → "hush", "Hush_Probe_17.05.26" → "hush".
 */
export function baseTitle(title: string): string {
  return stripVersionWords(normalizeText(title.replace(/\s*[([].*?[)\]]\s*/g, ' ')));
}

/** All base titles a title can stand for: the whole title and, for "Artist - Title", each part. */
export function baseTitles(title: string): string[] {
  const keys = new Set([baseTitle(title)]);
  const parts = title.split(/\s+[-–]\s+/);
  if (parts.length > 1) for (const part of parts) {
    const key = baseTitle(part);
    if (key.replace(/ /g, '').length >= 3) keys.add(key);
  }
  keys.delete('');
  return [...keys];
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
export function buildSongs(
  files: ScannedFile[],
  metas: Record<string, SongMeta>,
  home: string,
  now = Date.now(),
  documents?: ScannedFile[],
): Song[] {
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

  // 2b. Files listed in a song's meta belong to that song (e.g. uploads into app-created songs, F10)
  const claimedBy = new Map<string, string>();
  for (const [songId, meta] of Object.entries(metas)) {
    if (meta.mergedInto) continue;
    for (const rec of meta.recordings) if (!claimedBy.has(rec.id)) claimedBy.set(rec.id, songId);
  }
  for (const ref of byRecordingId.values()) {
    const claimer = claimedBy.get(ref.recordingId);
    if (claimer && claimer !== ref.originSongId && !metas[ref.originSongId]) ref.originSongId = claimer;
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
    if (!meta.mergedInto && !groups.has(songId) && (meta.recordings.length > 0 || meta.source === 'app')) groups.set(songId, []);
  }
  const docPaths = documents ? new Set(documents.map((d) => d.path)) : null;

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
    if (recordings.length === 0 && meta?.source !== 'app') continue;

    const present = recordings.filter((r) => !r.missing);
    const origin = recordings.find((r) => r.originSongId === songId) ?? recordings[0] ?? null;
    const bandId = meta?.bandVersion?.recordingId;
    const bandRecording =
      recordings.find((r) => r.id === bandId && !r.missing) ?? (origin && !origin.missing ? origin : present[0]) ?? origin;

    const addedAt = recordings.map((r) => r.addedAt ?? '').sort()[0] || meta?.createdAt || undefined;
    const added = addedAt ? Date.parse(addedAt) : NaN;
    const title = meta?.displayTitle?.trim() || (origin ? cleanTitle(origin.fileName) : '?');
    const lyricsName = meta?.lyrics ? basename(meta.lyrics.path) : '';

    songs.push({
      id: songId,
      title,
      recording: bandRecording,
      recordings,
      key: meta?.key ?? null,
      bpm: meta?.bpm ?? null,
      tuning: meta?.tuning ?? null,
      artist: meta?.artist ?? null,
      tagIds: meta?.tagIds ?? [],
      archived: meta?.archived ?? false,
      hidden: meta?.hidden ?? false,
      searchText: [title, meta?.artist ?? '', ...recordings.map((r) => `${r.fileName} ${r.label ?? ''} ${r.folder}`)].join(' '),
      addedAt,
      isNew: Number.isFinite(added) && now - added < NEW_DAYS * 86_400_000,
      missing: recordings.length > 0 && present.length === 0,
      hasMeta: Boolean(meta),
      bandVersionSetBy: meta?.bandVersion?.setBy ?? null,
      bandVersionSetAt: meta?.bandVersion?.setAt ?? null,
      mergedSongIds: meta?.mergedSongIds ?? [],
      lyrics: meta?.lyrics
        ? {
            path: meta.lyrics.path,
            fileName: lyricsName,
            ext: extensionOf(lyricsName),
            missing: docPaths ? !docPaths.has(meta.lyrics.path) : false,
          }
        : null,
      lyricsHistory: meta?.lyricsHistory ?? [],
      source: meta?.source ?? 'scan',
    });
  }
  return songs;
}

/** Display name of a version: its label or the file name. */
export const recordingName = (recording: Recording) => recording.label ?? recording.fileName;

export type SongSort = 'az' | 'recent';

// One shared collator: `localeCompare(…, 'de', options)` builds a new one on every call (slow with hundreds of songs).
const titleCollator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
const plainCollator = new Intl.Collator('de');

export function sortSongs(songs: Song[], sort: SongSort): Song[] {
  const copy = [...songs];
  if (sort === 'recent') return copy.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || plainCollator.compare(a.title, b.title));
  return copy.sort((a, b) => titleCollator.compare(a.title, b.title));
}

/** Other songs that look like versions of this one (same title without bracket additions). */
/**
 * Words that mark a version or a part of a recording – ignored ANYWHERE when comparing titles for
 * version suggestions ("Holy Diver Intro edit 05 ohne Intro" ~ "Holy Diver"). Only used for suggestions.
 */
const SUGGESTION_NOISE = new Set([...VERSION_WORDS, 'ohne', 'mit', 'intro', 'outro', 'solo', 'teil', 'part', 'neu', 'new', 'alt', 'old', 'kurz', 'short', 'lang', 'long', 'full', 'ganz']);

/** Compact core of a title for similarity: no numbers, no version words, no spaces ("Holy Diver edit 05" → "holydiver"). */
export function titleCore(title: string): string {
  const words = normalizeText(cleanTitle(title).replace(/\s*[([].*?[)\]]\s*/g, ' '))
    .split(' ')
    .filter((w) => w && !/^\d+$/.test(w) && !/^(v|take|t)\d+$/.test(w) && !SUGGESTION_NOISE.has(w));
  return words.join('');
}

function longestCommonSubstring(a: string, b: string): number {
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j]! > best) best = prev[j]!;
      diag = tmp;
    }
  }
  return best;
}

/**
 * Two title cores probably name the same song (v0.12.4):
 * - short titles (< 6 letters, e.g. "hush") must be equal,
 * - otherwise one contains the other ("holydiver" in "dioholydiver"), or they share a long common
 *   part (≥ 75 % of the shorter one: "dioholydiver" ~ "holydiverdio").
 */
export function similarCores(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 6) return false;
  if (long.includes(short)) return true;
  return longestCommonSubstring(short, long) >= Math.max(6, Math.ceil(short.length * 0.75));
}

/** All cores a song can be recognised by: its title and the names of all its files. */
export function songCores(song: Pick<Song, 'title' | 'recordings'>): string[] {
  const cores = new Set([titleCore(song.title), ...song.recordings.map((r) => titleCore(r.fileName))]);
  cores.delete('');
  return [...cores];
}

export function areSimilarSongs(a: Pick<Song, 'title' | 'recordings'>, b: Pick<Song, 'title' | 'recordings'>): boolean {
  const cb = songCores(b);
  return songCores(a).some((x) => cb.some((y) => similarCores(x, y)));
}

export function versionSuggestions(song: Song, all: Song[]): Song[] {
  const mine = songCores(song);
  if (mine.length === 0) return [];
  return all.filter((other) => {
    if (other.id === song.id || other.hidden || !other.recording) return false;
    const theirs = songCores(other);
    return mine.some((x) => theirs.some((y) => similarCores(x, y)));
  });
}

/** Unlinked lyrics documents whose name matches the song title (F4 §6.3 – suggestion only). */
export function lyricsSuggestions(song: Song, documents: ScannedFile[], linkedPaths: Set<string>): ScannedFile[] {
  const base = baseTitle(song.title);
  if (!base) return [];
  return documents.filter((doc) => !linkedPaths.has(doc.path) && baseTitle(cleanTitle(doc.name).replace(/\s*-\s*(songtext|text|lyrics)\b.*$/i, '')) === base);
}

export const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
export const TUNING_SUGGESTIONS = ['Standard', 'Drop D', 'Eb-Standard', 'Drop C#', 'D-Standard', 'Drop C', 'Open G', 'DADGAD'];
