import { scanAudioFiles, type ScannedFile } from '@/core/files/scan';
import type { SafeStorage } from '@/core/storage';

/**
 * Song library store: cached scan result shown immediately, fresh scan in the background
 * (F1 §4, R-UX-07). One instance per band session.
 */

export interface LibraryState {
  status: 'idle' | 'scanning' | 'ready' | 'error';
  files: ScannedFile[];
  scannedAt: string | null;
  progress: { folders: number; found: number } | null;
  durations: Record<string, number>;
}

interface LibraryOptions {
  storage: SafeStorage;
  home: string;
  skip: string[];
  /** localStorage key prefix; null = no persistence (demo mode) */
  cacheKey: string | null;
}

export class LibraryStore {
  private state: LibraryState;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;

  constructor(private options: LibraryOptions) {
    const cached = this.readCache();
    this.state = {
      status: cached ? 'ready' : 'idle',
      files: cached?.files ?? [],
      scannedAt: cached?.scannedAt ?? null,
      progress: null,
      durations: this.readDurations(),
    };
  }

  getState = (): LibraryState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<LibraryState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async scan(): Promise<void> {
    if (this.state.status === 'scanning') return;
    this.abort = new AbortController();
    this.set({ status: 'scanning', progress: { folders: 0, found: 0 } });
    try {
      const files = await scanAudioFiles(this.options.storage, {
        root: this.options.home,
        skip: this.options.skip,
        signal: this.abort.signal,
        onProgress: (progress) => this.set({ progress }),
      });
      const scannedAt = new Date().toISOString();
      this.writeCache({ files, scannedAt });
      this.set({ status: 'ready', files, scannedAt, progress: null });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Scan failed', error);
      // Keep showing the cached list if there is one.
      this.set({ status: this.state.files.length > 0 ? 'ready' : 'error', progress: null });
    }
  }

  /** Durations are measured on first play (F4 §6.6). Device-local until meta.json exists (M3). */
  setDuration(songId: string, seconds: number) {
    if (!Number.isFinite(seconds) || this.state.durations[songId] === Math.round(seconds)) return;
    const durations = { ...this.state.durations, [songId]: Math.round(seconds) };
    this.set({ durations });
    this.write('durations', durations);
  }

  dispose() {
    this.abort?.abort();
    this.listeners.clear();
  }

  private readCache(): { files: ScannedFile[]; scannedAt: string } | null {
    return this.read<{ files: ScannedFile[]; scannedAt: string }>('scan');
  }

  private writeCache(value: { files: ScannedFile[]; scannedAt: string }) {
    this.write('scan', value);
  }

  private readDurations(): Record<string, number> {
    return this.read<Record<string, number>>('durations') ?? {};
  }

  private read<T>(suffix: string): T | null {
    if (!this.options.cacheKey) return null;
    try {
      const raw = localStorage.getItem(`${this.options.cacheKey}.${suffix}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(suffix: string, value: unknown) {
    if (!this.options.cacheKey) return;
    try {
      localStorage.setItem(`${this.options.cacheKey}.${suffix}`, JSON.stringify(value));
    } catch {
      // storage full or unavailable – the next start just scans again
    }
  }
}
