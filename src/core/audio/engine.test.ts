import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine';

/** Minimal fake <audio> for jsdom (which can't play media). */
function fakeAudio() {
  const el = document.createElement('audio');
  let paused = true;
  Object.defineProperty(el, 'paused', { get: () => paused });
  Object.defineProperty(el, 'duration', { get: () => 120, configurable: true });
  el.play = vi.fn(async () => {
    paused = false;
    el.dispatchEvent(new Event('play'));
    el.dispatchEvent(new Event('loadedmetadata'));
  });
  el.pause = vi.fn(() => {
    paused = true;
    el.dispatchEvent(new Event('pause'));
  });
  return el;
}

describe('AudioEngine (F9 v0)', () => {
  it('loads a track as a typed blob, plays, toggles and reports the duration', async () => {
    const audio = fakeAudio();
    const onDuration = vi.fn();
    const loadBlob = vi.fn(async () => new Blob(['x'], { type: 'application/octet-stream' }));
    const createObjectURL = vi.fn(() => 'blob:song');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const engine = new AudioEngine({ loadBlob, onDuration, createAudio: () => audio });

    await engine.playTrack({ id: 's1', title: 'A', path: '/x/a.mp3' });
    expect(engine.getState()).toMatchObject({ status: 'playing', track: { id: 's1' }, duration: 120 });
    expect((createObjectURL.mock.calls[0] as unknown as [Blob])[0].type).toBe('audio/mpeg');
    expect(onDuration).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 120);

    await engine.playTrack({ id: 's1', title: 'A', path: '/x/a.mp3' }); // same song → pause
    expect(engine.getState().status).toBe('paused');
    expect(loadBlob).toHaveBeenCalledTimes(1);

    engine.stop();
    expect(engine.getState()).toMatchObject({ status: 'idle', track: null });
  });

  it('reports load errors without throwing', async () => {
    const engine = new AudioEngine({ loadBlob: async () => Promise.reject(new Error('404')), createAudio: fakeAudio });
    await engine.playTrack({ id: 's2', title: 'B', path: '/x/b.mp3' });
    expect(engine.getState()).toMatchObject({ status: 'error', error: 'load' });
  });
});

describe('practice features (F9)', () => {
  it('loops A–B in element mode and remembers settings changes', async () => {
    const audio = fakeAudio();
    let time = 0;
    Object.defineProperty(audio, 'currentTime', { get: () => time, set: (v: number) => (time = v), configurable: true });
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const onSettingsChange = vi.fn();
    const engine = new AudioEngine({ loadBlob: async () => new Blob(['x']), createAudio: () => audio, onSettingsChange });
    await engine.playTrack({ id: 'r1', songId: 's1', title: 'A', path: '/a.mp3' }, undefined, { loop: { start: 10, end: 20, enabled: true } });
    expect(engine.getState().loop).toEqual({ start: 10, end: 20, enabled: true });
    time = 20.1;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(time).toBe(10);
    engine.setLoop(null);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r1' }), { tempo: 1, semitones: 0, loop: null });
  });

  it('falls back to normal playback if effects are not available (no Web Audio)', async () => {
    const audio = fakeAudio();
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const engine = new AudioEngine({ loadBlob: async () => new Blob(['x']), createAudio: () => audio });
    await engine.playTrack({ id: 'r1', title: 'A', path: '/a.mp3' }, undefined, { tempo: 0.8, semitones: -2 });
    expect(engine.getState()).toMatchObject({ mode: 'element', error: 'effects', tempo: 0.8, semitones: -2, status: 'playing' });
  });

  it('clamps settings to the allowed ranges', async () => {
    const { normalizeSettings } = await import('./engine');
    expect(normalizeSettings({ tempo: 3, semitones: -20, loop: { start: 5, end: 5.5, enabled: true } })).toEqual({ tempo: 1.5, semitones: -12, loop: null });
  });
});
