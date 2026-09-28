import type { Versioned } from '@/core/band/band';
import { scanAudioFiles, type ScannedFile, type ScanReport } from '@/core/files/scan';
import { ConflictError, type SafeStorage } from '@/core/storage';
import { buildSongs, type Song, type SongMeta, type Tag } from './model';
import { createTag, listSongMetas, listTags, saveTag, seedMeta, updateSongMeta } from './repository';

/**
 * Song library store (F4): scanned files + meta.json + tags → songs.
 * Cached data is shown immediately, fresh data loads in the background (R-UX-07).
 */

export interface LibraryState {
  status: 'idle' | 'scanning' | 'ready' | 'error';
  files: ScannedFile[];
  scannedAt: string | null;
  progress: { folders: number; found: number } | null;
  /** Result of the last scan in this session (not cached) */
  report: ScanReport | null;
  metas: Record<string, Versioned<SongMeta>>;
  tags: Versioned<Tag>[];
  songs: Song[];
}

interface LibraryOptions {
  storage: SafeStorage;
  home: string;
  appRoot: string;
  skip: string[];
  /** localStorage key prefix; null = no persistence (demo mode) */
  cacheKey: string | null;
  memberId: () => string;
}

export interface DetailsChange {
  displayTitle: string | null;
  key: string | null;
  bpm: number | null;
  tuning: string | null;
  tagIds: string[];
}

export class LibraryStore {
  private state: LibraryState;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;

  constructor(private options: LibraryOptions) {
    const cached = this.read<{ files: ScannedFile[]; scannedAt: string }>('scan');
    const metas = this.read<Record<string, Versioned<SongMeta>>>('metas') ?? {};
    const files = cached?.files ?? [];
    this.state = {
      status: cached ? 'ready' : 'idle',
      files,
      scannedAt: cached?.scannedAt ?? null,
      progress: null,
      report: null,
      metas,
      tags: this.read<Versioned<Tag>[]>('tags') ?? [],
      songs: this.build(files, metas),
    };
  }

  getState = (): LibraryState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get storage() {
    return this.options.storage;
  }

  get appRoot() {
    return this.options.appRoot;
  }

  song(songId: string): Song | undefined {
    return this.state.songs.find((s) => s.id === songId);
  }

  private build(files: ScannedFile[], metas: Record<string, Versioned<SongMeta>>) {
    return buildSongs(files, Object.fromEntries(Object.entries(metas).map(([id, m]) => [id, m.value])), this.options.home);
  }

  private set(patch: Partial<LibraryState>) {
    const next = { ...this.state, ...patch };
    if (patch.files || patch.metas) next.songs = this.build(next.files, next.metas);
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  /** Initial load: metadata + tags + fresh scan, in parallel. */
  async load(): Promise<void> {
    await Promise.all([this.reloadMeta(), this.scan()]);
  }

  async reloadMeta(): Promise<void> {
    try {
      const [metas, tags] = await Promise.all([
        listSongMetas(this.options.storage, this.options.appRoot),
        listTags(this.options.storage, this.options.appRoot),
      ]);
      this.write('metas', metas);
      this.write('tags', tags);
      this.set({ metas, tags });
    } catch (error) {
      console.error('Loading song data failed', error);
    }
  }

  async scan(): Promise<void> {
    if (this.state.status === 'scanning') return;
    this.abort = new AbortController();
    this.set({ status: 'scanning', progress: { folders: 0, found: 0 } });
    const report: ScanReport = { folders: 0, failedFolders: [] };
    try {
      const files = await scanAudioFiles(this.options.storage, {
        root: this.options.home,
        skip: this.options.skip,
        signal: this.abort.signal,
        onProgress: (progress) => this.set({ progress }),
        report,
      });
      const scannedAt = new Date().toISOString();
      this.write('scan', { files, scannedAt });
      this.set({ status: 'ready', files, scannedAt, progress: null, report });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Scan failed', error);
      this.set({ status: this.state.files.length > 0 ? 'ready' : 'error', progress: null });
    }
  }

  /* ---------------- song changes ---------------- */

  private async update(songId: string, mutate: (meta: SongMeta) => SongMeta, guard?: (latest: SongMeta) => void) {
    const memberId = this.options.memberId();
    const saved = await updateSongMeta(
      this.options.storage,
      this.options.appRoot,
      songId,
      () => seedMeta(songId, this.song(songId), memberId),
      mutate,
      memberId,
      guard,
    );
    const metas = { ...this.state.metas, [songId]: saved };
    this.write('metas', metas);
    this.set({ metas });
    return saved;
  }

  /** Makes sure a recording has an entry in the song's meta (for labels/durations). */
  private withRecording(meta: SongMeta, songId: string, recordingId: string): SongMeta {
    if (meta.recordings.some((r) => r.id === recordingId)) return meta;
    const rec = this.song(songId)?.recordings.find((r) => r.id === recordingId);
    if (!rec) return meta;
    meta.recordings.push({ id: rec.id, path: rec.path, size: rec.size, label: rec.label, firstSeenAt: rec.addedAt });
    return meta;
  }

  /** Stored once, so every device shows the length (F4 §6.6). */
  async recordDuration(songId: string, recordingId: string, seconds: number) {
    const rounded = Math.round(seconds);
    const current = this.song(songId)?.recordings.find((r) => r.id === recordingId);
    if (!current || current.durationSec === rounded || !Number.isFinite(rounded)) return;
    await this.update(songId, (meta) => {
      const m = this.withRecording(meta, songId, recordingId);
      m.recordings = m.recordings.map((r) => (r.id === recordingId ? { ...r, durationSec: rounded } : r));
      return m;
    }).catch((error) => console.warn('Saving duration failed', error));
  }

  /** Edit form (F4 §4.4). Fails with ConflictError if someone changed the same fields meanwhile. */
  async updateDetails(songId: string, change: DetailsChange, original: DetailsChange) {
    const fields: (keyof DetailsChange)[] = ['displayTitle', 'key', 'bpm', 'tuning'];
    // Only fields the user actually changed are written; others keep their latest value.
    const changed: Partial<DetailsChange> = {};
    for (const field of fields) if (change[field] !== original[field]) Object.assign(changed, { [field]: change[field] });
    if (change.tagIds.join() !== original.tagIds.join()) changed.tagIds = change.tagIds;
    await this.update(
      songId,
      (meta) => ({ ...meta, ...changed }),
      (latest) => {
        const changedByOthers = fields.some(
          (field) => change[field] !== original[field] && (latest[field] ?? null) !== (original[field] ?? null),
        );
        if (changedByOthers) throw new ConflictError(songId, undefined);
      },
    );
  }

  setTags(songId: string, tagIds: string[]) {
    return this.update(songId, (meta) => ({ ...meta, tagIds }));
  }

  setArchived(songId: string, archived: boolean) {
    const now = new Date().toISOString();
    const by = this.options.memberId();
    return this.update(songId, (meta) => ({
      ...meta,
      archived,
      archivedAt: archived ? now : null,
      archivedBy: archived ? by : null,
    }));
  }

  setHidden(songId: string, hidden: boolean) {
    return this.update(songId, (meta) => ({ ...meta, hidden }));
  }

  setBandVersion(songId: string, recordingId: string) {
    const setBy = this.options.memberId();
    return this.update(songId, (meta) => ({
      ...this.withRecording(meta, songId, recordingId),
      bandVersion: { recordingId, setBy, setAt: new Date().toISOString() },
    }));
  }

  setRecordingLabel(songId: string, recordingId: string, label: string | null) {
    return this.update(songId, (meta) => {
      const m = this.withRecording(meta, songId, recordingId);
      m.recordings = m.recordings.map((r) => (r.id === recordingId ? { ...r, label: label?.trim() || null } : r));
      return m;
    });
  }

  /** Group `sourceId` as version(s) of `targetId` (F4 §6.8). Only links data, never moves files. */
  async mergeInto(sourceId: string, targetId: string) {
    const source = this.song(sourceId);
    const target = this.song(targetId);
    if (!source || !target || sourceId === targetId) return;
    await this.update(sourceId, (meta) => ({ ...meta, mergedInto: targetId }));
    await this.update(targetId, (meta) => {
      const m = { ...meta, mergedSongIds: [...new Set([...meta.mergedSongIds, sourceId, ...source.mergedSongIds])] };
      for (const rec of source.recordings) {
        if (!m.recordings.some((r) => r.id === rec.id)) {
          m.recordings.push({ id: rec.id, path: rec.path, size: rec.size, label: rec.label, durationSec: rec.durationSec, firstSeenAt: rec.addedAt });
        }
      }
      return m;
    });
  }

  /** "Als eigenen Song abtrennen": the recording's original song becomes independent again. */
  async split(songId: string, recordingId: string) {
    const song = this.song(songId);
    const rec = song?.recordings.find((r) => r.id === recordingId);
    if (!song || !rec || rec.originSongId === songId) return;
    const originId = rec.originSongId;
    const moving = song.recordings.filter((r) => r.originSongId === originId).map((r) => r.id);
    await this.update(originId, (meta) => ({ ...meta, mergedInto: null }));
    await this.update(songId, (meta) => ({
      ...meta,
      mergedSongIds: meta.mergedSongIds.filter((id) => id !== originId),
      recordings: meta.recordings.filter((r) => !moving.includes(r.id)),
      bandVersion: meta.bandVersion && moving.includes(meta.bandVersion.recordingId) ? null : meta.bandVersion,
    }));
  }

  /* ---------------- tags ---------------- */

  async createTag(name: string): Promise<Tag> {
    const created = await createTag(
      this.options.storage,
      this.options.appRoot,
      name,
      this.state.tags.map((t) => t.value),
      this.options.memberId(),
    );
    const tags = [...this.state.tags, created].sort((a, b) => a.value.name.localeCompare(b.value.name, 'de'));
    this.write('tags', tags);
    this.set({ tags });
    return created.value;
  }

  async renameTag(tagId: string, name: string) {
    const current = this.state.tags.find((t) => t.value.id === tagId);
    if (!current) return;
    const saved = await saveTag(this.options.storage, this.options.appRoot, current, this.options.memberId(), {
      rename: name,
      existing: this.state.tags.map((t) => t.value),
    });
    const tags = this.state.tags.map((t) => (t.value.id === tagId ? saved : t)).sort((a, b) => a.value.name.localeCompare(b.value.name, 'de'));
    this.write('tags', tags);
    this.set({ tags });
  }

  /** Soft delete; songs simply stop showing the tag (F4 §6.11). */
  async deleteTag(tagId: string) {
    const current = this.state.tags.find((t) => t.value.id === tagId);
    if (!current) return;
    await saveTag(this.options.storage, this.options.appRoot, current, this.options.memberId(), 'delete');
    const tags = this.state.tags.filter((t) => t.value.id !== tagId);
    this.write('tags', tags);
    this.set({ tags });
  }

  dispose() {
    this.abort?.abort();
    this.listeners.clear();
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
      // storage full or unavailable – the next start just loads again
    }
  }
}
