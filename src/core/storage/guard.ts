import { dirname, isWithin, normalizePath } from './paths';
import { AlreadyExistsError, type CreateOptions, type FileContent, type FileEntry, type ShareLink, type StorageProvider, type WriteOptions } from './types';

/**
 * The single safety guard for all write operations (R-DATA-01 … R-DATA-04).
 *
 * Zones:
 * - app data folder (`appRoot`, e.g. "/users/band/_BandApp"): the app may create, update, move and delete.
 * - the rest of the HiDrive home (`home`, optional): create-only – new files and folders (uploads, F10),
 *   never changing, moving or deleting anything that exists.
 * - everything else (outside the home): read-only.
 *
 * Feature code only ever receives a SafeStorage, never the raw provider.
 */

export type WriteOperation = 'writeText' | 'writeJson' | 'createFile' | 'createFolder' | 'move' | 'delete' | 'shareLink' | 'copyFile';

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
  /** HiDrive home; enables create-only uploads anywhere inside it (R-DATA-03) */
  home?: string;
}

type Zone = 'app' | 'home' | 'foreign';

export class SafeStorage {
  private readonly appRoot: string;
  private readonly home: string | undefined;

  constructor(
    private readonly provider: StorageProvider,
    zones: GuardZones,
  ) {
    this.appRoot = normalizePath(zones.appRoot);
    this.home = zones.home ? normalizePath(zones.home) : undefined;
    if (this.appRoot === '/') throw new Error('The app data folder must not be the storage root.');
    if (this.home === '/') throw new Error('The home must not be the storage root.');
    if (this.home && (this.home === this.appRoot || !isWithin(this.appRoot, this.home))) {
      throw new Error('The app data folder must lie inside the home.');
    }
  }

  get providerId(): string {
    return this.provider.id;
  }

  /** Which zone a path belongs to. */
  zoneOf(path: string): Zone {
    const p = normalizePath(path);
    if (isWithin(p, this.appRoot)) return 'app';
    if (this.home && isWithin(p, this.home)) return 'home';
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

  /** Create a NEW file in the app data folder or anywhere in the home (uploads). Never overwrites. */
  async createFile(path: string, content: FileContent, options?: CreateOptions): Promise<FileEntry> {
    const p = this.require('createFile', path, ['app', 'home']);
    await this.ensureFolder(dirname(p));
    return this.provider.createFile(p, content, options);
  }

  /** Create a folder (and missing parents) in the app data folder or anywhere in the home. */
  async createFolder(path: string): Promise<FileEntry> {
    const p = this.require('createFolder', path, ['app', 'home']);
    return this.ensureFolder(p);
  }

  /** Move/rename – only within the app data folder. */
  async move(from: string, to: string): Promise<FileEntry> {
    const f = this.require('move', from, ['app']);
    const t = this.require('move', to, ['app']);
    await this.ensureFolder(dirname(t));
    return this.provider.move(f, t);
  }

  /**
   * Copy a file to a NEW path in the app folder or anywhere in the home (create-only, R-DATA-03):
   * the source stays untouched, an existing target is never overwritten. Uses a server-side copy
   * when the storage offers one, otherwise download + upload (v0.13.3, "aus Vorschlägen übernehmen").
   */
  async copyFile(from: string, to: string, options?: CreateOptions): Promise<FileEntry> {
    const source = normalizePath(from);
    const target = this.require('copyFile', to, ['app', 'home']);
    if (await this.provider.stat(target)) throw new AlreadyExistsError(target);
    await this.ensureFolder(dirname(target));
    if (this.provider.copyFile) return this.provider.copyFile(source, target);
    return this.provider.createFile(target, await this.provider.readBlob(source), options);
  }

  get canShare(): boolean {
    return typeof this.provider.createShareLink === 'function';
  }

  /**
   * Public read-only link to one file. Only app-generated files inside the app data folder may be
   * shared (the calendar subscription file) – never band files (R-SEC, F5 §6.5b).
   */
  async createShareLink(path: string): Promise<ShareLink> {
    const p = this.require('shareLink', path, ['app']);
    if (!this.provider.createShareLink) throw new Error('Sharing is not supported by this storage');
    return this.provider.createShareLink(p);
  }

  async deleteShareLink(id: string): Promise<void> {
    if (!this.provider.deleteShareLink) throw new Error('Sharing is not supported by this storage');
    return this.provider.deleteShareLink(id);
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
    const root = zone === 'app' ? this.appRoot : zone === 'home' ? this.home : undefined;
    if (!root) throw new GuardViolationError('createFolder', p, 'folders can only be created inside the app data folder or the home');
    if (zone === 'home' && p === root) return (await this.provider.stat(root)) ?? Promise.reject(new GuardViolationError('createFolder', p, 'the home must exist'));
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
    if (this.home && p === this.home && operation !== 'createFolder') {
      throw new GuardViolationError(operation, p, 'the home itself cannot be changed');
    }
    const zone = this.zoneOf(p);
    if (!allowed.includes(zone)) {
      const reason =
        zone === 'foreign'
          ? 'path is outside the writable zones (read-only)'
          : zone === 'home'
            ? 'existing files outside the app data folder are never changed, moved or deleted (create-only)'
            : `operation is not allowed in the ${zone} zone`;
      throw new GuardViolationError(operation, p, reason);
    }
    return p;
  }
}
