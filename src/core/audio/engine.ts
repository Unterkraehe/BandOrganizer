import { extensionOf } from '@/core/files/scan';
import { createStretch, type StretchNode } from './stretch';

/**
 * Audio engine (F9): one global player for the whole app (R-UX-08).
 *
 * Two modes:
 * - "element": a plain <audio> element with a blob URL – default, best background/lock-screen
 *   behaviour on iPhones (spike S3 passed). A–B loops work here too.
 * - "effects": Web Audio + Signalsmith Stretch (WASM/AudioWorklet), only while tempo ≠ 100 %
 *   or pitch ≠ 0 (F9 §7 fallback plan). Tempo and pitch are independent of each other.
 * The engine switches seamlessly at the current position.
 */

export interface Track {
  /** recording id */
  id: string;
  /** song the recording belongs to (for links) */
  songId?: string;
  title: string;
  subtitle?: string;
  path: string;
}

export interface Loop {
  start: number;
  end: number;
  enabled: boolean;
}

export interface PracticeSettings {
  tempo: number;
  semitones: number;
  loop: Loop | null;
}

export const DEFAULT_SETTINGS: PracticeSettings = { tempo: 1, semitones: 0, loop: null };
export const TEMPO_MIN = 0.5;
export const TEMPO_MAX = 1.5;
export const SEMITONES_MAX = 12;

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  track: Track | null;
  status: PlaybackStatus;
  position: number;
  duration: number;
  error: 'load' | 'decode' | 'blocked' | 'effects' | null;
  tempo: number;
  semitones: number;
  loop: Loop | null;
  mode: 'element' | 'effects';
  /** increases every time a track plays to its end (setlist queue, F3 §5) */
  ended: number;
}

interface EngineOptions {
  loadBlob: (path: string) => Promise<Blob>;
  onDuration?: (track: Track, seconds: number) => void;
  /** Called whenever tempo/pitch/loop change for the current track (for remembering them) */
  onSettingsChange?: (track: Track, settings: PracticeSettings) => void;
  /** Artist line on the lock screen (band name) */
  artist?: string;
  createAudio?: () => HTMLAudioElement;
}

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

// Shortest valid silent WAV – played once inside a tap to unlock audio on iOS.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
const CACHE_SIZE = 3;
const MIN_LOOP = 1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function normalizeSettings(settings: Partial<PracticeSettings> | null | undefined): PracticeSettings {
  const tempo = clamp(Math.round((settings?.tempo ?? 1) * 100) / 100, TEMPO_MIN, TEMPO_MAX);
  const semitones = clamp(Math.round(settings?.semitones ?? 0), -SEMITONES_MAX, SEMITONES_MAX);
  const loop = settings?.loop && settings.loop.end - settings.loop.start >= MIN_LOOP ? { ...settings.loop } : null;
  return { tempo, semitones, loop };
}

export class AudioEngine {
  private audio: HTMLAudioElement;
  private state: PlayerState = {
    track: null,
    status: 'idle',
    position: 0,
    duration: 0,
    error: null,
    tempo: 1,
    semitones: 0,
    loop: null,
    mode: 'element',
    ended: 0,
  };
  private listeners = new Set<() => void>();
  private cache = new Map<string, { url: string; blob: Blob }>(); // path → blob (small LRU)
  private loadToken = 0;
  /** track whose audio is ready to play (element src set or effects decoded) */
  private loadedId: string | null = null;
  private unlocked = false;
  private pendingSeek: number | null = null;
  private loopFrame: number | null = null;

  // effects mode
  private ctx: AudioContext | null = null;
  private stretch: StretchNode | null = null;
  private decoded: { trackId: string; duration: number } | null = null;
  private fxPlaying = false;

  constructor(private options: EngineOptions) {
    this.audio = options.createAudio?.() ?? new Audio();
    this.audio.preload = 'auto';
    const a = this.audio;
    a.addEventListener('timeupdate', () => this.state.mode === 'element' && this.onElementTime());
    a.addEventListener('durationchange', () => this.onElementDuration());
    a.addEventListener('loadedmetadata', () => this.onElementDuration());
    // the silent unlock clip (iOS) plays and pauses inside the tap – its events must not overwrite "loading"
    const song = () => this.state.mode === 'element' && a.src !== SILENCE;
    a.addEventListener('play', () => song() && this.set({ status: 'playing', error: this.keptError() }));
    a.addEventListener('playing', () => song() && this.set({ status: 'playing', error: this.keptError() }));
    a.addEventListener('pause', () => song() && this.state.status !== 'loading' && this.set({ status: 'paused' }));
    a.addEventListener('ended', () => this.state.mode === 'element' && this.set({ status: 'paused', position: a.duration || 0, ended: this.state.ended + 1 }));
    a.addEventListener('error', () => this.state.track && this.state.mode === 'element' && this.set({ status: 'error', error: 'decode' }));
    this.setupMediaSession();
  }

  getState = (): PlayerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Call synchronously inside a tap/click before any await: iOS only allows playback that
   * starts from a user gesture, and the song download is asynchronous.
   */
  unlock() {
    // AudioContext must be created/resumed inside a user gesture on iOS (effects mode)
    if (this.state.tempo !== 1 || this.state.semitones !== 0 || this.ctx) this.ensureContext();
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.state.track) return;
    try {
      this.audio.src = SILENCE;
      const promise = this.audio.play();
      void promise?.then(() => this.audio.pause()).catch(() => undefined);
    } catch {
      // not supported (tests)
    }
  }

  /**
   * Load a track and start playing. Toggling the current track pauses/resumes instead; a track that
   * failed to load is loaded again. `settings` may still be on its way (read from HiDrive): the
   * player shows "loading" at once and applies them before the audio starts (R-UX-10).
   */
  async playTrack(track: Track, startAt?: number, settings?: Partial<PracticeSettings> | null | Promise<Partial<PracticeSettings> | null>): Promise<void> {
    if (this.state.track?.id === track.id && this.loadedId === track.id && !this.failed()) {
      if (startAt !== undefined) {
        this.seek(startAt);
        this.play();
      } else this.toggle();
      return;
    }
    // trying a failed song again downloads it again – a real retry, and "Wird geladen …" is visible
    if (this.state.track?.id === track.id && this.failed()) this.forget(track.path);
    const token = ++this.loadToken;
    const pending = settings instanceof Promise;
    this.pauseAll();
    this.decoded = null;
    this.loadedId = null;
    this.set({ track, status: 'loading', position: startAt ?? 0, duration: 0, error: null, ...normalizeSettings(pending ? null : settings) });
    this.updateMediaMetadata(track);
    try {
      const [{ url }, resolved] = await Promise.all([this.fileFor(track.path), pending ? settings.catch(() => null) : null]);
      if (token !== this.loadToken) return; // another song was chosen meanwhile
      if (pending) this.set(normalizeSettings(resolved));
      if (this.needsEffects()) {
        const ok = await this.loadEffects(token);
        if (token !== this.loadToken) return;
        if (ok) {
          this.loadedId = track.id;
          this.fxStart(startAt ?? 0);
          return;
        }
      }
      this.set({ mode: 'element' });
      this.pendingSeek = startAt ?? null;
      this.audio.src = url;
      this.loadedId = track.id;
      this.applyElementRate();
      await this.startElement();
    } catch (error) {
      console.error('Loading audio failed', error);
      if (token === this.loadToken) this.set({ status: 'error', error: 'load' });
    }
  }

  play() {
    if (!this.state.track) return;
    if (this.state.mode === 'effects') this.fxStart(this.state.position);
    else void this.startElement();
  }

  pause() {
    if (this.state.mode === 'effects') {
      this.fxStop();
      this.set({ status: 'paused' });
    } else this.audio.pause();
  }

  toggle() {
    const track = this.state.track;
    if (this.state.status === 'playing') this.pause();
    else if (this.state.status === 'loading') this.cancelLoading();
    else if (track && (this.failed() || this.loadedId !== track.id)) void this.playTrack(track, this.state.position || undefined, this.currentSettings());
    else this.play();
  }

  /** "Pause" while a song is still loading: it doesn't start; "Abspielen" loads it again (R-UX-10). */
  private cancelLoading() {
    this.loadToken++;
    this.pauseAll();
    this.decoded = null;
    this.loadedId = null;
    this.set({ status: 'paused', mode: 'element' });
  }

  /** The current track could not be loaded or played – "Abspielen" loads it again. */
  private failed() {
    return this.state.status === 'error' || this.state.error === 'load' || this.state.error === 'decode';
  }

  /** Errors that playing clears; the practice-effects notice stays. */
  private keptError(): PlayerState['error'] {
    return this.state.error === 'effects' ? 'effects' : null;
  }

  seek(seconds: number) {
    if (!this.state.track) return;
    const max = this.state.duration || this.audio.duration || seconds;
    const target = clamp(seconds, 0, max || seconds);
    if (this.state.mode === 'effects') {
      if (this.fxPlaying) this.stretch?.schedule({ input: target });
    } else {
      try {
        this.audio.currentTime = target;
      } catch {
        // not seekable yet
      }
    }
    this.set({ position: target });
  }

  skip(delta: number) {
    this.seek(this.state.position + delta);
  }

  /** Tempo (0.5–1.5) and pitch (±12 semitones), independent of each other (F9). */
  setEffects(effects: { tempo?: number; semitones?: number }) {
    this.ensureContext(); // inside the tap (iOS)
    const next = normalizeSettings({ ...this.currentSettings(), ...effects });
    const wasFx = this.state.mode === 'effects';
    this.set({ tempo: next.tempo, semitones: next.semitones });
    this.notifySettings();
    if (!this.state.track || this.state.status === 'loading') return;
    const needFx = this.needsEffects();
    if (needFx && !wasFx) void this.switchToEffects();
    else if (!needFx && wasFx) void this.switchToElement();
    else if (wasFx) this.stretch?.schedule({ rate: next.tempo, semitones: next.semitones });
  }

  /** A–B loop (F4 §6.9). null removes it. */
  setLoop(loop: Loop | null) {
    const next = normalizeSettings({ ...this.currentSettings(), loop }).loop;
    this.set({ loop: next });
    this.notifySettings();
    if (this.state.mode === 'effects') this.scheduleFxLoop();
    else this.updateElementLoopWatch();
    // jump into the loop if we're outside of it
    if (next?.enabled && (this.state.position < next.start || this.state.position > next.end)) this.seek(next.start);
  }

  /** Apply remembered settings without reloading (e.g. after they were loaded). */
  applySettings(settings: Partial<PracticeSettings> | null) {
    const next = normalizeSettings(settings);
    this.setEffects({ tempo: next.tempo, semitones: next.semitones });
    this.setLoop(next.loop);
  }

  stop() {
    this.loadToken++;
    this.loadedId = null;
    this.pauseAll();
    this.audio.removeAttribute('src');
    this.decoded = null;
    this.stretch?.dropBuffers?.();
    this.set({ track: null, status: 'idle', position: 0, duration: 0, error: null, mode: 'element' });
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }

  dispose() {
    this.stop();
    this.cache.forEach(({ url }) => URL.revokeObjectURL(url));
    this.cache.clear();
    this.stretch?.disconnect();
    void this.ctx?.close().catch(() => undefined);
    this.listeners.clear();
  }

  /* ---------------- element mode ---------------- */

  private async startElement() {
    try {
      await this.audio.play();
    } catch (error) {
      const name = (error as Error).name;
      // never a silent failure (R-UX-10): the player shows why it doesn't play
      if (name === 'NotAllowedError') this.set({ status: 'paused', error: 'blocked' });
      else if (name !== 'AbortError') this.set({ status: 'paused', error: this.state.error ?? 'decode' });
    }
    this.updateElementLoopWatch();
  }

  private applyElementRate() {
    this.audio.playbackRate = 1;
  }

  private onElementTime() {
    const position = this.audio.currentTime;
    const loop = this.state.loop;
    if (loop?.enabled && position >= loop.end) {
      this.audio.currentTime = loop.start;
      this.set({ position: loop.start });
      return;
    }
    this.set({ position });
  }

  /** timeupdate fires only ~4×/s – check loop ends every frame while a loop is active. */
  private updateElementLoopWatch() {
    if (this.loopFrame !== null) cancelAnimationFrame(this.loopFrame);
    this.loopFrame = null;
    if (typeof requestAnimationFrame === 'undefined' || this.state.mode !== 'element' || !this.state.loop?.enabled) return;
    const tick = () => {
      if (this.state.mode !== 'element' || !this.state.loop?.enabled) return;
      if (!this.audio.paused) this.onElementTime();
      this.loopFrame = requestAnimationFrame(tick);
    };
    this.loopFrame = requestAnimationFrame(tick);
  }

  private onElementDuration() {
    const d = this.audio.duration;
    if (!Number.isFinite(d) || d <= 0 || this.state.mode !== 'element') return;
    if (this.pendingSeek !== null) {
      const target = Math.min(this.pendingSeek, d);
      this.pendingSeek = null;
      try {
        this.audio.currentTime = target;
      } catch {
        // ignore
      }
      this.state = { ...this.state, position: target };
    }
    this.set({ duration: d });
    if (this.state.track) this.options.onDuration?.(this.state.track, d);
  }

  /* ---------------- effects mode ---------------- */

  private needsEffects() {
    return this.state.tempo !== 1 || this.state.semitones !== 0;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    }
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** Decode the current track into the stretch node. false = effects not available. */
  private async loadEffects(token: number): Promise<boolean> {
    const track = this.state.track;
    const ctx = this.ensureContext();
    if (!track || !ctx) {
      this.set({ error: 'effects' });
      return false;
    }
    if (this.decoded?.trackId === track.id && this.stretch) return true;
    try {
      this.stretch ??= await createStretch(ctx);
      const { blob } = await this.fileFor(track.path);
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      if (token !== this.loadToken) return false;
      await this.stretch.dropBuffers();
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      await this.stretch.addBuffers(channels);
      this.decoded = { trackId: track.id, duration: buffer.duration };
      this.set({ duration: buffer.duration, mode: 'effects' });
      this.options.onDuration?.(track, buffer.duration);
      this.stretch.setUpdateInterval(0.1, (inputTime: number) => this.onFxTime(inputTime));
      return true;
    } catch (error) {
      console.error('Effects not available', error);
      this.set({ error: 'effects' });
      return false;
    }
  }

  private fxStart(position: number) {
    if (!this.stretch || !this.ctx) return;
    void this.ctx.resume().catch(() => undefined);
    const loop = this.state.loop;
    this.stretch.schedule({
      active: true,
      input: position >= this.state.duration - 0.05 && !loop?.enabled ? 0 : position,
      rate: this.state.tempo,
      semitones: this.state.semitones,
      loopStart: loop?.enabled ? loop.start : 0,
      loopEnd: loop?.enabled ? loop.end : 0,
    });
    this.fxPlaying = true;
    this.set({ status: 'playing', mode: 'effects' });
  }

  private fxStop() {
    if (this.fxPlaying) this.stretch?.schedule({ active: false });
    this.fxPlaying = false;
  }

  private scheduleFxLoop() {
    const loop = this.state.loop;
    this.stretch?.schedule({ loopStart: loop?.enabled ? loop.start : 0, loopEnd: loop?.enabled ? loop.end : 0 });
  }

  private onFxTime(inputTime: number) {
    if (this.state.mode !== 'effects' || !this.fxPlaying) return;
    const duration = this.state.duration;
    if (!this.state.loop?.enabled && duration > 0 && inputTime >= duration - 0.02) {
      this.fxStop();
      this.set({ status: 'paused', position: duration, ended: this.state.ended + 1 });
      return;
    }
    this.set({ position: inputTime });
  }

  private async switchToEffects() {
    const position = this.state.position;
    const wasPlaying = this.state.status === 'playing';
    const token = this.loadToken;
    this.audio.pause();
    this.set({ status: wasPlaying ? 'loading' : this.state.status });
    const ok = await this.loadEffects(token);
    if (token !== this.loadToken) return;
    if (!ok) {
      // no Web Audio: tempo via the element (pitch not possible), see error "effects"
      this.set({ mode: 'element', status: wasPlaying ? 'playing' : 'paused' });
      if (wasPlaying) void this.startElement();
      return;
    }
    if (wasPlaying) this.fxStart(position);
    else this.set({ status: 'paused', position });
  }

  private async switchToElement() {
    const position = this.state.position;
    const wasPlaying = this.state.status === 'playing';
    this.fxStop();
    this.set({ mode: 'element' });
    const track = this.state.track;
    if (!track) return;
    const { url } = await this.fileFor(track.path);
    if (this.audio.src !== url) this.audio.src = url;
    this.pendingSeek = position;
    try {
      this.audio.currentTime = position;
    } catch {
      // applied on loadedmetadata
    }
    this.set({ position, status: wasPlaying ? 'playing' : 'paused' });
    if (wasPlaying) await this.startElement();
  }

  private pauseAll() {
    this.audio.pause();
    this.fxStop();
    if (this.loopFrame !== null) cancelAnimationFrame(this.loopFrame);
    this.loopFrame = null;
  }

  /* ---------------- shared ---------------- */

  private currentSettings(): PracticeSettings {
    return { tempo: this.state.tempo, semitones: this.state.semitones, loop: this.state.loop };
  }

  private notifySettings() {
    if (this.state.track) this.options.onSettingsChange?.(this.state.track, this.currentSettings());
  }

  private forget(path: string) {
    const cached = this.cache.get(path);
    if (!cached) return;
    URL.revokeObjectURL(cached.url);
    this.cache.delete(path);
  }

  private async fileFor(path: string): Promise<{ url: string; blob: Blob }> {
    const cached = this.cache.get(path);
    if (cached) {
      this.cache.delete(path);
      this.cache.set(path, cached); // mark as recently used
      return cached;
    }
    const raw = await this.options.loadBlob(path);
    // HiDrive may deliver application/octet-stream; Safari needs the real audio type.
    const type = MIME[extensionOf(path)] ?? raw.type;
    const blob = raw.type === type ? raw : new Blob([raw], { type });
    const entry = { url: URL.createObjectURL(blob), blob };
    this.cache.set(path, entry);
    while (this.cache.size > CACHE_SIZE) {
      const [oldPath, old] = this.cache.entries().next().value as [string, { url: string }];
      if (oldPath === this.state.track?.path) break;
      URL.revokeObjectURL(old.url);
      this.cache.delete(oldPath);
    }
    return entry;
  }

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
    this.updatePositionState();
  }

  private setupMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const handle = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // action not supported on this platform
      }
    };
    handle('play', () => this.play());
    handle('pause', () => this.pause());
    handle('seekbackward', (details) => this.skip(-(details.seekOffset ?? 10)));
    handle('seekforward', (details) => this.skip(details.seekOffset ?? 10));
    handle('seekto', (details) => details.seekTime !== undefined && this.seek(details.seekTime));
  }

  private updateMediaMetadata(track: Track) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const icon = new URL('icons/icon-512.png', window.location.origin + import.meta.env.BASE_URL).toString();
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: this.options.artist ?? '',
      album: track.subtitle ?? '',
      artwork: [{ src: icon, sizes: '512x512', type: 'image/png' }],
    });
  }

  private updatePositionState() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const { duration, position, status, tempo } = this.state;
    navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
    if (duration > 0 && typeof navigator.mediaSession.setPositionState === 'function') {
      try {
        navigator.mediaSession.setPositionState({ duration, position: Math.min(position, duration), playbackRate: tempo });
      } catch {
        // ignore invalid states during loading
      }
    }
  }
}
