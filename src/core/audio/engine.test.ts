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

/** Every tap answers at once, and a failure is never silent (R-UX-10, v0.19.5). */
describe('feedback while loading and after failures', () => {
  it('shows "loading" at once while the remembered settings are still being read', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const engine = new AudioEngine({ loadBlob: async () => new Blob(['x']), createAudio: fakeAudio });
    let resolveSettings!: (s: { tempo: number }) => void;
    const settings = new Promise<{ tempo: number }>((resolve) => (resolveSettings = resolve));
    const done = engine.playTrack({ id: 'r1', title: 'A', path: '/a.mp3' }, undefined, settings);
    expect(engine.getState()).toMatchObject({ status: 'loading', track: { id: 'r1' } });
    resolveSettings({ tempo: 0.9 });
    await done;
    expect(engine.getState()).toMatchObject({ status: 'playing', tempo: 0.9 });
  });

  it('keeps showing "loading" while the silent unlock clip (iOS) plays and pauses', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    // like a browser: play/pause events arrive a moment later, after loading has started
    const audio = fakeAudio();
    audio.play = vi.fn(() => new Promise<void>((resolve) => setTimeout(() => (audio.dispatchEvent(new Event('play')), resolve()), 1)));
    audio.pause = vi.fn(() => void setTimeout(() => audio.dispatchEvent(new Event('pause')), 1));
    const engine = new AudioEngine({ loadBlob: async () => new Blob(['x']), createAudio: () => audio });
    engine.unlock(); // inside the tap, before loading starts
    const done = engine.playTrack({ id: 'r1', title: 'A', path: '/a.mp3' }, undefined, new Promise((r) => setTimeout(() => r(null), 20)));
    await new Promise((r) => setTimeout(r, 5)); // the clip's play/pause events have fired
    expect(engine.getState().status).toBe('loading');
    await done;
    await new Promise((r) => setTimeout(r, 5));
    expect(engine.getState().status).toBe('playing');
  });

  it('"Pause" while loading stops the start, and "Abspielen" loads the song again', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const loadBlob = vi.fn(() => new Promise<Blob>((resolve) => setTimeout(() => resolve(new Blob(['x'])), 10)));
    const engine = new AudioEngine({ loadBlob, createAudio: fakeAudio });
    const first = engine.playTrack({ id: 'r1', title: 'A', path: '/a.mp3' });
    engine.toggle(); // the button shows "Pause" while loading
    expect(engine.getState().status).toBe('paused');
    await first;
    expect(engine.getState().status).toBe('paused'); // the cancelled load doesn't start playing
    engine.toggle();
    expect(engine.getState().status).toBe('loading');
    await new Promise((r) => setTimeout(r, 30));
    expect(engine.getState().status).toBe('playing');
  });

  it('plays with default settings when reading them fails', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const engine = new AudioEngine({ loadBlob: async () => new Blob(['x']), createAudio: fakeAudio });
    await engine.playTrack({ id: 'r1', title: 'A', path: '/a.mp3' }, undefined, Promise.reject(new Error('offline')));
    expect(engine.getState()).toMatchObject({ status: 'playing', tempo: 1 });
  });

  it('says why a file does not play, and "Abspielen" loads it again', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const audio = fakeAudio();
    audio.play = vi.fn(async () => Promise.reject(Object.assign(new Error('unsupported'), { name: 'NotSupportedError' })));
    const loadBlob = vi.fn(async () => new Blob(['x']));
    const engine = new AudioEngine({ loadBlob, createAudio: () => audio });
    await engine.playTrack({ id: 'r1', title: 'A', path: '/a.wav' });
    expect(engine.getState()).toMatchObject({ status: 'paused', error: 'decode' }); // not a silent "paused"
    engine.toggle(); // "Abspielen" again: downloads the file again instead of reusing the broken copy
    expect(engine.getState().status).toBe('loading');
    await new Promise((r) => setTimeout(r, 0));
    expect(loadBlob).toHaveBeenCalledTimes(2);

    // with practice settings the effects fail first ("effects" notice) – the reason shown is still the file
    const withTempo = new AudioEngine({ loadBlob, createAudio: () => audio });
    await withTempo.playTrack({ id: 'r3', title: 'C', path: '/c.wav' }, undefined, { tempo: 0.8 });
    expect(withTempo.getState()).toMatchObject({ status: 'paused', error: 'decode' });

    const failing = new AudioEngine({ loadBlob: async () => Promise.reject(new Error('offline')), createAudio: fakeAudio });
    await failing.playTrack({ id: 'r2', title: 'B', path: '/b.mp3' });
    expect(failing.getState().error).toBe('load');
    failing.toggle(); // "Abspielen" after a failure: try again, visibly
    expect(failing.getState().status).toBe('loading');
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
