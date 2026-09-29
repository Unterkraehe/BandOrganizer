import { extensionOf } from '@/core/files/scan';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';

/** Removes characters HiDrive doesn't allow in names (F10 §4.4). */
export function sanitizeFileName(name: string): string {
  const cleaned = [...name.replace(/[/\\]/g, '-')]
    .filter((c) => c.charCodeAt(0) >= 32) // no control characters
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 200) || 'Datei';
}

/** "Song.mp3" → "Song (2).mp3" if the name is taken (create-only, R-DATA-03). */
export function withSuffix(name: string, n: number): string {
  const ext = extensionOf(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  return ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
}

export async function uniqueName(storage: SafeStorage, folder: string, name: string): Promise<string> {
  let taken: Set<string>;
  try {
    taken = new Set((await storage.list(folder)).map((e) => e.name.toLocaleLowerCase('de')));
  } catch (error) {
    if (error instanceof NotFoundError) return name; // folder will be created
    throw error;
  }
  if (!taken.has(name.toLocaleLowerCase('de'))) return name;
  for (let n = 2; n < 1000; n++) {
    const candidate = withSuffix(name, n);
    if (!taken.has(candidate.toLocaleLowerCase('de'))) return candidate;
  }
  return withSuffix(name, Date.now());
}

export const pathIn = (folder: string, name: string) => joinPath(folder, name);
