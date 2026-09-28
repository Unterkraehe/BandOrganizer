// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { isAudioFile, scanAudioFiles } from './scan';

describe('audio scan (F1 §4)', () => {
  it('finds audio files everywhere, skipping app folder, hidden and excluded folders', async () => {
    const provider = new MemoryStorageProvider();
    const home = '/users/band';
    for (const path of [
      'Songs/a.mp3',
      'Songs/b.MP3',
      'Songs/cover.jpg',
      'Proben/2026/c.m4a',
      'Proben/2026/tief/d.wav',
      '_BandApp/branding/x.mp3',
      '.trash/e.mp3',
      'Soundcheck/f.mp3',
      'Texte/a.pdf',
    ]) {
      provider.seed(`${home}/${path}`, 'x');
    }
    const storage = new SafeStorage(provider, { appRoot: `${home}/_BandApp` });
    const progress: number[] = [];
    const files = await scanAudioFiles(storage, {
      root: home,
      skip: [`${home}/_BandApp`, `${home}/Soundcheck`],
      onProgress: (p) => progress.push(p.found),
      concurrency: 2,
    });
    expect(files.map((f) => f.path.replace(`${home}/`, ''))).toEqual([
      'Proben/2026/c.m4a',
      'Proben/2026/tief/d.wav',
      'Songs/a.mp3',
      'Songs/b.MP3',
    ]);
    expect(progress.at(-1)).toBe(4);
  });

  it('recognises audio extensions', () => {
    expect(isAudioFile('x.FLAC')).toBe(true);
    expect(isAudioFile('x.mp3.txt')).toBe(false);
    expect(isAudioFile('.mp3')).toBe(false);
  });
});

describe('scan report', () => {
  it('counts folders and reports unreadable ones instead of stopping', async () => {
    const provider = new MemoryStorageProvider();
    provider.seed('/users/band/A/x.mp3', 'x');
    provider.seed('/users/band/B/y.mp3', 'y');
    const storage = new SafeStorage(provider, { appRoot: '/users/band/_BandApp' });
    const original = provider.list.bind(provider);
    provider.list = async (path: string) => {
      if (path === '/users/band/B') throw new Error('403');
      return original(path);
    };
    const report = { folders: 0, failedFolders: [] as string[] };
    const files = await scanAudioFiles(storage, { root: '/users/band', skip: [], report });
    expect(files.map((f) => f.name)).toEqual(['x.mp3']);
    expect(report).toEqual({ folders: 2, failedFolders: ['/users/band/B'] });
  });
});
