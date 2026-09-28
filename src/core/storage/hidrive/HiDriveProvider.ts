import { basename, dirname, normalizePath } from '../paths';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
  type CreateOptions,
  type FileContent,
  type FileEntry,
  type StorageProvider,
  type WriteOptions,
} from '../types';

/**
 * StorageProvider for the HiDrive REST API 2.1 (docs/features/10 §4).
 *
 * NOTE: written against the public API documentation; request details are verified with
 * real access in M1 (spikes S1/S2). Feature code never uses this class directly – only via
 * SafeStorage (R-CODE-01, R-DATA-04).
 */

interface HiDriveObject {
  name?: string;
  path?: string;
  type?: 'file' | 'dir' | 'symlink';
  id?: string;
  size?: number;
  mtime?: number;
  chash?: string;
}

export class HiDriveError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`HiDrive ${status}: ${message}`);
    this.name = 'HiDriveError';
  }
}

export interface HiDriveProviderOptions {
  apiBase: string;
  /** Returns a valid access token (refreshing if necessary). */
  getAccessToken: () => Promise<string>;
  /** Forces a refresh after a 401 and returns the new token. */
  refreshAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

const OBJECT_FIELDS = ['name', 'path', 'type', 'id', 'size', 'mtime', 'chash'];

/**
 * HiDrive API paths are relative to the storage root and start with "root"
 * ("root/users/overload/Songs"). Inside the app all paths are absolute ("/users/overload/Songs").
 */
export function toApiPath(path: string): string {
  const p = normalizePath(path);
  return p === '/' ? 'root' : `root${p}`;
}

export function fromApiPath(apiPath: string): string {
  const withoutRoot = apiPath.replace(/^\/?root(?=\/|$)/, '');
  return normalizePath(withoutRoot.startsWith('/') ? withoutRoot || '/' : `/${withoutRoot}`);
}

export class HiDriveProvider implements StorageProvider {
  readonly id = 'hidrive';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HiDriveProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  // ---------- account ----------

  /** Home folder and alias of the connected account (e.g. "/users/overload"). */
  async getUserInfo(): Promise<{ home: string; alias: string }> {
    const data = await this.json<{ home?: string; alias?: string }>('GET', '/user/me', { fields: 'home,alias' });
    const alias = data.alias ?? '';
    const home = data.home ? fromApiPath(decodeHiDrive(data.home)) : `/users/${alias}`;
    return { home, alias };
  }

  // ---------- read ----------

  async list(path: string): Promise<FileEntry[]> {
    const data = await this.json<{ members?: HiDriveObject[] }>('GET', '/dir', {
      path: toApiPath(path),
      members: 'all',
      fields: OBJECT_FIELDS.map((field) => `members.${field}`).join(','),
    });
    return (data.members ?? []).filter((m) => m.type !== 'symlink').map((m) => toEntry(m, path));
  }

  async stat(path: string): Promise<FileEntry | null> {
    try {
      const data = await this.json<HiDriveObject>('GET', '/meta', { path: toApiPath(path), fields: OBJECT_FIELDS.join(',') });
      return toEntry(data, dirname(path));
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async readText(path: string): Promise<string> {
    return (await this.readBlob(path)).text();
  }

  async readBlob(path: string): Promise<Blob> {
    const response = await this.request('GET', '/file', { path: toApiPath(path) });
    return response.blob();
  }

  // ---------- write (only called through SafeStorage) ----------

  async writeText(path: string, content: string, options?: WriteOptions): Promise<FileEntry> {
    const existing = await this.stat(path);
    if (options?.expectedVersion !== undefined && existing?.version !== options.expectedVersion) {
      // HiDrive's CORS setup doesn't allow If-Match, so the check compares metadata first (F1 §8).
      throw new ConflictError(path, existing?.version);
    }
    const body = new Blob([content], { type: 'application/octet-stream' });
    // Parent folders are created by SafeStorage, only inside the allowed zones.
    if (existing) {
      await this.request('PUT', '/file', { path: toApiPath(path) }, body);
    } else {
      await this.request('POST', '/file', { dir: toApiPath(dirname(path)), name: basename(path) }, body);
    }
    return (await this.stat(path)) ?? { path, name: basename(path), type: 'file' };
  }

  async createFile(path: string, content: FileContent, options?: CreateOptions): Promise<FileEntry> {
    const body = content instanceof Blob ? content : new Blob([typeof content === 'string' ? content : content.slice()]);
    const params = { dir: toApiPath(dirname(path)), name: basename(path) }; // no on_exist → HiDrive refuses existing names
    if (options?.onProgress || options?.signal) {
      await this.uploadWithProgress(params, body, options);
    } else {
      await this.request('POST', '/file', params, body);
    }
    return (await this.stat(path)) ?? { path, name: basename(path), type: 'file' };
  }

  /** Creates ONE folder; the parent must exist (SafeStorage creates parents within its zones). */
  async createFolder(path: string): Promise<FileEntry> {
    const p = normalizePath(path);
    const existing = await this.stat(p);
    if (existing) {
      if (existing.type !== 'folder') throw new AlreadyExistsError(p);
      return existing;
    }
    try {
      await this.request('POST', '/dir', { path: toApiPath(p) });
    } catch (error) {
      if (!(error instanceof AlreadyExistsError)) throw error; // created in parallel – fine
    }
    return (await this.stat(p)) ?? { path: p, name: basename(p), type: 'folder' };
  }

  async move(from: string, to: string): Promise<FileEntry> {
    const source = await this.stat(from);
    if (!source) throw new NotFoundError(from);
    await this.request('POST', source.type === 'folder' ? '/dir/move' : '/file/move', { src: toApiPath(from), dst: toApiPath(to) });
    return (await this.stat(to)) ?? { ...source, path: to, name: basename(to) };
  }

  async delete(path: string): Promise<void> {
    const target = await this.stat(path);
    if (!target) throw new NotFoundError(path);
    if (target.type === 'folder') await this.request('DELETE', '/dir', { path: toApiPath(path), recursive: 'true' });
    else await this.request('DELETE', '/file', { path: toApiPath(path) });
  }

  // ---------- HTTP ----------

  private async json<T>(method: string, endpoint: string, params: Record<string, string>): Promise<T> {
    return (await (await this.request(method, endpoint, params)).json()) as T;
  }

  private async request(
    method: string,
    endpoint: string,
    params: Record<string, string>,
    body?: Blob,
    retried = false,
  ): Promise<Response> {
    const token = retried ? await this.options.refreshAccessToken() : await this.options.getAccessToken();
    const url = `${this.options.apiBase}${endpoint}?${new URLSearchParams(params).toString()}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
      },
      body,
    });
    if (response.status === 401 && !retried) return this.request(method, endpoint, params, body, true);
    if (!response.ok) throw await toError(response, fromApiPath(params.path ?? params.src ?? `${params.dir}/${params.name}`));
    return response;
  }

  private async uploadWithProgress(params: Record<string, string>, body: Blob, options: CreateOptions): Promise<void> {
    const token = await this.options.getAccessToken();
    const url = `${this.options.apiBase}/file?${new URLSearchParams(params).toString()}`;
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (event) => options.onProgress?.(event.loaded, event.total || body.size);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else if (xhr.status === 409) reject(new AlreadyExistsError(`${params.dir}/${params.name}`));
        else reject(new HiDriveError(xhr.status, xhr.statusText || 'upload failed'));
      };
      xhr.onerror = () => reject(new HiDriveError(0, 'network error'));
      xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
      options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(body);
    });
  }
}

/** HiDrive returns names and paths URL-encoded ("Neue%20Songs"). */
export function decodeHiDrive(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // not encoded / malformed – use as is
  }
}

function toEntry(object: HiDriveObject, parentPath: string): FileEntry {
  const name = object.name !== undefined ? decodeHiDrive(object.name) : '';
  const path = object.path ? fromApiPath(decodeHiDrive(object.path)) : normalizePath(`${parentPath}/${name}`);
  return {
    path,
    name: name || basename(path),
    type: object.type === 'dir' ? 'folder' : 'file',
    id: object.id,
    size: object.size,
    modifiedAt: object.mtime !== undefined ? new Date(object.mtime * 1000).toISOString() : undefined,
    version: object.mtime !== undefined ? `${object.mtime}:${object.chash ?? object.size ?? ''}` : undefined,
  };
}

async function toError(response: Response, path: string): Promise<Error> {
  if (response.status === 404) return new NotFoundError(path);
  if (response.status === 409) return new AlreadyExistsError(path);
  const data = (await response.json().catch(() => ({}))) as { msg?: string };
  return new HiDriveError(response.status, data.msg ?? response.statusText);
}
