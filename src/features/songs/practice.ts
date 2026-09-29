import { DEFAULT_SETTINGS, normalizeSettings, type PracticeSettings } from '@/core/audio/engine';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';

/**
 * Practice settings per member, song and version (F4 §7.4): tempo, pitch, A–B loop.
 * `_BandApp/songs/<songId>/practice/<memberId>.json` – only this member writes it, so the last
 * write wins (only concurrent edits on the member's own devices could collide).
 */

export interface PracticeFile {
  schemaVersion: 1;
  byRecording: Record<string, PracticeSettings>;
  updatedAt: string;
}

const SAVE_DELAY = 800;

export class PracticeStore {
  private files = new Map<string, PracticeFile>();
  private loading = new Map<string, Promise<PracticeFile>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly storage: SafeStorage,
    private readonly appRoot: string,
    private readonly memberId: () => string,
  ) {}

  private path(songId: string) {
    return joinPath(this.appRoot, 'songs', songId, 'practice', `${this.memberId()}.json`);
  }

  load(songId: string): Promise<PracticeFile> {
    const cached = this.files.get(songId);
    if (cached) return Promise.resolve(cached);
    let pending = this.loading.get(songId);
    if (!pending) {
      pending = this.storage
        .readJson<PracticeFile>(this.path(songId))
        .catch((error) => {
          if (!(error instanceof NotFoundError)) console.warn('Practice settings unreadable', error);
          return { schemaVersion: 1, byRecording: {}, updatedAt: '' } as PracticeFile;
        })
        .then((file) => {
          this.files.set(songId, file);
          this.loading.delete(songId);
          return file;
        });
      this.loading.set(songId, pending);
    }
    return pending;
  }

  /** Settings for a version, or null if nothing is stored (never throws). */
  async settingsFor(songId: string, recordingId: string, timeoutMs = 1500): Promise<PracticeSettings | null> {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const file = await Promise.race([this.load(songId), timeout]);
    const stored = file?.byRecording[recordingId];
    return stored ? normalizeSettings(stored) : null;
  }

  cachedSettings(songId: string, recordingId: string): PracticeSettings | null {
    const stored = this.files.get(songId)?.byRecording[recordingId];
    return stored ? normalizeSettings(stored) : null;
  }

  /** Remember settings (debounced write). Default settings remove the entry. */
  save(songId: string, recordingId: string, settings: PracticeSettings) {
    const file = this.files.get(songId) ?? { schemaVersion: 1, byRecording: {}, updatedAt: '' };
    const normalized = normalizeSettings(settings);
    const isDefault = normalized.tempo === DEFAULT_SETTINGS.tempo && normalized.semitones === 0 && !normalized.loop;
    const byRecording = { ...file.byRecording };
    if (isDefault) delete byRecording[recordingId];
    else byRecording[recordingId] = normalized;
    const next: PracticeFile = { schemaVersion: 1, byRecording, updatedAt: new Date().toISOString() };
    this.files.set(songId, next);
    clearTimeout(this.timers.get(songId));
    this.timers.set(
      songId,
      setTimeout(() => {
        this.timers.delete(songId);
        void this.storage.writeJson(this.path(songId), next).catch((error) => console.warn('Saving practice settings failed', error));
      }, SAVE_DELAY),
    );
  }

  async flush() {
    const pending = [...this.timers.keys()];
    for (const songId of pending) {
      clearTimeout(this.timers.get(songId));
      this.timers.delete(songId);
      const file = this.files.get(songId);
      if (file) await this.storage.writeJson(this.path(songId), file);
    }
  }
}
