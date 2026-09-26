/**
 * Path helpers for storage providers. All paths are absolute, use "/" as separator
 * and are compared case-sensitively (HiDrive paths are case-sensitive).
 */

export class InvalidPathError extends Error {
  constructor(path: string, reason: string) {
    super(`Invalid path "${path}": ${reason}`);
    this.name = 'InvalidPathError';
  }
}

/** Normalizes a path: collapses duplicate slashes, removes "." and trailing slashes. Rejects "..". */
export function normalizePath(path: string): string {
  if (!path.startsWith('/')) throw new InvalidPathError(path, 'must be absolute');
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    // ".." is rejected instead of resolved, so a path can never escape a zone by accident.
    if (segment === '..') throw new InvalidPathError(path, '".." is not allowed');
    if (segment.includes('\0')) throw new InvalidPathError(path, 'contains a null byte');
    segments.push(segment);
  }
  return '/' + segments.join('/');
}

export function joinPath(base: string, ...parts: string[]): string {
  return normalizePath([base, ...parts].join('/'));
}

/** True if `path` equals `root` or lies inside it. */
export function isWithin(path: string, root: string): boolean {
  const p = normalizePath(path);
  const r = normalizePath(root);
  if (r === '/') return true;
  return p === r || p.startsWith(r + '/');
}

export function dirname(path: string): string {
  const p = normalizePath(path);
  const index = p.lastIndexOf('/');
  return index <= 0 ? '/' : p.slice(0, index);
}

export function basename(path: string): string {
  const p = normalizePath(path);
  return p.slice(p.lastIndexOf('/') + 1);
}
