import { joinPath, type SafeStorage } from '@/core/storage';

/** Band logo upload (design system §8). Files are app-created in `_BandApp/branding/`. */

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export type LogoVariant = 'dark' | 'light';
type LogoType = 'png' | 'svg';

const MIME: Record<LogoType, string> = { png: 'image/png', svg: 'image/svg+xml' };

export class LogoFileError extends Error {
  constructor(public readonly reason: 'type' | 'size') {
    super(`Invalid logo file: ${reason}`);
    this.name = 'LogoFileError';
  }
}

/** Files offered in the HiDrive picker (the content is checked again when one is chosen). */
export const isLogoFileName = (name: string) => /\.(svg|png)$/i.test(name);

/**
 * Checks extension AND content (F10 §5.4): PNG magic bytes or SVG markup.
 * The whole SVG is searched: XML prolog, comments and DOCTYPE of editor exports
 * (Illustrator, Inkscape) can push the `<svg` tag far down.
 */
export async function detectLogoType(file: Blob & { name?: string }): Promise<LogoType> {
  if (file.size > LOGO_MAX_BYTES) throw new LogoFileError('size');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  if (isPng) return 'png';
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(encoding).decode(bytes).toLowerCase();
  if (/<svg[\s/>]/.test(text)) return 'svg';
  throw new LogoFileError('type');
}

/** Stores the logo as a NEW file (never overwrites; old logos stay, R-DATA-05) and returns its path. */
export async function storeLogo(storage: SafeStorage, appRoot: string, variant: LogoVariant, file: Blob): Promise<string> {
  const type = await detectLogoType(file);
  const path = joinPath(appRoot, 'branding', `logo-${variant}-${Date.now()}.${type}`);
  await storage.createFile(path, file.slice(0, file.size, MIME[type]));
  return path;
}

/**
 * Uses an image that is already in the HiDrive as logo. The original is only read, never changed;
 * a copy goes to `_BandApp/branding/`, so the logo keeps working when someone moves or renames the original.
 */
export async function adoptLogo(storage: SafeStorage, appRoot: string, variant: LogoVariant, sourcePath: string): Promise<string> {
  const entry = await storage.stat(sourcePath);
  if (entry?.size !== undefined && entry.size > LOGO_MAX_BYTES) throw new LogoFileError('size');
  return storeLogo(storage, appRoot, variant, await storage.readBlob(sourcePath));
}

/**
 * Reads a stored logo with its image type. HiDrive serves files without one, and browsers
 * refuse to show an SVG in `<img>` unless the blob says `image/svg+xml`.
 */
export async function readLogo(storage: SafeStorage, path: string): Promise<Blob> {
  const blob = await storage.readBlob(path);
  const type = MIME[path.toLowerCase().endsWith('.svg') ? 'svg' : 'png'];
  return blob.type === type ? blob : blob.slice(0, blob.size, type);
}
