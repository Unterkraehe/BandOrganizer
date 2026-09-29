// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { durations, normalizeSegues, numbering, type Setlist } from './model';
import { lastPlayed, suggestions } from './history';
import { newBlock, SetlistStore } from './store';

const APP = '/h/_BandApp';

describe('setlist model (F7)', () => {
  const setlist = {
    blocks: [
      { id: 'b1', name: 'Set 1', pauseAfterMin: 20, entries: [
        { id: 'x1', type: 'song', songId: 'a', note: null, segueToNext: true },
        { id: 'x2', type: 'song', songId: 'b', note: 'Intro länger', segueToNext: true },
        { id: 'x3', type: 'interlude', text: 'Ansage', durationMin: 2 },
      ] },
      { id: 'b2', name: 'Zugabe', pauseAfterMin: null, entries: [{ id: 'x4', type: 'song', songId: 'c', note: null, segueToNext: true }] },
    ],
  } as unknown as Setlist;

  it('numbers songs through all blocks and removes invalid arrows', () => {
    expect([...numbering(setlist)]).toEqual([['x1', 1], ['x2', 2], ['x4', 3]]);
    const fixed = normalizeSegues(setlist);
    expect(fixed.blocks[0]!.entries.map((e) => e.type === 'song' && e.segueToNext)).toEqual([true, false, false]);
    expect((fixed.blocks[1]!.entries[0] as { segueToNext: boolean }).segueToNext).toBe(false);
  });

  it('adds up durations; pauses only count for the total', () => {
    const d = durations(setlist, (id) => ({ a: 200, b: 100 })[id]);
    expect(d.blocks).toEqual([{ seconds: 420, unknown: 0 }, { seconds: 0, unknown: 1 }]);
    expect(d.totalSeconds).toBe(420 + 20 * 60);
  });
});

describe('SetlistStore', () => {
  let store: SetlistStore;
  let member = 'm_a';
  beforeEach(async () => {
    member = 'm_a';
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    store = new SetlistStore({ storage: new SafeStorage(provider, { appRoot: APP }), appRoot: APP, memberId: () => member, cacheKey: null });
    await store.load();
  });

  it('creates, saves with conflict check, duplicates with own personal notes', async () => {
    const s = await store.create('Stadtfest', 'gig');
    const v1 = store.get(s.id)!;
    const block = { ...s.blocks[0]!, entries: [{ id: 'x1', type: 'song' as const, songId: 'a', note: null, segueToNext: false }] };
    await store.save({ ...s, blocks: [block, newBlock('Zugabe')] }, v1.version);
    await expect(store.save({ ...s, name: 'Alt' }, v1.version)).rejects.toBeInstanceOf(ConflictError);

    await store.savePersonal(s.id, { x1: 'Solo 2×' });
    const copy = await store.duplicate(s.id, 'Kopie von Stadtfest');
    expect(copy.copiedFrom).toBe(s.id);
    expect(copy.blocks).toHaveLength(2);
    expect(copy.blocks[0]!.entries[0]!.id).not.toBe('x1');
    const notes = await store.loadPersonal(copy.id);
    expect(Object.values(notes!.notes)).toEqual(['Solo 2×']);
    member = 'm_b';
    await store.savePersonal(s.id, { x1: 'mein Teil' });
    expect(store.getState().setlists).toHaveLength(2);
  });

  it('soft-deletes and restores', async () => {
    const s = await store.create('Probe', 'rehearsal');
    await store.remove(s.id);
    expect(store.get(s.id)!.value.deletedAt).toBeTruthy();
    await store.restore(s.id);
    expect(store.get(s.id)!.value.deletedAt).toBeNull();
  });
});

describe('rehearsal suggestions (F7 §6.6)', () => {
  it('orders never played first, then longest ago; skips archived and cancelled', () => {
    const song = (id: string, extra = {}) => ({ id, title: id, archived: false, hidden: false, recording: {}, mergedSongIds: [], ...extra }) as never;
    const songs = [song('a'), song('b'), song('c'), song('d', { archived: true }), song('e')];
    const sl = (id: string, songIds: string[]) => ({ id, deletedAt: null, blocks: [{ entries: songIds.map((s) => ({ type: 'song', songId: s })) }] }) as never;
    const occ = (date: string, setlistId: string, cancelled = false) => ({ startDate: date, setlistId, cancelled, type: 'rehearsal' }) as never;
    const played = lastPlayed([occ('2026-01-01', 's1'), occ('2026-06-01', 's2'), occ('2026-09-01', 's3', true)], [sl('s1', ['a', 'b']), sl('s2', ['b']), sl('s3', ['c'])], songs);
    expect(suggestions(songs, played, new Set(['e'])).map((x) => x.song.id)).toEqual(['c', 'a', 'b']);
  });
});
