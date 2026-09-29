// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { sanitizeFileName, uniqueName, withSuffix } from './names';
import { UploadQueue } from './queue';
import { checkUpload, UploadFileError } from './validate';

const file = (name: string, bytes: number[] | string) =>
  Object.assign(new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)]), { name });

describe('upload checks (F10 §5.4)', () => {
  it('accepts real files and rejects renamed ones', async () => {
    await expect(checkUpload(file('a.mp3', 'ID3\u0003rest'), 'audio')).resolves.toMatchObject({ ext: 'mp3' });
    await expect(checkUpload(file('a.wav', 'RIFF1234WAVEfmt '), 'audio')).resolves.toBeTruthy();
    await expect(checkUpload(file('a.pdf', '%PDF-1.4'), 'lyrics')).resolves.toBeTruthy();
    await expect(checkUpload(file('a.docx', [0x50, 0x4b, 3, 4]), 'lyrics')).resolves.toBeTruthy();
    await expect(checkUpload(file('a.txt', 'Strophe 1'), 'lyrics')).resolves.toBeTruthy();
    await expect(checkUpload(file('a.mp3', '%PDF-1.4'), 'audio')).rejects.toMatchObject({ reason: 'content' });
    await expect(checkUpload(file('a.exe', 'MZ'), 'audio')).rejects.toBeInstanceOf(UploadFileError);
    await expect(checkUpload(file('a.pdf', '%PDF'), 'audio')).rejects.toMatchObject({ reason: 'type' });
  });
});

describe('names', () => {
  it('adds suffixes instead of overwriting (R-DATA-03)', async () => {
    const provider = new MemoryStorageProvider();
    provider.seed('/h/Songs/Song.mp3', 'x');
    provider.seed('/h/Songs/song (2).mp3', 'x');
    const storage = new SafeStorage(provider, { appRoot: '/h/_BandApp', home: '/h' });
    await expect(uniqueName(storage, '/h/Songs', 'Song.mp3')).resolves.toBe('Song (3).mp3');
    await expect(uniqueName(storage, '/h/Songs', 'Neu.mp3')).resolves.toBe('Neu.mp3');
    await expect(uniqueName(storage, '/h/Neu', 'a.mp3')).resolves.toBe('a.mp3');
    expect(withSuffix('Text', 2)).toBe('Text (2)');
    expect(sanitizeFileName(' A/B\\C .mp3')).toBe('A-B-C .mp3');
  });
});

describe('UploadQueue', () => {
  it('retries temporary errors and reports progress', async () => {
    const queue = new UploadQueue(2, [1, 1]);
    let calls = 0;
    const result = await queue.run('a.mp3', 10, async (progress) => {
      calls++;
      if (calls < 2) throw new Error('network');
      progress(10, 10);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(queue.getItems()[0]).toMatchObject({ status: 'done' });
  });

  it('fails after the retries and offers a manual retry', async () => {
    const queue = new UploadQueue(1, [1]);
    await expect(queue.run('b.mp3', 1, async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(queue.getItems()[0]).toMatchObject({ status: 'failed' });
    expect(queue.active).toBe(0);
  });
});
