// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { isAudioFile, scanAudioFiles, scanFiles, type ScanResult } from './scan';

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

describe('song sync: only changed folders are read again (F11 §4.7)', () => {
  const home = '/users/band';
  function setup() {
    const provider = new MemoryStorageProvider();
    for (const path of ['Songs/a.mp3', 'Songs/Texte/a.pdf', 'Proben/2026/c.m4a', 'Proben/2025/d.wav', 'Proben/2025/alt/e.mp3', '_BandApp/app.json']) {
      provider.seed(`${home}/${path}`, 'x');
    }
    const listed: string[] = [];
    const list = provider.list.bind(provider);
    provider.list = async (path) => {
      listed.push(path.replace(`${home}/`, '').replace(home, '(home)'));
      return list(path);
    };
    const storage = new SafeStorage(provider, { appRoot: `${home}/_BandApp` });
    const scan = async (previous?: ScanResult, skip = [`${home}/_BandApp`]) => {
      listed.length = 0;
      const report = { folders: 0, failedFolders: [] as string[], unchanged: 0 };
      const result = await scanFiles(storage, { root: home, skip, report, previous: previous && { snapshot: previous.snapshot, audio: previous.audio, documents: previous.documents } });
      return { result, report, listed: [...listed].sort() };
    };
    return { provider, scan, list };
  }
  const paths = (r: ScanResult) => r.audio.map((f) => f.path.replace(`${home}/`, ''));

  it('nothing changed → one listing, same result', async () => {
    const { scan } = setup();
    const first = await scan();
    expect(first.listed).toEqual(['(home)', 'Proben', 'Proben/2025', 'Proben/2025/alt', 'Proben/2026', 'Songs', 'Songs/Texte']);
    const second = await scan(first.result);
    expect(second.listed).toEqual(['(home)']);
    expect(second.report).toMatchObject({ folders: 1, unchanged: 2 });
    expect(second.result).toEqual(first.result);
  });

  it('a new, a changed and a removed file are found by reading only the folders on their way', async () => {
    const { provider, scan } = setup();
    const first = await scan();
    provider.seed(`${home}/Proben/2026/neu.mp3`, 'x');
    const added = await scan(first.result);
    expect(added.listed).toEqual(['(home)', 'Proben', 'Proben/2026']);
    expect(paths(added.result)).toEqual(['Proben/2025/alt/e.mp3', 'Proben/2025/d.wav', 'Proben/2026/c.m4a', 'Proben/2026/neu.mp3', 'Songs/a.mp3']);
    expect(added.result.documents.map((d) => d.name)).toEqual(['a.pdf']);

    await provider.delete(`${home}/Proben/2025/alt/e.mp3`);
    const removed = await scan(added.result);
    expect(removed.listed).toEqual(['(home)', 'Proben', 'Proben/2025', 'Proben/2025/alt']);
    expect(paths(removed.result)).toEqual(['Proben/2025/d.wav', 'Proben/2026/c.m4a', 'Proben/2026/neu.mp3', 'Songs/a.mp3']);
    // and the next sync is one listing again
    expect((await scan(removed.result)).listed).toEqual(['(home)']);
  });

  it('a folder that cannot be read keeps its songs and is tried again next time', async () => {
    const { provider, scan, list } = setup();
    const first = await scan();
    provider.seed(`${home}/Proben/2026/neu.mp3`, 'x');
    const broken = provider.list;
    provider.list = async (path) => {
      if (path.endsWith('/Proben/2026')) throw new Error('network');
      return broken(path);
    };
    const failed = await scan(first.result);
    expect(failed.report.failedFolders).toEqual([`${home}/Proben/2026`]);
    expect(paths(failed.result)).toEqual(paths(first.result)); // nothing disappears

    provider.list = broken;
    const retried = await scan(failed.result);
    expect(retried.listed).toEqual(['(home)', 'Proben', 'Proben/2026']);
    expect(paths(retried.result)).toContain('Proben/2026/neu.mp3');
    void list;
  });

  it('reads everything when the excluded folders changed or the storage reports no tree versions', async () => {
    const { provider, scan } = setup();
    const first = await scan();
    const excluded = await scan(first.result, [`${home}/_BandApp`, `${home}/Proben/2025`]);
    expect(excluded.listed).toEqual(['(home)', 'Proben', 'Proben/2026', 'Songs', 'Songs/Texte']);
    expect(paths(excluded.result)).toEqual(['Proben/2026/c.m4a', 'Songs/a.mp3']);

    const plain = provider.list;
    provider.list = async (path) => (await plain(path)).map((e) => ({ ...e, treeVersion: undefined }));
    const without = await scan();
    expect(without.result.snapshot.folders).toEqual({});
    expect((await scan(without.result)).listed).toHaveLength(7);
  });
});
