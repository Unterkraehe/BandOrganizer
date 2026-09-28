import { joinPath, type SafeStorage } from '@/core/storage';

/** Band logo upload (design system §8). Files are app-created in `_BandApp/branding/`. */

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export type LogoVariant = 'dark' | 'light';

export class LogoFileError extends Error {
  constructor(public readonly reason: 'type' | 'size') {
    super(`Invalid logo file: ${reason}`);
    this.name = 'LogoFileError';
  }
}

/** Checks extension AND content (F10 §5.4): PNG magic bytes or SVG markup. */
export async function detectLogoType(file: Blob & { name?: string }): Promise<'png' | 'svg'> {
  if (file.size > LOGO_MAX_BYTES) throw new LogoFileError('size');
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const isPng = head.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b);
  if (isPng) return 'png';
  const text = new TextDecoder().decode(head).toLowerCase();
  if (text.includes('<svg')) return 'svg';
  throw new LogoFileError('type');
}

/** Stores the logo as a NEW file (never overwrites; old logos stay, R-DATA-05) and returns its path. */
export async function storeLogo(storage: SafeStorage, appRoot: string, variant: LogoVariant, file: Blob): Promise<string> {
  const type = await detectLogoType(file);
  const path = joinPath(appRoot, 'branding', `logo-${variant}-${Date.now()}.${type}`);
  const blob = type === 'svg' ? new Blob([await file.arrayBuffer()], { type: 'image/svg+xml' }) : file;
  await storage.createFile(path, blob);
  return path;
}
