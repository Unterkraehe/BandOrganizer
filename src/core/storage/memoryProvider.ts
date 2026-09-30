import { basename, dirname, isWithin, normalizePath } from './paths';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
  type CreateOptions,
  type FileContent,
  type FileEntry,
  type ShareLink,
  type StorageProvider,
  type WriteOptions,
} from './types';

interface StoredFile {
  content: Blob;
  modifiedAt: string;
  version: number;
}

/**
 * In-memory StorageProvider for tests and local development.
 * Mirrors the contract real providers must fulfil (e.g. createFile never overwrites).
 */
export class MemoryStorageProvider implements StorageProvider {
  readonly id = 'memory';
  private files = new Map<string, StoredFile>();
  private folders = new Set<string>(['/']);
  private clock = 0;

  /** Test helper: put a file without going through the guard (simulates existing HiDrive data). */
  seed(path: string, content: FileContent, modifiedAt?: string): void {
    const p = normalizePath(path);
    this.ensureParents(p);
    this.files.set(p, { content: toBlob(content), modifiedAt: modifiedAt ?? this.tick(), version: 1 });
  }

  /** Test helper: an existing (empty) folder, e.g. the HiDrive home. */
  seedFolder(path: string): void {
    const p = normalizePath(path);
    this.ensureParents(p + '/x');
  }

  has(path: string): boolean {
    const p = normalizePath(path);
    return this.files.has(p) || this.folders.has(p);
  }

  async list(path: string): Promise<FileEntry[]> {
    const p = normalizePath(path);
    if (!this.folders.has(p)) throw new NotFoundError(p);
    const entries: FileEntry[] = [];
    for (const folder of this.folders) {
      if (folder !== p && dirname(folder) === p) entries.push(this.folderEntry(folder));
    }
    for (const [filePath, file] of this.files) {
      if (dirname(filePath) === p) entries.push(this.fileEntry(filePath, file));
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async stat(path: string): Promise<FileEntry | null> {
    const p = normalizePath(path);
    const file = this.files.get(p);
    if (file) return this.fileEntry(p, file);
    if (this.folders.has(p)) return this.folderEntry(p);
    return null;
  }

  async readText(path: string): Promise<string> {
    return (await this.readBlob(path)).text();
  }

  async readBlob(path: string): Promise<Blob> {
    const file = this.files.get(normalizePath(path));
    if (!file) throw new NotFoundError(path);
    return file.content;
  }

  async writeText(path: string, content: string, options?: WriteOptions): Promise<FileEntry> {
    const p = normalizePath(path);
    const existing = this.files.get(p);
    if (options?.expectedVersion !== undefined && String(existing?.version) !== options.expectedVersion) {
      throw new ConflictError(p, existing ? String(existing.version) : undefined);
    }
    this.requireParent(p);
    const file = { content: toBlob(content), modifiedAt: this.tick(), version: (existing?.version ?? 0) + 1 };
    this.files.set(p, file);
    return this.fileEntry(p, file);
  }

  async createFile(path: string, content: FileContent, options?: CreateOptions): Promise<FileEntry> {
    const p = normalizePath(path);
    if (this.files.has(p) || this.folders.has(p)) throw new AlreadyExistsError(p);
    this.requireParent(p);
    const blob = toBlob(content);
    options?.onProgress?.(blob.size, blob.size);
    const file = { content: blob, modifiedAt: this.tick(), version: 1 };
    this.files.set(p, file);
    return this.fileEntry(p, file);
  }

  async createFolder(path: string): Promise<FileEntry> {
    const p = normalizePath(path);
    if (this.files.has(p)) throw new AlreadyExistsError(p);
    // Like HiDrive: creates ONE folder, the parent must exist.
    this.requireParent(p);
    this.folders.add(p);
    return this.folderEntry(p);
  }

  async move(from: string, to: string): Promise<FileEntry> {
    const f = normalizePath(from);
    const t = normalizePath(to);
    const file = this.files.get(f);
    if (!file) throw new NotFoundError(f);
    if (this.files.has(t)) throw new AlreadyExistsError(t);
    this.requireParent(t);
    this.files.delete(f);
    this.files.set(t, file);
    return this.fileEntry(t, file);
  }

  async copyFile(from: string, to: string): Promise<FileEntry> {
    const f = normalizePath(from);
    const t = normalizePath(to);
    const file = this.files.get(f);
    if (!file) throw new NotFoundError(f);
    if (this.files.has(t) || this.folders.has(t)) throw new AlreadyExistsError(t);
    this.requireParent(t);
    const copy = { ...file, modifiedAt: this.tick(), version: 1 };
    this.files.set(t, copy);
    return this.fileEntry(t, copy);
  }

  async delete(path: string): Promise<void> {
    const p = normalizePath(path);
    if (this.files.delete(p)) return;
    if (!this.folders.has(p)) throw new NotFoundError(p);
    for (const filePath of [...this.files.keys()]) if (isWithin(filePath, p)) this.files.delete(filePath);
    for (const folder of [...this.folders]) if (isWithin(folder, p)) this.folders.delete(folder);
  }

  /** Demo/tests: share links are fake URLs; `sharedFile(url)` resolves them like a calendar app would. */
  readonly shareLinks = new Map<string, { path: string; url: string }>();
  private shareCounter = 0;

  async createShareLink(path: string): Promise<ShareLink> {
    const p = normalizePath(path);
    if (!this.files.has(p)) throw new NotFoundError(p);
    const id = `share-${++this.shareCounter}`;
    const url = `https://share.example.invalid/${id}/${basename(p)}`;
    this.shareLinks.set(id, { path: p, url });
    return { id, url };
  }

  async deleteShareLink(id: string): Promise<void> {
    this.shareLinks.delete(id);
  }

  async sharedFile(url: string): Promise<string | null> {
    const link = [...this.shareLinks.values()].find((l) => l.url === url);
    return link && this.files.has(link.path) ? this.readText(link.path) : null;
  }

  private requireParent(path: string): void {
    if (!this.folders.has(dirname(path))) throw new NotFoundError(dirname(path));
  }

  private ensureParents(filePath: string): void {
    let dir = dirname(filePath);
    while (!this.folders.has(dir)) {
      this.folders.add(dir);
      dir = dirname(dir);
    }
  }

  private tick(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock)).toISOString();
  }

  private fileEntry(path: string, file: StoredFile): FileEntry {
    return {
      path,
      name: basename(path),
      type: 'file',
      id: `mem:${path}`,
      size: file.content.size,
      modifiedAt: file.modifiedAt,
      version: String(file.version),
    };
  }

  private folderEntry(path: string): FileEntry {
    return { path, name: path === '/' ? '' : basename(path), type: 'folder', id: `mem:${path}` };
  }
}

function toBlob(content: FileContent): Blob {
  if (content instanceof Blob) return content;
  if (typeof content === 'string') return new Blob([content], { type: 'text/plain' });
  return new Blob([content.slice()]);
}
