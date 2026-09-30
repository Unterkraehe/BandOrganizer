import type { Versioned } from '@/core/band/band';
import { newId } from '@/core/data/ids';
import { nowIso, restore, softDelete, touchRecord } from '@/core/data/record';
import type { SafeStorage } from '@/core/storage';
import { normalizeSegues, type Block, type PersonalNotes, type Setlist } from './model';
import { listSetlists, personalPath, readPersonal, setlistPath } from './repository';

/** Setlists (F7). Any member edits any setlist; conflicts are detected on save (F7 §6.7). */

export interface SetlistState {
  status: 'loading' | 'ready' | 'error';
  setlists: Versioned<Setlist>[];
  /** own personal notes per setlist id (loaded on demand) */
  personal: Record<string, PersonalNotes>;
}

interface Options {
  storage: SafeStorage;
  appRoot: string;
  memberId: () => string;
  cacheKey: string | null;
}

export const newBlock = (name: string): Block => ({ id: newId('b'), name, pauseAfterMin: null, entries: [] });

export class SetlistStore {
  private state: SetlistState;
  private listeners = new Set<() => void>();

  constructor(private readonly options: Options) {
    const cached = this.read();
    this.state = cached ? { status: 'ready', setlists: cached, personal: {} } : { status: 'loading', setlists: [], personal: {} };
  }

  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SetlistState>) {
    this.state = { ...this.state, ...patch };
    if (patch.setlists) this.write(this.state.setlists);
    this.listeners.forEach((l) => l());
  }

  async load() {
    try {
      this.set({ setlists: await listSetlists(this.options.storage, this.options.appRoot), status: 'ready' });
    } catch (error) {
      console.error('Loading setlists failed', error);
      this.set({ status: this.state.setlists.length ? 'ready' : 'error' });
    }
  }

  get(id: string) {
    return this.state.setlists.find((s) => s.value.id === id);
  }

  /** Optimistic: the setlist exists in the app immediately (synchronously), then it is saved. */
  async create(name: string, kind: Setlist['kind'], blocks?: Block[], copiedFrom: string | null = null, id = newId('s')): Promise<Setlist> {
    const memberId = this.options.memberId();
    const now = nowIso();
    const setlist: Setlist = {
      id,
      schemaVersion: 1,
      name: name.trim(),
      kind,
      blocks: blocks ?? [newBlock('Set 1')],
      copiedFrom,
      createdAt: now,
      createdBy: memberId,
      updatedAt: now,
      updatedBy: memberId,
      deletedAt: null,
      deletedBy: null,
    };
    const optimistic = { value: setlist, version: undefined as string | undefined };
    this.set({ setlists: [...this.state.setlists, optimistic] });
    try {
      const entry = await this.options.storage.createFile(setlistPath(this.options.appRoot, setlist.id), JSON.stringify(setlist, null, 2) + '\n');
      this.set({ setlists: this.state.setlists.map((s) => (s.value.id === setlist.id && s.version === undefined ? { value: s.value, version: entry.version } : s)) });
      return setlist;
    } catch (error) {
      this.set({ setlists: this.state.setlists.filter((s) => s !== optimistic) });
      throw error;
    }
  }

  /** Save with conflict check: throws ConflictError if someone saved meanwhile (F7 §6.7). */
  async save(setlist: Setlist, version: string | undefined): Promise<Versioned<Setlist>> {
    const next = normalizeSegues(touchRecord(setlist, this.options.memberId()));
    const previous = this.get(next.id);
    const optimistic = { value: next, version };
    this.set({ setlists: this.state.setlists.map((s) => (s.value.id === next.id ? optimistic : s)) });
    try {
      const entry = await this.options.storage.writeJson(setlistPath(this.options.appRoot, next.id), next, { expectedVersion: version });
      const saved = { value: next, version: entry.version };
      this.set({ setlists: this.state.setlists.map((s) => (s === optimistic ? saved : s)) });
      return saved;
    } catch (error) {
      if (previous) this.set({ setlists: this.state.setlists.map((s) => (s === optimistic ? previous : s)) });
      throw error;
    }
  }

  /** "Aus vorheriger Setlist" / "Duplizieren" (F7 §6.5): a NEW setlist; own personal notes are copied. */
  async duplicate(id: string, name: string): Promise<Setlist> {
    const source = this.get(id)?.value;
    if (!source) throw new Error('Unknown setlist');
    const idMap = new Map<string, string>();
    const blocks = source.blocks.map((b) => ({
      ...b,
      id: newId('b'),
      entries: b.entries.map((e) => {
        const nid = newId('x');
        idMap.set(e.id, nid);
        return { ...e, id: nid };
      }),
    }));
    const copy = await this.create(name, source.kind, blocks, source.id);
    const own = await this.loadPersonal(source.id);
    if (own && Object.keys(own.notes).length) {
      const notes = Object.fromEntries(Object.entries(own.notes).flatMap(([k, v]) => (idMap.has(k) ? [[idMap.get(k)!, v]] : [])));
      await this.savePersonal(copy.id, notes);
    }
    return copy;
  }

  async remove(id: string) {
    const current = this.get(id);
    if (current) await this.save(softDelete(current.value, this.options.memberId()), current.version);
  }

  async restore(id: string) {
    const current = this.get(id);
    if (current) await this.save(restore(current.value, this.options.memberId()), current.version);
  }

  async loadPersonal(id: string): Promise<PersonalNotes | null> {
    if (this.state.personal[id]) return this.state.personal[id]!;
    const notes = await readPersonal(this.options.storage, this.options.appRoot, id, this.options.memberId()).catch(() => null);
    if (notes) this.set({ personal: { ...this.state.personal, [id]: notes } });
    return notes;
  }

  /** Own file per member – members never overwrite each other (F7 §7.2). */
  async savePersonal(id: string, notes: Record<string, string>) {
    const clean = Object.fromEntries(Object.entries(notes).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim().slice(0, 80)]));
    const file: PersonalNotes = { schemaVersion: 1, notes: clean, updatedAt: nowIso() };
    const previous = this.state.personal[id];
    this.set({ personal: { ...this.state.personal, [id]: file } }); // optimistic
    try {
      await this.options.storage.writeJson(personalPath(this.options.appRoot, id, this.options.memberId()), file);
    } catch (error) {
      const personal = { ...this.state.personal };
      if (previous) personal[id] = previous;
      else delete personal[id];
      this.set({ personal });
      throw error;
    }
  }

  private read(): Versioned<Setlist>[] | null {
    if (!this.options.cacheKey) return null;
    try {
      const raw = localStorage.getItem(this.options.cacheKey);
      return raw ? (JSON.parse(raw) as Versioned<Setlist>[]) : null;
    } catch {
      return null;
    }
  }

  private write(value: unknown) {
    if (!this.options.cacheKey) return;
    try {
      localStorage.setItem(this.options.cacheKey, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}
