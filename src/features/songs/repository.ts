import { newId } from '@/core/data/ids';
import { migrate } from '@/core/data/migrate';
import { nowIso, restore, softDelete, touchRecord } from '@/core/data/record';
import type { Versioned } from '@/core/band/band';
import { AlreadyExistsError, ConflictError, joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import { sameName } from '@/features/members/model';
import { NOTE_MAX_LENGTH, SONG_SCHEMA_VERSION, type Song, type SongMeta, type SongNote, type Tag } from './model';

/** Data access for songs, notes and tags (F4 §7). Only via SafeStorage (R-CODE-01). */

const songsDir = (appRoot: string) => joinPath(appRoot, 'songs');
const metaPath = (appRoot: string, songId: string) => joinPath(songsDir(appRoot), songId, 'meta.json');
const tagsDir = (appRoot: string) => joinPath(appRoot, 'tags');

async function listOrEmpty(storage: SafeStorage, path: string) {
  try {
    return await storage.list(path);
  } catch (error) {
    if (error instanceof NotFoundError) return [];
    throw error;
  }
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

/* ---------------- song metadata ---------------- */

export async function listSongMetas(storage: SafeStorage, appRoot: string): Promise<Record<string, Versioned<SongMeta>>> {
  const folders = (await listOrEmpty(storage, songsDir(appRoot))).filter((e) => e.type === 'folder');
  const loaded = await mapLimited(folders, 8, async (folder) => {
    try {
      const entry = await storage.stat(joinPath(folder.path, 'meta.json'));
      if (!entry) return null;
      const value = migrate<SongMeta>(await storage.readJson<unknown>(entry.path), SONG_SCHEMA_VERSION, []);
      return [folder.name, { value, version: entry.version }] as const;
    } catch (error) {
      console.warn('Skipping unreadable song meta', folder.path, error);
      return null;
    }
  });
  return Object.fromEntries(loaded.filter((x): x is NonNullable<typeof x> => x !== null));
}

/** Initial meta.json for a song that only existed as scanned files so far. */
export function seedMeta(songId: string, song: Song | undefined, memberId: string): SongMeta {
  const now = nowIso();
  const own = song?.recordings.filter((r) => r.originSongId === songId) ?? [];
  return {
    id: songId,
    schemaVersion: SONG_SCHEMA_VERSION,
    displayTitle: null,
    recordings: own.map((r) => ({
      id: r.id,
      path: r.path,
      size: r.size,
      label: r.label,
      durationSec: r.durationSec,
      firstSeenAt: r.addedAt ?? now,
    })),
    bandVersion: null,
    mergedSongIds: [],
    mergedInto: null,
    key: null,
    bpm: null,
    tuning: null,
    lyrics: null,
    hidden: false,
    archived: false,
    archivedAt: null,
    archivedBy: null,
    tagIds: [],
    source: 'scan',
    createdAt: now,
    createdBy: memberId,
    updatedAt: now,
    updatedBy: memberId,
    deletedAt: null,
    deletedBy: null,
  };
}

/**
 * Read–modify–write on the LATEST meta.json (created on first write, F4 §5).
 * `guard` may throw ConflictError if fields the user edited changed meanwhile (R-DATA-07);
 * other concurrent changes are kept because the mutation is applied to the latest file.
 */
export async function updateSongMeta(
  storage: SafeStorage,
  appRoot: string,
  songId: string,
  seed: () => SongMeta,
  mutate: (meta: SongMeta) => SongMeta,
  memberId: string,
  guard?: (latest: SongMeta) => void,
): Promise<Versioned<SongMeta>> {
  const path = metaPath(appRoot, songId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const entry = await storage.stat(path);
    if (entry) {
      const latest = migrate<SongMeta>(await storage.readJson<unknown>(path), SONG_SCHEMA_VERSION, []);
      guard?.(latest);
      const next = touchRecord(mutate(structuredClone(latest)), memberId);
      try {
        const written = await storage.writeJson(path, next, { expectedVersion: entry.version });
        return { value: next, version: written.version };
      } catch (error) {
        if (error instanceof ConflictError) continue;
        throw error;
      }
    } else {
      const base = seed();
      guard?.(base);
      const next = touchRecord(mutate(base), memberId);
      try {
        const written = await storage.createFile(path, JSON.stringify(next, null, 2) + '\n');
        return { value: next, version: written.version };
      } catch (error) {
        if (error instanceof AlreadyExistsError) continue;
        throw error;
      }
    }
  }
  throw new ConflictError(path, undefined);
}

/* ---------------- notes ---------------- */

export type NoteScope = 'public' | 'private';

export interface NoteEntry {
  songId: string;
  scope: NoteScope;
  note: SongNote;
  version: string | undefined;
}

const notesDir = (appRoot: string, songId: string, scope: NoteScope, memberId: string) =>
  scope === 'public'
    ? joinPath(songsDir(appRoot), songId, 'notes', 'public')
    : joinPath(songsDir(appRoot), songId, 'notes', 'private', memberId);

export async function listNotes(storage: SafeStorage, appRoot: string, songIds: string[], memberId: string): Promise<NoteEntry[]> {
  const targets = songIds.flatMap((songId) => (['public', 'private'] as const).map((scope) => ({ songId, scope })));
  const lists = await mapLimited(targets, 6, async ({ songId, scope }) => {
    const entries = (await listOrEmpty(storage, notesDir(appRoot, songId, scope, memberId))).filter((e) => e.name.endsWith('.json'));
    return mapLimited(entries, 8, async (entry) => {
      try {
        const note = migrate<SongNote>(await storage.readJson<unknown>(entry.path), 1, []);
        return { songId, scope, note, version: entry.version } satisfies NoteEntry;
      } catch {
        return null;
      }
    });
  });
  return lists.flat().filter((n): n is NoteEntry => n !== null && !n.note.deletedAt);
}

export class InvalidNoteError extends Error {
  constructor() {
    super('Note text must be 1–2000 characters');
    this.name = 'InvalidNoteError';
  }
}

function validText(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) throw new InvalidNoteError();
  return trimmed;
}

export async function createNote(
  storage: SafeStorage,
  appRoot: string,
  songId: string,
  scope: NoteScope,
  memberId: string,
  fields: { text: string; positionSec: number | null; recordingId: string | null },
  id = newId('n'),
): Promise<NoteEntry> {
  const now = nowIso();
  const note: SongNote = {
    id,
    schemaVersion: 1,
    text: validText(fields.text),
    positionSec: fields.positionSec,
    recordingId: fields.positionSec !== null ? fields.recordingId : null,
    pinned: false,
    createdAt: now,
    createdBy: memberId,
    updatedAt: now,
    updatedBy: memberId,
    deletedAt: null,
    deletedBy: null,
  };
  const entry = await storage.createFile(
    joinPath(notesDir(appRoot, songId, scope, memberId), `${note.id}.json`),
    JSON.stringify(note, null, 2) + '\n',
  );
  return { songId, scope, note, version: entry.version };
}

export async function saveNote(
  storage: SafeStorage,
  appRoot: string,
  entry: NoteEntry,
  memberId: string,
  change: 'edit' | 'pin' | 'unpin' | 'delete' | 'restore',
  text?: string,
): Promise<NoteEntry> {
  const owner = entry.scope === 'private' ? entry.note.createdBy : memberId;
  let note = entry.note;
  if (change === 'edit') note = touchRecord(note, memberId, { text: validText(text ?? '') });
  if (change === 'pin' || change === 'unpin') note = touchRecord(note, memberId, { pinned: change === 'pin' });
  if (change === 'delete') note = softDelete(note, memberId);
  if (change === 'restore') note = restore(note, memberId);
  const written = await storage.writeJson(joinPath(notesDir(appRoot, entry.songId, entry.scope, owner), `${note.id}.json`), note, {
    expectedVersion: entry.version,
  });
  return { ...entry, note, version: written.version };
}

/* ---------------- tags ---------------- */

export class TagNameTakenError extends Error {
  constructor(public readonly existing: Tag) {
    super(`Tag exists: ${existing.name}`);
    this.name = 'TagNameTakenError';
  }
}

export async function listTags(storage: SafeStorage, appRoot: string): Promise<Versioned<Tag>[]> {
  const entries = (await listOrEmpty(storage, tagsDir(appRoot))).filter((e) => e.name.endsWith('.json'));
  const tags = await mapLimited(entries, 8, async (entry) => {
    try {
      return { value: migrate<Tag>(await storage.readJson<unknown>(entry.path), 1, []), version: entry.version };
    } catch {
      return null;
    }
  });
  return tags
    .filter((t): t is Versioned<Tag> => t !== null && !t.value.deletedAt)
    .sort((a, b) => a.value.name.localeCompare(b.value.name, 'de'));
}

export async function createTag(storage: SafeStorage, appRoot: string, name: string, existing: Tag[], memberId: string): Promise<Versioned<Tag>> {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new Error('Empty tag');
  const taken = existing.find((t) => !t.deletedAt && sameName(t.name, trimmed));
  if (taken) throw new TagNameTakenError(taken);
  const now = nowIso();
  const tag: Tag = {
    id: newId('t'),
    schemaVersion: 1,
    name: trimmed,
    createdAt: now,
    createdBy: memberId,
    updatedAt: now,
    updatedBy: memberId,
    deletedAt: null,
    deletedBy: null,
  };
  const entry = await storage.createFile(joinPath(tagsDir(appRoot), `${tag.id}.json`), JSON.stringify(tag, null, 2) + '\n');
  return { value: tag, version: entry.version };
}

export async function saveTag(
  storage: SafeStorage,
  appRoot: string,
  current: Versioned<Tag>,
  memberId: string,
  change: { rename: string; existing: Tag[] } | 'delete',
): Promise<Versioned<Tag>> {
  let tag: Tag;
  if (change === 'delete') tag = softDelete(current.value, memberId);
  else {
    const name = change.rename.trim().slice(0, 40);
    if (!name) throw new Error('Empty tag');
    const taken = change.existing.find((t) => t.id !== current.value.id && sameName(t.name, name));
    if (taken) throw new TagNameTakenError(taken);
    tag = touchRecord(current.value, memberId, { name });
  }
  const entry = await storage.writeJson(joinPath(tagsDir(appRoot), `${tag.id}.json`), tag, { expectedVersion: current.version });
  return { value: tag, version: entry.version };
}
