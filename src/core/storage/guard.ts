import { dirname, isWithin, normalizePath } from './paths';
import type { CreateOptions, FileContent, FileEntry, StorageProvider, WriteOptions } from './types';

/**
 * The single safety guard for all write operations (R-DATA-01 … R-DATA-04).
 *
 * Zones:
 * - app data folder (`appRoot`, e.g. "/…/_BandApp"): the app may create, update, move and delete.
 * - upload root (`uploadRoot`, optional): create-only – new files and folders, nothing else.
 * - everything else: read-only.
 *
 * Feature code only ever receives a SafeStorage, never the raw provider.
 */

export type WriteOperation = 'writeText' | 'writeJson' | 'createFile' | 'createFolder' | 'move' | 'delete';

export class GuardViolationError extends Error {
  constructor(
    public readonly operation: WriteOperation,
    public readonly path: string,
    reason: string,
  ) {
    super(`Blocked ${operation} on "${path}": ${reason}`);
    this.name = 'GuardViolationError';
  }
}

export interface GuardZones {
  appRoot: string;
  uploadRoot?: string;
}

type Zone = 'app' | 'upload' | 'foreign';

export class SafeStorage {
  private readonly appRoot: string;
  private readonly uploadRoot: string | undefined;

  constructor(
    private readonly provider: StorageProvider,
    zones: GuardZones,
  ) {
    this.appRoot = normalizePath(zones.appRoot);
    this.uploadRoot = zones.uploadRoot ? normalizePath(zones.uploadRoot) : undefined;
    if (this.appRoot === '/') throw new Error('The app data folder must not be the storage root.');
    if (this.uploadRoot === '/') throw new Error('The upload root must not be the storage root.');
    if (this.uploadRoot && (isWithin(this.uploadRoot, this.appRoot) || isWithin(this.appRoot, this.uploadRoot))) {
      throw new Error('App data folder and upload root must not contain each other.');
    }
  }

  get providerId(): string {
    return this.provider.id;
  }

  /** Which zone a path belongs to. */
  zoneOf(path: string): Zone {
    const p = normalizePath(path);
    if (isWithin(p, this.appRoot)) return 'app';
    if (this.uploadRoot && isWithin(p, this.uploadRoot)) return 'upload';
    return 'foreign';
  }

  // ---------- read: always allowed ----------

  async list(path: string): Promise<FileEntry[]> {
    return this.provider.list(normalizePath(path));
  }

  async stat(path: string): Promise<FileEntry | null> {
    return this.provider.stat(normalizePath(path));
  }

  async readText(path: string): Promise<string> {
    return this.provider.readText(normalizePath(path));
  }

  async readJson<T>(path: string): Promise<T> {
    return JSON.parse(await this.readText(path)) as T;
  }

  async readBlob(path: string): Promise<Blob> {
    return this.provider.readBlob(normalizePath(path));
  }

  // ---------- write: guarded ----------

  /** Create or update a text file inside the app data folder. */
  async writeText(path: string, content: string, options?: WriteOptions): Promise<FileEntry> {
    const p = this.require('writeText', path, ['app']);
    await this.ensureFolder(dirname(p));
    return this.provider.writeText(p, content, options);
  }

  /** Create or update a JSON record inside the app data folder. */
  async writeJson(path: string, data: unknown, options?: WriteOptions): Promise<FileEntry> {
    const p = this.require('writeJson', path, ['app']);
    await this.ensureFolder(dirname(p));
    return this.provider.writeText(p, JSON.stringify(data, null, 2) + '\n', options);
  }

  /** Create a NEW file in the app data folder or the upload root. Never overwrites. */
  async createFile(path: string, content: FileContent, options?: CreateOptions): Promise<FileEntry> {
    const p = this.require('createFile', path, ['app', 'upload']);
    await this.ensureFolder(dirname(p));
    return this.provider.createFile(p, content, options);
  }

  /** Create a folder (and missing parents) in the app data folder or the upload root. */
  async createFolder(path: string): Promise<FileEntry> {
    const p = this.require('createFolder', path, ['app', 'upload']);
    return this.ensureFolder(p);
  }

  /** Move/rename – only within the app data folder. */
  async move(from: string, to: string): Promise<FileEntry> {
    const f = this.require('move', from, ['app']);
    const t = this.require('move', to, ['app']);
    await this.ensureFolder(dirname(t));
    return this.provider.move(f, t);
  }

  /** Delete – only within the app data folder (and normally avoided: R-DATA-05 soft delete). */
  async delete(path: string): Promise<void> {
    const p = this.require('delete', path, ['app']);
    return this.provider.delete(p);
  }

  /**
   * Creates a folder and its missing parents – but only from the zone root downwards.
   * The zone root's parent (the HiDrive home) must already exist; nothing above a zone
   * is ever created.
   */
  private async ensureFolder(folder: string): Promise<FileEntry> {
    const p = normalizePath(folder);
    const zone = this.zoneOf(p);
    const root = zone === 'app' ? this.appRoot : zone === 'upload' ? this.uploadRoot : undefined;
    if (!root) throw new GuardViolationError('createFolder', p, 'folders can only be created inside the app data folder or the upload root');
    const chain: string[] = [];
    for (let current = p; ; current = dirname(current)) {
      chain.unshift(current);
      if (current === root) break;
    }
    let entry: FileEntry | null = null;
    for (const path of chain) {
      entry = await this.provider.stat(path);
      if (!entry) entry = await this.provider.createFolder(path);
    }
    return entry!;
  }

  private require(operation: WriteOperation, path: string, allowed: Zone[]): string {
    const p = normalizePath(path);
    if (p === this.appRoot && (operation === 'delete' || operation === 'move')) {
      throw new GuardViolationError(operation, p, 'the app data folder itself must not be moved or deleted');
    }
    if (this.uploadRoot && p === this.uploadRoot && operation !== 'createFolder') {
      throw new GuardViolationError(operation, p, 'the upload root itself is not a file');
    }
    const zone = this.zoneOf(p);
    if (!allowed.includes(zone)) {
      const reason =
        zone === 'foreign'
          ? 'path is outside the app data folder and the upload root (foreign data is read-only)'
          : `operation is not allowed in the ${zone} zone`;
      throw new GuardViolationError(operation, p, reason);
    }
    return p;
  }
}
