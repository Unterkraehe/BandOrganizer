import { isWithin, joinPath, normalizePath, type FileEntry, type SafeStorage } from '@/core/storage';

/**
 * Recursive file scan (docs/features/10 §4 "Audio file discovery").
 * Finds all audio files anywhere below the home folder, skipping the app data folder,
 * hidden folders and excluded paths.
 */

export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac'] as const;

export interface ScannedFile {
  path: string;
  name: string;
  id?: string;
  size?: number;
  modifiedAt?: string;
}

export interface ScanReport {
  folders: number;
  /** Folders that could not be listed (shown in the settings, F1 §7) */
  failedFolders: string[];
}

export interface ScanOptions {
  root: string;
  skip: string[];
  onProgress?: (progress: { folders: number; found: number }) => void;
  concurrency?: number;
  signal?: AbortSignal;
  /** Filled in during the scan */
  report?: ScanReport;
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : '';
}

export const isAudioFile = (name: string) => (AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(name));

/** Documents that can be linked as lyrics (F4 §6.3); pdf/docx/txt are displayed, others open as file. */
export const LYRICS_EXTENSIONS = ['pdf', 'docx', 'txt', 'doc', 'odt', 'rtf', 'pages'] as const;
export const isLyricsFile = (name: string) => (LYRICS_EXTENSIONS as readonly string[]).includes(extensionOf(name));

export async function scanAudioFiles(storage: SafeStorage, options: ScanOptions): Promise<ScannedFile[]> {
  return (await scanFiles(storage, options)).audio;
}

/** One pass over all folders: audio files and lyrics documents. */
export async function scanFiles(storage: SafeStorage, options: ScanOptions): Promise<{ audio: ScannedFile[]; documents: ScannedFile[] }> {
  const skip = options.skip.map(normalizePath);
  const queue: string[] = [normalizePath(options.root)];
  const found: ScannedFile[] = [];
  const documents: ScannedFile[] = [];
  let folders = 0;
  const concurrency = options.concurrency ?? 4;

  const shouldSkip = (entry: FileEntry) =>
    entry.name.startsWith('.') || skip.some((excluded) => isWithin(entry.path, excluded));

  const worker = async () => {
    while (queue.length > 0) {
      if (options.signal?.aborted) throw new DOMException('Scan aborted', 'AbortError');
      const folder = queue.shift()!;
      let entries: FileEntry[];
      try {
        entries = await storage.list(folder);
      } catch (error) {
        // An unreadable folder must not stop the whole scan.
        console.warn('Scan: cannot list folder', folder, error);
        options.report?.failedFolders.push(folder);
        continue;
      }
      folders += 1;
      if (options.report) options.report.folders = folders;
      for (const entry of entries) {
        if (shouldSkip(entry)) continue;
        const path = entry.path || joinPath(folder, entry.name);
        if (entry.type === 'folder') queue.push(path);
        else if (isAudioFile(entry.name)) {
          found.push({ path, name: entry.name, id: entry.id, size: entry.size, modifiedAt: entry.modifiedAt });
        } else if (isLyricsFile(entry.name)) {
          documents.push({ path, name: entry.name, id: entry.id, size: entry.size, modifiedAt: entry.modifiedAt });
        }
      }
      options.onProgress?.({ folders, found: found.length });
    }
  };

  // Several workers share one queue; a worker that finds the queue empty stops, while
  // others may still add folders – so keep starting rounds until nothing is left.
  while (queue.length > 0) {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  }
  const byPath = (a: ScannedFile, b: ScannedFile) => a.path.localeCompare(b.path, 'de');
  return { audio: found.sort(byPath), documents: documents.sort(byPath) };
}
