/** Metadata of a file or folder as returned by a storage provider. */
export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'folder';
  /** Provider-specific stable ID (e.g. HiDrive file ID), if available. */
  id?: string;
  size?: number;
  /** ISO timestamp of the last modification. */
  modifiedAt?: string;
  /** Opaque version marker used for conflict checks (R-DATA-07), e.g. ETag or mtime. */
  version?: string;
}

export type FileContent = string | Blob | Uint8Array;

export interface WriteOptions {
  /** Only write if the file is still at this version; otherwise throw ConflictError (R-DATA-07). */
  expectedVersion?: string;
}

export interface CreateOptions {
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

/**
 * Raw storage provider (HiDrive, later Google Drive, …).
 *
 * IMPORTANT: feature code never uses a provider directly. It always goes through
 * `SafeStorage` (guard.ts), which enforces the data-safety rules (R-DATA-04, R-CODE-01).
 */
export interface StorageProvider {
  readonly id: string;

  // --- read ---
  list(path: string): Promise<FileEntry[]>;
  stat(path: string): Promise<FileEntry | null>;
  readText(path: string): Promise<string>;
  readBlob(path: string): Promise<Blob>;

  // --- write (only called by the guard) ---
  /** Creates or updates a text file. */
  writeText(path: string, content: string, options?: WriteOptions): Promise<FileEntry>;
  /** Creates a new file. MUST fail with AlreadyExistsError if the path exists. */
  createFile(path: string, content: FileContent, options?: CreateOptions): Promise<FileEntry>;
  /** Creates ONE folder – the parent must exist (the guard creates missing parents inside its zones). An existing folder is not an error. */
  createFolder(path: string): Promise<FileEntry>;
  move(from: string, to: string): Promise<FileEntry>;
  delete(path: string): Promise<void>;

  /** Server-side copy of ONE file to a path that must not exist yet (optional capability). */
  copyFile?(from: string, to: string): Promise<FileEntry>;

  // --- sharing (optional capability, only called by the guard) ---
  /** Public, read-only link to ONE file – used for the calendar subscription (F5 §6.5b). */
  createShareLink?(path: string): Promise<ShareLink>;
  /** Invalidates a link created with createShareLink. */
  deleteShareLink?(id: string): Promise<void>;
}

export interface ShareLink {
  id: string;
  url: string;
}

export class NotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Not found: ${path}`);
    this.name = 'NotFoundError';
  }
}

export class AlreadyExistsError extends Error {
  constructor(public readonly path: string) {
    super(`Already exists: ${path}`);
    this.name = 'AlreadyExistsError';
  }
}

export class ConflictError extends Error {
  constructor(
    public readonly path: string,
    public readonly currentVersion: string | undefined,
  ) {
    super(`File was changed in the meantime: ${path}`);
    this.name = 'ConflictError';
  }
}
