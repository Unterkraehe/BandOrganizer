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

/**
 * What a scan remembers so the next one only reads what changed (song sync, F11 §4.7):
 * the tree version of every folder seen (`FileEntry.treeVersion`) and the skip list it was made with.
 */
export interface ScanSnapshot {
  folders: Record<string, string>;
  skip: string[];
}

export interface ScanReport {
  /** Folders that were listed */
  folders: number;
  /** Folders (with everything below) taken over from the last scan because nothing changed in them */
  unchanged?: number;
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
  /**
   * Result of the last scan: folders whose tree version is unchanged are not listed again, their files
   * are taken over. Ignored (full scan) when the skip list changed. Folders that can't be listed keep
   * their previous files – a network hiccup must not make songs disappear.
   */
  previous?: { snapshot: ScanSnapshot; audio: ScannedFile[]; documents: ScannedFile[] };
}

export interface ScanResult {
  audio: ScannedFile[];
  documents: ScannedFile[];
  snapshot: ScanSnapshot;
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
export async function scanFiles(storage: SafeStorage, options: ScanOptions): Promise<ScanResult> {
  const skip = options.skip.map(normalizePath);
  const root = normalizePath(options.root);
  const queue: string[] = [root];
  const found: ScannedFile[] = [];
  const documents: ScannedFile[] = [];
  let folders = 0;
  let unchanged = 0;
  const concurrency = options.concurrency ?? 4;
  const sameSkip = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
  const previous = options.previous && sameSkip(options.previous.snapshot.skip.map(normalizePath), skip) ? options.previous : null;
  const versions: Record<string, string> = {};

  const shouldSkip = (entry: FileEntry) =>
    entry.name.startsWith('.') || skip.some((excluded) => isWithin(entry.path, excluded));

  /** Takes over everything the last scan knew below `folder`. */
  const reuse = (folder: string) => {
    if (!previous) return;
    const prefix = folder === '/' ? '/' : `${folder}/`; // all paths here are normalized
    const below = (path: string) => path.startsWith(prefix);
    for (const file of previous.audio) if (below(file.path)) found.push(file);
    for (const file of previous.documents) if (below(file.path)) documents.push(file);
    for (const [path, version] of Object.entries(previous.snapshot.folders)) if (below(path)) versions[path] = version;
  };
  /** A folder that couldn't be read: forget its version and its parents', so the next scan looks again. */
  const forget = (folder: string) => {
    for (const path of Object.keys(versions)) if (isWithin(folder, path)) delete versions[path];
  };

  const failed: string[] = [];
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
        failed.push(folder);
        reuse(folder);
        continue;
      }
      folders += 1;
      if (options.report) options.report.folders = folders;
      for (const entry of entries) {
        if (shouldSkip(entry)) continue;
        const path = entry.path || joinPath(folder, entry.name);
        if (entry.type === 'folder') {
          if (entry.treeVersion) versions[path] = entry.treeVersion;
          if (entry.treeVersion && previous?.snapshot.folders[path] === entry.treeVersion) {
            // nothing changed anywhere below: no need to list it again
            reuse(path);
            unchanged += 1;
            if (options.report) options.report.unchanged = unchanged;
          } else queue.push(path);
        } else if (isAudioFile(entry.name)) {
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
  failed.forEach(forget);
  const byPath = (a: ScannedFile, b: ScannedFile) => a.path.localeCompare(b.path, 'de');
  return { audio: found.sort(byPath), documents: documents.sort(byPath), snapshot: { folders: versions, skip } };
}
