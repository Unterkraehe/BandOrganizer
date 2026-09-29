import type { Versioned } from '@/core/band/band';
import { migrate } from '@/core/data/migrate';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import type { PersonalNotes, Setlist } from './model';

const dir = (appRoot: string) => joinPath(appRoot, 'setlists');
export const setlistPath = (appRoot: string, id: string) => joinPath(dir(appRoot), id, 'setlist.json');
export const personalPath = (appRoot: string, id: string, memberId: string) => joinPath(dir(appRoot), id, 'personal-notes', `${memberId}.json`);

export async function listSetlists(storage: SafeStorage, appRoot: string): Promise<Versioned<Setlist>[]> {
  let folders;
  try {
    folders = (await storage.list(dir(appRoot))).filter((e) => e.type === 'folder');
  } catch (error) {
    if (error instanceof NotFoundError) return [];
    throw error;
  }
  const result: Versioned<Setlist>[] = [];
  for (let i = 0; i < folders.length; i += 8) {
    const batch = await Promise.all(
      folders.slice(i, i + 8).map(async (folder) => {
        try {
          const entry = await storage.stat(joinPath(folder.path, 'setlist.json'));
          if (!entry) return null;
          return { value: migrate<Setlist>(await storage.readJson<unknown>(entry.path), 1, []), version: entry.version };
        } catch (error) {
          console.warn('Skipping unreadable setlist', folder.path, error);
          return null;
        }
      }),
    );
    result.push(...batch.filter((x): x is Versioned<Setlist> => x !== null));
  }
  return result;
}

export async function readPersonal(storage: SafeStorage, appRoot: string, id: string, memberId: string): Promise<PersonalNotes | null> {
  try {
    return await storage.readJson<PersonalNotes>(personalPath(appRoot, id, memberId));
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
