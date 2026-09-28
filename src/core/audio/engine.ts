import { extensionOf } from '@/core/files/scan';

/**
 * Audio engine v0 (F9): one global player for the whole app (R-UX-08).
 *
 * M2 plays through a plain <audio> element with a blob URL: best background/lock-screen
 * behaviour on iPhones (spike S3). Pitch/tempo (Web Audio) come in M4 and are only switched
 * on while effects are active (F9 §7 fallback plan).
 */

export interface Track {
  id: string;
  title: string;
  subtitle?: string;
  path: string;
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  track: Track | null;
  status: PlaybackStatus;
  position: number;
  duration: number;
  error: 'load' | 'decode' | 'blocked' | null;
}

interface EngineOptions {
  loadBlob: (path: string) => Promise<Blob>;
  onDuration?: (trackId: string, seconds: number) => void;
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
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
const CACHE_SIZE = 3;

export class AudioEngine {
  private audio: HTMLAudioElement;
  private state: PlayerState = { track: null, status: 'idle', position: 0, duration: 0, error: null };
  private listeners = new Set<() => void>();
  private urls = new Map<string, string>(); // path → object URL (small LRU)
  private loadToken = 0;
  private unlocked = false;

  constructor(private options: EngineOptions) {
    this.audio = options.createAudio?.() ?? new Audio();
    this.audio.preload = 'auto';
    const a = this.audio;
    a.addEventListener('timeupdate', () => this.set({ position: a.currentTime }));
    a.addEventListener('durationchange', () => this.onDuration());
    a.addEventListener('loadedmetadata', () => this.onDuration());
    a.addEventListener('play', () => this.set({ status: 'playing' }));
    a.addEventListener('playing', () => this.set({ status: 'playing' }));
    a.addEventListener('pause', () => this.state.status !== 'loading' && this.set({ status: 'paused' }));
    a.addEventListener('ended', () => this.set({ status: 'paused', position: a.duration || 0 }));
    a.addEventListener('error', () => this.state.track && this.set({ status: 'error', error: 'decode' }));
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

  /** Load a track and start playing. Toggling the current track pauses/resumes instead. */
  async playTrack(track: Track): Promise<void> {
    if (this.state.track?.id === track.id && this.state.status !== 'error') {
      this.toggle();
      return;
    }
    const token = ++this.loadToken;
    this.audio.pause();
    this.set({ track, status: 'loading', position: 0, duration: 0, error: null });
    this.updateMediaMetadata(track);
    let url: string;
    try {
      url = await this.urlFor(track.path);
    } catch (error) {
      console.error('Loading audio failed', error);
      if (token === this.loadToken) this.set({ status: 'error', error: 'load' });
      return;
    }
    if (token !== this.loadToken) return; // another song was chosen meanwhile
    this.audio.src = url;
    await this.startPlayback();
  }

  play() {
    if (this.state.track) void this.startPlayback();
  }

  pause() {
    this.audio.pause();
  }

  toggle() {
    if (this.state.status === 'playing') this.pause();
    else this.play();
  }

  seek(seconds: number) {
    if (!this.state.track) return;
    const max = this.audio.duration || this.state.duration || 0;
    const target = Math.max(0, Math.min(max || seconds, seconds));
    try {
      this.audio.currentTime = target;
    } catch {
      // not seekable yet
    }
    this.set({ position: target });
  }

  skip(delta: number) {
    this.seek((this.audio.currentTime || this.state.position) + delta);
  }

  stop() {
    this.loadToken++;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.set({ track: null, status: 'idle', position: 0, duration: 0, error: null });
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }

  dispose() {
    this.stop();
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
    this.listeners.clear();
  }

  private async startPlayback() {
    try {
      await this.audio.play();
    } catch (error) {
      if ((error as Error).name === 'NotAllowedError') this.set({ status: 'paused', error: 'blocked' });
      else if ((error as Error).name !== 'AbortError') this.set({ status: 'paused' });
    }
  }

  private async urlFor(path: string): Promise<string> {
    const cached = this.urls.get(path);
    if (cached) {
      this.urls.delete(path);
      this.urls.set(path, cached); // mark as recently used
      return cached;
    }
    const raw = await this.options.loadBlob(path);
    // HiDrive may deliver application/octet-stream; Safari needs the real audio type.
    const type = MIME[extensionOf(path)] ?? raw.type;
    const blob = raw.type === type ? raw : new Blob([raw], { type });
    const url = URL.createObjectURL(blob);
    this.urls.set(path, url);
    while (this.urls.size > CACHE_SIZE) {
      const [oldPath, oldUrl] = this.urls.entries().next().value as [string, string];
      if (oldPath === this.state.track?.path) break;
      URL.revokeObjectURL(oldUrl);
      this.urls.delete(oldPath);
    }
    return url;
  }

  private onDuration() {
    const d = this.audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    this.set({ duration: d });
    if (this.state.track) this.options.onDuration?.(this.state.track.id, d);
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
    const { duration, position, status } = this.state;
    navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
    if (duration > 0 && typeof navigator.mediaSession.setPositionState === 'function') {
      try {
        navigator.mediaSession.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 });
      } catch {
        // ignore invalid states during loading
      }
    }
  }
}
