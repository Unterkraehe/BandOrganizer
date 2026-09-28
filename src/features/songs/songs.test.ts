// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cleanTitle, deriveSongs, relativeFolder, songIdFor, sortSongs } from './model';

describe('songs model (F4)', () => {
  it('cleans titles (F4 §6.2)', () => {
    expect(cleanTitle('07_Hell_Is_Empty_(Demo).mp3')).toBe('Hell Is Empty (Demo)');
    expect(cleanTitle('01 - Midnight Engine.wav')).toBe('Midnight Engine');
    expect(cleanTitle('2026 Summer.mp3')).toBe('2026 Summer');
    expect(cleanTitle('Open Road.m4a')).toBe('Open Road');
    expect(cleanTitle('99.mp3')).toBe('99');
  });

  it('derives stable ids from the file id or path (F4 §6.1)', () => {
    const a = songIdFor({ id: 'b123', path: '/x/a.mp3' });
    expect(a).toBe(songIdFor({ id: 'b123', path: '/moved/a.mp3' }));
    expect(a).not.toBe(songIdFor({ id: 'b124', path: '/x/a.mp3' }));
    expect(songIdFor({ path: '/x/a.mp3' })).toMatch(/^song_[0-9a-z]{7}$/);
  });

  it('derives songs with folder, "Neu" and durations', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    const songs = deriveSongs(
      [
        { path: '/users/b/Songs/02 - Zebra.mp3', name: '02 - Zebra.mp3', modifiedAt: '2026-09-27T00:00:00Z' },
        { path: '/users/b/alpha.mp3', name: 'alpha.mp3', modifiedAt: '2026-01-01T00:00:00Z' },
      ],
      '/users/b',
      { [songIdFor({ path: '/users/b/alpha.mp3' })]: 241 },
      now,
    );
    expect(songs[0]).toMatchObject({ title: 'Zebra', folder: 'Songs', isNew: true });
    expect(songs[1]).toMatchObject({ title: 'alpha', folder: '', isNew: false, durationSec: 241 });
    expect(sortSongs(songs, 'az').map((s) => s.title)).toEqual(['alpha', 'Zebra']);
    expect(sortSongs(songs, 'recent').map((s) => s.title)).toEqual(['Zebra', 'alpha']);
    expect(relativeFolder('/users/b/Proben/2026/x.wav', '/users/b')).toBe('Proben/2026');
  });
});
