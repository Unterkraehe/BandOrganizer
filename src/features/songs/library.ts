import type { Versioned } from '@/core/band/band';
import { newId } from '@/core/data/ids';
import { emitSystemEvent } from '@/core/events';
import { scanFiles, type ScannedFile, type ScanReport } from '@/core/files/scan';
import { ConflictError, type FileEntry, type SafeStorage } from '@/core/storage';
import { buildSongs, recordingIdFor, type Song, type SongMeta, type Tag } from './model';
import { PracticeStore } from './practice';
import { createTag, listSongMetas, listTags, saveTag, seedMeta, updateSongMeta } from './repository';

/**
 * Song library store (F4): scanned files + meta.json + tags → songs.
 * Cached data is shown immediately, fresh data loads in the background (R-UX-07).
 */

export interface LibraryState {
  status: 'idle' | 'scanning' | 'ready' | 'error';
  files: ScannedFile[];
  /** lyrics documents found by the scan (F4 §6.3) */
  documents: ScannedFile[];
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
  /** Tempo / pitch / loop per member, song and version (F4 §7.4) */
  readonly practice: PracticeStore;

  constructor(private options: LibraryOptions) {
    this.practice = new PracticeStore(options.storage, options.appRoot, options.memberId);
    const cached = this.read<{ files: ScannedFile[]; documents?: ScannedFile[]; scannedAt: string }>('scan');
    const metas = this.read<Record<string, Versioned<SongMeta>>>('metas') ?? {};
    const files = cached?.files ?? [];
    const documents = cached?.documents ?? [];
    this.state = {
      status: cached ? 'ready' : 'idle',
      files,
      documents,
      scannedAt: cached?.scannedAt ?? null,
      progress: null,
      report: null,
      metas,
      tags: this.read<Versioned<Tag>[]>('tags') ?? [],
      songs: this.build(files, metas, documents),
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

  get home() {
    return this.options.home;
  }

  private build(files: ScannedFile[], metas: Record<string, Versioned<SongMeta>>, documents: ScannedFile[]) {
    return buildSongs(
      files,
      Object.fromEntries(Object.entries(metas).map(([id, m]) => [id, m.value])),
      this.options.home,
      Date.now(),
      this.state?.status === 'idle' ? undefined : documents,
    );
  }

  private set(patch: Partial<LibraryState>) {
    const next = { ...this.state, ...patch };
    if (patch.files || patch.metas || patch.documents) next.songs = this.build(next.files, next.metas, next.documents);
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
      const { audio: files, documents } = await scanFiles(this.options.storage, {
        root: this.options.home,
        skip: this.options.skip,
        signal: this.abort.signal,
        onProgress: (progress) => this.set({ progress }),
        report,
      });
      const scannedAt = new Date().toISOString();
      this.write('scan', { files, documents, scannedAt });
      this.set({ status: 'ready', files, documents, scannedAt, progress: null, report });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Scan failed', error);
      this.set({ status: this.state.files.length > 0 ? 'ready' : 'error', progress: null });
    }
  }

  /* ---------------- song changes ---------------- */

  private async update(
    songId: string,
    mutate: (meta: SongMeta) => SongMeta,
    guard?: (latest: SongMeta) => void,
    seed?: () => SongMeta,
  ) {
    const memberId = this.options.memberId();
    const saved = await updateSongMeta(
      this.options.storage,
      this.options.appRoot,
      songId,
      seed ?? (() => seedMeta(songId, this.song(songId), memberId)),
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
    const song = this.song(songId);
    const rec = song?.recordings.find((r) => r.id === recordingId);
    if (song && rec) {
      emitSystemEvent({
        key: 'song.bandVersion',
        params: { actor: setBy, song: song.title, version: rec.label ?? rec.fileName },
        context: { type: 'song', id: songId },
      });
    }
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

  /* ---------------- adding content (F10) ---------------- */

  /** A song created in the app, possibly without a recording yet (F10 §5.2). */
  async createAppSong(details: { title: string; key: string | null; bpm: number | null; tuning: string | null; tagIds: string[] }): Promise<string> {
    const songId = newId('song');
    const memberId = this.options.memberId();
    await this.update(songId, (meta) => meta, undefined, () => ({
      ...seedMeta(songId, undefined, memberId),
      source: 'app',
      displayTitle: details.title.trim(),
      key: details.key,
      bpm: details.bpm,
      tuning: details.tuning,
      tagIds: details.tagIds,
    }));
    return songId;
  }

  /** Adds an uploaded audio file as a version; the first one becomes the Band-Version (F10 §5.2–5.3). */
  async attachRecording(songId: string, entry: FileEntry, options: { label?: string | null; makeBand?: boolean } = {}) {
    const file: ScannedFile = { path: entry.path, name: entry.name, id: entry.id, size: entry.size, modifiedAt: entry.modifiedAt ?? new Date().toISOString() };
    const recordingId = recordingIdFor(file);
    const memberId = this.options.memberId();
    const files = [...this.state.files.filter((f) => f.path !== file.path), file];
    this.write('scan', { files, documents: this.state.documents, scannedAt: this.state.scannedAt });
    this.set({ files });
    await this.update(songId, (meta) => {
      const first = meta.recordings.length === 0 && !this.song(songId)?.recording;
      meta.recordings.push({ id: recordingId, fileId: entry.id, path: entry.path, size: entry.size, label: options.label?.trim() || null, firstSeenAt: new Date().toISOString() });
      if (first || options.makeBand) meta.bandVersion = { recordingId, setBy: memberId, setAt: new Date().toISOString() };
      return meta;
    });
    return recordingId;
  }

  /** Links a lyrics document; the previous link goes into the history (F10 §5.7). */
  async linkLyrics(songId: string, path: string, fileId?: string) {
    const memberId = this.options.memberId();
    if (!this.state.documents.some((d) => d.path === path)) {
      const name = path.slice(path.lastIndexOf('/') + 1);
      const documents = [...this.state.documents, { path, name, id: fileId }];
      this.write('scan', { files: this.state.files, documents, scannedAt: this.state.scannedAt });
      this.set({ documents });
    }
    await this.update(songId, (meta) => {
      const history = meta.lyricsHistory ?? [];
      if (meta.lyrics && meta.lyrics.path !== path) {
        history.unshift({ path: meta.lyrics.path, savedAt: new Date().toISOString(), savedBy: memberId });
      }
      return { ...meta, lyrics: { path, fileId }, lyricsHistory: history.filter((h) => h.path !== path).slice(0, 20) };
    });
  }

  /** Only removes the link – the file stays (F4 §4.4). */
  unlinkLyrics(songId: string) {
    const memberId = this.options.memberId();
    return this.update(songId, (meta) => ({
      ...meta,
      lyrics: null,
      lyricsHistory: meta.lyrics
        ? [{ path: meta.lyrics.path, savedAt: new Date().toISOString(), savedBy: memberId }, ...(meta.lyricsHistory ?? [])].slice(0, 20)
        : (meta.lyricsHistory ?? []),
    }));
  }

  /** All lyrics paths currently linked to any song (for suggestions). */
  linkedLyricsPaths(): Set<string> {
    return new Set(this.state.songs.flatMap((s) => (s.lyrics ? [s.lyrics.path] : [])));
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
