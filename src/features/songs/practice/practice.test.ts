// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { PracticeStore } from '../practice';

describe('PracticeStore (F4 §7.4)', () => {
  afterEach(() => vi.useRealTimers());

  it('saves per member, song and version (debounced) and reads them back', async () => {
    vi.useFakeTimers();
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const storage = new SafeStorage(provider, { appRoot: '/h/_BandApp' });
    const store = new PracticeStore(storage, '/h/_BandApp', () => 'm_lisa');
    await store.load('song_1');
    store.save('song_1', 'r_1', { tempo: 0.8, semitones: -2, loop: { start: 10, end: 20, enabled: true } });
    store.save('song_1', 'r_2', { tempo: 1, semitones: 0, loop: null }); // default → not stored
    await vi.runAllTimersAsync();
    expect(provider.has('/h/_BandApp/songs/song_1/practice/m_lisa.json')).toBe(true);

    const other = new PracticeStore(storage, '/h/_BandApp', () => 'm_lisa');
    await expect(other.settingsFor('song_1', 'r_1')).resolves.toEqual({ tempo: 0.8, semitones: -2, loop: { start: 10, end: 20, enabled: true } });
    await expect(other.settingsFor('song_1', 'r_2')).resolves.toBeNull();
    const tom = new PracticeStore(storage, '/h/_BandApp', () => 'm_tom');
    await expect(tom.settingsFor('song_1', 'r_1')).resolves.toBeNull();
  });
});
