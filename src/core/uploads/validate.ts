import { AUDIO_EXTENSIONS, extensionOf, LYRICS_EXTENSIONS } from '@/core/files/scan';

/** Upload checks (F10 §5.4): extension AND content signature, size limits. */

export type UploadKind = 'audio' | 'lyrics';

export const MAX_BYTES: Record<UploadKind, number> = {
  audio: 200 * 1024 * 1024,
  lyrics: 20 * 1024 * 1024,
};
export const LARGE_AUDIO_BYTES = 50 * 1024 * 1024;

export class UploadFileError extends Error {
  constructor(public readonly reason: 'type' | 'size' | 'content' | 'empty') {
    super(`Invalid upload: ${reason}`);
    this.name = 'UploadFileError';
  }
}

const startsWith = (bytes: Uint8Array, text: string, offset = 0) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));

function signatureMatches(ext: string, b: Uint8Array): boolean {
  switch (ext) {
    case 'mp3':
      return startsWith(b, 'ID3') || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0);
    case 'wav':
      return startsWith(b, 'RIFF') && startsWith(b, 'WAVE', 8);
    case 'flac':
      return startsWith(b, 'fLaC');
    case 'ogg':
      return startsWith(b, 'OggS');
    case 'm4a':
      return startsWith(b, 'ftyp', 4);
    case 'aac':
      return (b[0] === 0xff && ((b[1] ?? 0) & 0xf0) === 0xf0) || startsWith(b, 'ID3') || startsWith(b, 'ftyp', 4);
    case 'pdf':
      return startsWith(b, '%PDF');
    case 'docx':
    case 'odt':
    case 'pages':
      return b[0] === 0x50 && b[1] === 0x4b; // zip container
    case 'doc':
      return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
    case 'rtf':
      return startsWith(b, '{\\rtf');
    case 'txt':
      return !b.includes(0); // text files contain no NUL bytes
    default:
      return false;
  }
}

export async function checkUpload(file: Blob & { name: string }, kind: UploadKind): Promise<{ ext: string; large: boolean }> {
  const ext = extensionOf(file.name);
  const allowed: readonly string[] = kind === 'audio' ? AUDIO_EXTENSIONS : LYRICS_EXTENSIONS;
  if (!allowed.includes(ext)) throw new UploadFileError('type');
  if (file.size === 0) throw new UploadFileError('empty');
  if (file.size > MAX_BYTES[kind]) throw new UploadFileError('size');
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (!signatureMatches(ext, head)) throw new UploadFileError('content');
  return { ext, large: kind === 'audio' && file.size > LARGE_AUDIO_BYTES };
}

export function kindOf(name: string): UploadKind | null {
  const ext = extensionOf(name);
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio';
  if ((LYRICS_EXTENSIONS as readonly string[]).includes(ext)) return 'lyrics';
  return null;
}
