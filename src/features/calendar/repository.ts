import { migrate } from '@/core/data/migrate';
import type { Versioned } from '@/core/band/band';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import type { Answer, CalendarEvent, EventException } from './model';

/** Data access for `_BandApp/calendar/` (F5 §7). Only via SafeStorage (R-CODE-01). */

const root = (appRoot: string) => joinPath(appRoot, 'calendar');
export const eventPath = (appRoot: string, id: string) => joinPath(root(appRoot), 'events', `${id}.json`);
export const exceptionPath = (appRoot: string, eventId: string, date: string) => joinPath(root(appRoot), 'exceptions', eventId, `${date}.json`);
export const answerPath = (appRoot: string, eventId: string, key: string, memberId: string) =>
  joinPath(root(appRoot), 'answers', eventId, key, `${memberId}.json`);

async function listOrEmpty(storage: SafeStorage, path: string) {
  try {
    return await storage.list(path);
  } catch (error) {
    if (error instanceof NotFoundError) return [];
    throw error;
  }
}

async function readAll<T>(storage: SafeStorage, entries: { path: string; name: string; version?: string }[]) {
  const out: Versioned<T>[] = [];
  for (let i = 0; i < entries.length; i += 8) {
    const batch = await Promise.all(
      entries.slice(i, i + 8).map(async (entry) => {
        try {
          return { value: migrate<T>(await storage.readJson<unknown>(entry.path), 1, []), version: entry.version };
        } catch (error) {
          console.warn('Skipping unreadable calendar file', entry.path, error);
          return null;
        }
      }),
    );
    out.push(...batch.filter((x): x is Versioned<T> => x !== null));
  }
  return out;
}

export async function listEvents(storage: SafeStorage, appRoot: string): Promise<Versioned<CalendarEvent>[]> {
  const entries = (await listOrEmpty(storage, joinPath(root(appRoot), 'events'))).filter((e) => e.name.endsWith('.json'));
  return readAll<CalendarEvent>(storage, entries);
}

/**
 * Cheap check for changes (v0.14.3): one listing of the events folder, then only files that are
 * new or have a different version than `known` (id → version) are read.
 */
export async function changedEvents(
  storage: SafeStorage,
  appRoot: string,
  known: Map<string, string | undefined>,
): Promise<{ changed: Versioned<CalendarEvent>[]; present: Set<string> }> {
  const entries = (await listOrEmpty(storage, joinPath(root(appRoot), 'events'))).filter((e) => e.name.endsWith('.json'));
  const idOf = (name: string) => name.slice(0, -'.json'.length);
  const present = new Set(entries.map((e) => idOf(e.name)));
  const stale = entries.filter((e) => !known.has(idOf(e.name)) || known.get(idOf(e.name)) !== e.version);
  return { changed: await readAll<CalendarEvent>(storage, stale), present };
}

/** Like listExceptions, but keeps the known list of an event (same object) when nothing in it changed. */
export async function changedExceptions(
  storage: SafeStorage,
  appRoot: string,
  eventIds: string[],
  known: Record<string, Versioned<EventException>[]>,
): Promise<Record<string, Versioned<EventException>[]>> {
  const result: Record<string, Versioned<EventException>[]> = {};
  const folders = new Set((await listOrEmpty(storage, joinPath(root(appRoot), 'exceptions'))).filter((e) => e.type === 'folder').map((e) => e.name));
  for (const id of eventIds.filter((id) => folders.has(id))) {
    const entries = (await listOrEmpty(storage, joinPath(root(appRoot), 'exceptions', id))).filter((e) => e.name.endsWith('.json'));
    const before = known[id] ?? [];
    const versions = new Set(before.map((x) => x.version));
    const same = entries.length === before.length && entries.every((e) => e.version !== undefined && versions.has(e.version));
    result[id] = same ? before : await readAll<EventException>(storage, entries);
  }
  return result;
}

export async function listExceptions(storage: SafeStorage, appRoot: string, eventIds: string[]): Promise<Record<string, Versioned<EventException>[]>> {
  const result: Record<string, Versioned<EventException>[]> = {};
  const folders = new Set((await listOrEmpty(storage, joinPath(root(appRoot), 'exceptions'))).filter((e) => e.type === 'folder').map((e) => e.name));
  for (const id of eventIds.filter((id) => folders.has(id))) {
    const entries = (await listOrEmpty(storage, joinPath(root(appRoot), 'exceptions', id))).filter((e) => e.name.endsWith('.json'));
    result[id] = await readAll<EventException>(storage, entries);
  }
  return result;
}

/** Answers of the given occurrence keys (folders) of one event. */
export async function listAnswers(storage: SafeStorage, appRoot: string, eventId: string, keys: Set<string> | null): Promise<Answer[]> {
  const folders = (await listOrEmpty(storage, joinPath(root(appRoot), 'answers', eventId))).filter(
    (e) => e.type === 'folder' && (!keys || keys.has(e.name)),
  );
  const answers: Answer[] = [];
  for (const folder of folders) {
    const entries = (await listOrEmpty(storage, folder.path)).filter((e) => e.name.endsWith('.json'));
    answers.push(...(await readAll<Answer>(storage, entries)).map((v) => v.value));
  }
  return answers;
}

export async function writeEvent(storage: SafeStorage, appRoot: string, event: CalendarEvent, version?: string, create = false) {
  const path = eventPath(appRoot, event.id);
  const entry = create
    ? await storage.createFile(path, JSON.stringify(event, null, 2) + '\n')
    : await storage.writeJson(path, event, { expectedVersion: version });
  return { value: event, version: entry.version };
}

export async function writeException(storage: SafeStorage, appRoot: string, ex: EventException) {
  const path = exceptionPath(appRoot, ex.eventId, ex.occurrenceDate);
  const existing = await storage.stat(path);
  const entry = await storage.writeJson(path, ex, existing ? { expectedVersion: existing.version } : undefined);
  return { value: ex, version: entry.version };
}

/** Each member only writes their own answer file – no conflicts between members. */
export async function writeAnswer(storage: SafeStorage, appRoot: string, answer: Answer) {
  await storage.writeJson(answerPath(appRoot, answer.eventId, answer.occurrenceKey, answer.memberId), answer);
}
