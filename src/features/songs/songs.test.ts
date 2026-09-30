// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { LibraryStore } from './library';
import { buildSongs, cleanTitle, recordingIdFor, songIdFor, sortSongs, versionSuggestions, type SongMeta } from './model';
import { createNote, listNotes, saveNote } from './repository';

const HOME = '/users/b';
const APP = `${HOME}/_BandApp`;

describe('songs model (F4)', () => {
  it('cleans titles (F4 §6.2)', () => {
    expect(cleanTitle('07_Hell_Is_Empty_(Demo).mp3')).toBe('Hell Is Empty (Demo)');
    expect(cleanTitle('01 - Midnight Engine.wav')).toBe('Midnight Engine');
    expect(cleanTitle('2026 Summer.mp3')).toBe('2026 Summer');
  });

  it('derives stable ids (F4 §6.1)', () => {
    expect(songIdFor({ id: 'b1', path: '/a' })).toBe(songIdFor({ id: 'b1', path: '/moved' }));
    expect(recordingIdFor({ path: '/x.mp3' })).toMatch(/^r_[0-9a-z]{7}$/);
  });

  it('builds songs from files only, with "Neu"', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    const songs = buildSongs(
      [
        { path: `${HOME}/Songs/02 - Zebra.mp3`, name: '02 - Zebra.mp3', modifiedAt: '2026-09-27T00:00:00Z' },
        { path: `${HOME}/alpha.mp3`, name: 'alpha.mp3', modifiedAt: '2026-01-01T00:00:00Z' },
      ],
      {},
      HOME,
      now,
    );
    expect(sortSongs(songs, 'az').map((s) => [s.title, s.recording!.folder, s.isNew])).toEqual([
      ['alpha', '', false],
      ['Zebra', 'Songs', true],
    ]);
  });

  it('groups merged songs as versions and follows the Band-Version (F4 §6.8)', () => {
    const a = { path: `${HOME}/Songs/Slow Burn.mp3`, name: 'Slow Burn.mp3', size: 10 };
    const b = { path: `${HOME}/Live/Slow Burn (Live).mp3`, name: 'Slow Burn (Live).mp3', size: 20 };
    const idA = songIdFor(a);
    const idB = songIdFor(b);
    const base = { mergedSongIds: [], mergedInto: null, bandVersion: null, recordings: [] } as unknown as SongMeta;
    const metas = {
      [idA]: { ...base, displayTitle: null, mergedSongIds: [idB], bandVersion: { recordingId: recordingIdFor(b), setBy: 'm', setAt: 'x' }, recordings: [] },
      [idB]: { ...base, mergedInto: idA, recordings: [] },
    } as unknown as Record<string, SongMeta>;
    const songs = buildSongs([a, b], metas, HOME);
    expect(songs).toHaveLength(1);
    expect(songs[0]!.title).toBe('Slow Burn');
    expect(songs[0]!.recordings.map((r) => r.fileName)).toEqual(['Slow Burn.mp3', 'Slow Burn (Live).mp3']);
    expect(songs[0]!.recording!.fileName).toBe('Slow Burn (Live).mp3');
  });

  it('re-matches a moved file by name and size (spike S2 fallback)', () => {
    const moved = { path: `${HOME}/Neu/a.mp3`, name: 'a.mp3', size: 5, id: 'new-id' };
    const oldId = 'song_old';
    const metas = {
      [oldId]: { displayTitle: 'Mein Song', recordings: [{ id: 'r_old', path: `${HOME}/Alt/a.mp3`, size: 5, label: null }], mergedSongIds: [], mergedInto: null, bandVersion: null },
    } as unknown as Record<string, SongMeta>;
    const songs = buildSongs([moved], metas, HOME);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ id: oldId, title: 'Mein Song', missing: false });
    expect(songs[0]!.recording!.path).toBe(moved.path);
  });

  it('suggests similar titles as versions', () => {
    const songs = buildSongs(
      [
        { path: `${HOME}/a/Open Road.mp3`, name: 'Open Road.mp3' },
        { path: `${HOME}/b/Open Road (Demo).mp3`, name: 'Open Road (Demo).mp3' },
        { path: `${HOME}/b/Other.mp3`, name: 'Other.mp3' },
      ],
      {},
      HOME,
    );
    const road = songs.find((s) => s.title === 'Open Road')!;
    expect(versionSuggestions(road, songs).map((s) => s.title)).toEqual(['Open Road (Demo)']);
  });
});

describe('LibraryStore actions', () => {
  let provider: MemoryStorageProvider;
  let store: LibraryStore;
  let member = 'm_lisa';

  beforeEach(async () => {
    provider = new MemoryStorageProvider();
    provider.seed(`${HOME}/Songs/Open Road.mp3`, 'a');
    provider.seed(`${HOME}/Demos/Open Road (Demo).mp3`, 'bb');
    const storage = new SafeStorage(provider, { appRoot: APP });
    store = new LibraryStore({ storage, home: HOME, appRoot: APP, skip: [APP], cacheKey: null, memberId: () => member });
    await store.load();
  });

  const byTitle = (title: string) => store.getState().songs.find((s) => s.title === title)!;

  it('creates meta.json lazily and edits details with a conflict check (R-DATA-07)', async () => {
    const song = byTitle('Open Road');
    expect(song.hasMeta).toBe(false);
    const original = { displayTitle: null, key: null, bpm: null, tuning: null, tagIds: [] };
    await store.updateDetails(song.id, { ...original, key: 'Am', bpm: 120 }, original);
    expect(provider.has(`${APP}/songs/${song.id}/meta.json`)).toBe(true);
    expect(byTitle('Open Road')).toMatchObject({ key: 'Am', bpm: 120, hasMeta: true });
    // someone else's stale form changing the same field → conflict
    member = 'm_tom';
    await expect(store.updateDetails(song.id, { ...original, key: 'C' }, original)).rejects.toBeInstanceOf(ConflictError);
    // a different field from a stale form is fine and keeps the key
    await store.updateDetails(song.id, { ...original, tuning: 'Drop D' }, original);
    expect(byTitle('Open Road')).toMatchObject({ key: 'Am', tuning: 'Drop D' });
  });

  it('merges, sets the Band-Version and splits again (F4 §6.8)', async () => {
    const main = byTitle('Open Road');
    const demo = byTitle('Open Road (Demo)');
    await store.mergeInto(demo.id, main.id);
    expect(store.getState().songs).toHaveLength(1);
    const merged = byTitle('Open Road');
    expect(merged.recordings).toHaveLength(2);
    const demoRec = merged.recordings.find((r) => r.originSongId === demo.id)!;
    await store.setBandVersion(main.id, demoRec.id);
    await store.setRecordingLabel(main.id, demoRec.id, 'Demo');
    expect(byTitle('Open Road').recording!).toMatchObject({ id: demoRec.id, label: 'Demo' });
    await store.split(main.id, demoRec.id);
    expect(store.getState().songs).toHaveLength(2);
    expect(byTitle('Open Road').recording!.originSongId).toBe(main.id);
  });

  it('archives, hides, tags and stores durations', async () => {
    const song = byTitle('Open Road');
    await store.setArchived(song.id, true);
    expect(byTitle('Open Road')).toMatchObject({ archived: true });
    const tag = await store.createTag('Ballade');
    await store.setTags(song.id, [tag.id]);
    expect(byTitle('Open Road').tagIds).toEqual([tag.id]);
    await expect(store.createTag(' ballade ')).rejects.toThrow();
    await store.deleteTag(tag.id);
    expect(store.getState().tags).toHaveLength(0);
    await store.recordDuration(song.id, song.recording!.id, 241.4);
    expect(byTitle('Open Road').recording!.durationSec).toBe(241);
    await store.setHidden(byTitle('Open Road (Demo)').id, true);
    expect(byTitle('Open Road (Demo)').hidden).toBe(true);
  });
});

describe('notes (F4 §6.4)', () => {
  it('keeps private notes private and soft-deletes', async () => {
    const provider = new MemoryStorageProvider();
    provider.seedFolder(HOME);
    const storage = new SafeStorage(provider, { appRoot: APP });
    const pub = await createNote(storage, APP, 'song_1', 'public', 'm_a', { text: ' Bridge 2× ', positionSec: 92, recordingId: 'r_1' });
    await createNote(storage, APP, 'song_1', 'private', 'm_a', { text: 'Kapo 3', positionSec: null, recordingId: 'r_1' });
    expect(pub.note).toMatchObject({ text: 'Bridge 2×', positionSec: 92, recordingId: 'r_1', pinned: false });
    expect(await listNotes(storage, APP, ['song_1'], 'm_a')).toHaveLength(2);
    expect(await listNotes(storage, APP, ['song_1'], 'm_b')).toHaveLength(1);
    const pinned = await saveNote(storage, APP, pub, 'm_b', 'pin');
    expect(pinned.note.pinned).toBe(true);
    await saveNote(storage, APP, pinned, 'm_a', 'delete');
    expect(await listNotes(storage, APP, ['song_1'], 'm_b')).toHaveLength(0);
  });
});

describe('version suggestions are generous (v0.12.3)', () => {
  it('ignores version words, numbers and dates at the end', async () => {
    const { baseTitle, baseTitles } = await import('./model');
    expect(baseTitle('Hush edit 05')).toBe('hush');
    expect(baseTitle('Hush')).toBe('hush');
    expect(baseTitle('Hush_Probe_17.05.26')).toBe('hush');
    expect(baseTitle('Turbo Lover (Live) v2')).toBe('turbo lover');
    expect(baseTitle('18 and life')).toBe('18 and life');
    expect(baseTitle('The End')).toBe('the end');
    expect(baseTitles('Accept - Breaking the law')).toEqual(expect.arrayContaining(['breaking the law', 'accept']));
  });
});

describe('version suggestions: Holy Diver family (v0.12.4)', () => {
  it('every file name suggests every other one', async () => {
    const { areSimilarSongs, cleanTitle } = await import('./model');
    const names = [
      '01-Holy Diver', '01-Holy Diver edit 05', '01-Holy Diver edit 05 ohne Intro', '01-Holy Diver Intro', '01-Holy Diver Intro edit 05',
      'Holy Diver', 'Holy Diver edit 05', 'Holy Diver edit 05 ohne Intro', 'Holy Diver Intro', 'Holy Diver Intro edit 05',
      'Dio - Holy Diver', 'Dio Holy Diver edit 05', 'Holy Diver - Dio edit 05', 'HolyDiver edit 05 ohne Intro', 'Holy Diver-Intro',
    ];
    const song = (file: string) => ({ title: cleanTitle(`${file}.mp3`), recordings: [{ fileName: `${file}.mp3` }] }) as never;
    for (const a of names) for (const b of names) expect(areSimilarSongs(song(a), song(b)), `${a} ~ ${b}`).toBe(true);
  });

  it('does not mix up different songs', async () => {
    const { areSimilarSongs } = await import('./model');
    const song = (title: string) => ({ title, recordings: [{ fileName: `${title}.mp3` }] }) as never;
    const pairs: [string, string][] = [
      ['Holy Diver', 'Holy Smoke'],
      ['Hush', 'Hush Hush'],
      ['Run to the hills', 'Rainbow in the dark'],
      ['Back in Black', 'Black Sabbath'],
      ['18 and life', '18 till I die'],
      ['Turbo Lover', 'Love Gun'],
    ];
    for (const [a, b] of pairs) expect(areSimilarSongs(song(a), song(b)), `${a} ≁ ${b}`).toBe(false);
    expect(areSimilarSongs(song('Hush'), song('Hush edit 05'))).toBe(true);
  });

  it('keeps numbers that belong to the title', async () => {
    const { cleanTitle } = await import('./model');
    expect(cleanTitle('01-Holy Diver.mp3')).toBe('Holy Diver');
    expect(cleanTitle('01 Holy Diver.mp3')).toBe('Holy Diver');
    expect(cleanTitle('12 - Tokyo.mp3')).toBe('Tokyo');
    expect(cleanTitle('18 and life.mp3')).toBe('18 and life');
  });
});

describe('member suggestions (v0.13.2)', () => {
  it('a song is a suggestion while all its files lie in a "Vorschläge" folder', async () => {
    const { buildSongs, isSuggestionFolder } = await import('./model');
    expect(isSuggestionFolder('Vorschläge/Lisa', ['Vorschläge'])).toBe(true);
    expect(isSuggestionFolder('Band/Vorschlaege 2026', ['Vorschläge'])).toBe(true);
    expect(isSuggestionFolder('Songs/Rock', ['Vorschläge'])).toBe(false);
    const f = (path: string) => ({ path: `/h/${path}`, name: path.split('/').pop()!, id: path });
    const songs = buildSongs([f('Vorschläge/Tom/Hush.mp3'), f('Songs/Tokyo.mp3'), f('Vorschläge/Shine.mp3'), f('Proben/Shine probe.mp3')], {}, '/h', Date.now(), undefined, ['Vorschläge']);
    const byTitle = (title: string) => songs.find((s) => s.title === title)!;
    expect(byTitle('Hush').suggested).toBe(true);
    expect(byTitle('Tokyo').suggested).toBe(false);
    // not grouped: "Shine probe" is its own song here – but a song WITH a rehearsal recording is not a suggestion
    expect(byTitle('Shine').suggested).toBe(true);
    expect(buildSongs([f('Vorschläge/Hush.mp3')], {}, '/h', Date.now(), undefined, []).find((s) => s.title === 'Hush')!.suggested).toBe(false);
  });
});
