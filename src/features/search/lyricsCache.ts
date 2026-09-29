import { extractText, loadLyrics } from '@/core/lyrics/renderers';
import type { SafeStorage } from '@/core/storage';

/** Extracted lyrics text per file, cached on the device by file version (F8 §7). */

const KEY = 'bandapp.lyricsText';
type Cache = Record<string, { v: string; lines: string[] | null }>;

function read(): Cache {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Cache;
  } catch {
    return {};
  }
}

let cache: Cache | null = null;

export function cachedLines(path: string, version: string): string[] | null | undefined {
  cache ??= read();
  const entry = cache[path];
  return entry && entry.v === version ? entry.lines : undefined;
}

export async function extractLines(storage: SafeStorage, path: string, version: string): Promise<string[] | null> {
  cache ??= read();
  const name = path.slice(path.lastIndexOf('/') + 1);
  let lines: string[] | null = null;
  try {
    const content = await loadLyrics(await storage.readBlob(path), name);
    const text = await extractText(content);
    lines = text ? text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : null; // null: e.g. scanned PDF
  } catch {
    lines = null;
  }
  cache[path] = { v: version, lines };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // quota: keep in memory only
  }
  return lines;
}

export function clearLyricsCache() {
  cache = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
