import { newId } from '@/core/data/ids';
import { migrate } from '@/core/data/migrate';
import { nowIso, softDelete, touchRecord } from '@/core/data/record';
import type { ItemRef, SystemEvent } from '@/core/events';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import { MESSAGE_MAX, monthOf, type ChatMessage, type Reaction } from './model';

/**
 * Band chat (F6): one file per message, monthly folders, polling instead of a server,
 * read status per member on HiDrive (shared across devices).
 */

export interface ChatState {
  status: 'loading' | 'ready' | 'error';
  messages: ChatMessage[];
  versions: Record<string, string | undefined>;
  reactions: Record<string, Record<string, Reaction>>;
  lastReadAt: string | null;
  /** oldest month loaded (YYYY-MM); older ones load on demand */
  oldestMonth: string | null;
  hasOlder: boolean;
}

interface Options {
  storage: SafeStorage;
  appRoot: string;
  memberId: () => string;
  cacheKey: string | null;
  now?: () => Date;
}

const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

export class ChatStore {
  private state: ChatState;
  private listeners = new Set<() => void>();
  private months: string[] = []; // all month folders on HiDrive, sorted
  private readTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  constructor(private readonly options: Options) {
    const cached = this.read();
    this.state = cached
      ? { ...cached, status: 'ready' }
      : { status: 'loading', messages: [], versions: {}, reactions: {}, lastReadAt: null, oldestMonth: null, hasOlder: false };
  }

  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private get root() {
    return joinPath(this.options.appRoot, 'chat');
  }
  private monthDir(ym: string) {
    return joinPath(this.root, 'messages', ym);
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }

  private set(patch: Partial<ChatState>) {
    this.state = { ...this.state, ...patch };
    const { status: _s, ...rest } = this.state;
    void _s;
    this.write(rest);
    this.listeners.forEach((l) => l());
  }

  private async list(path: string) {
    try {
      return await this.options.storage.list(path);
    } catch (error) {
      if (error instanceof NotFoundError) return [];
      throw error;
    }
  }

  /** Initial load: read status + the current month (and the previous one if few messages). */
  async load() {
    try {
      const me = this.options.memberId();
      const read = await this.options.storage.readJson<{ lastReadAt: string }>(joinPath(this.root, 'read', `${me}.json`)).catch(() => null);
      this.months = (await this.list(joinPath(this.root, 'messages'))).filter((e) => e.type === 'folder').map((e) => e.name).sort();
      const current = monthOf(this.now().toISOString());
      const start = this.state.oldestMonth && this.state.oldestMonth < current ? this.state.oldestMonth : current;
      await this.syncMonths(this.months.filter((m) => m >= start));
      if (this.state.messages.length < 20) await this.loadOlder();
      this.set({ status: 'ready', lastReadAt: read?.lastReadAt ?? this.state.lastReadAt, hasOlder: this.months.some((m) => m < (this.state.oldestMonth ?? current)) });
    } catch (error) {
      console.error('Chat load failed', error);
      this.set({ status: this.state.messages.length ? 'ready' : 'error' });
    }
  }

  /** Checks the newest month for new/changed files (F6 §4.3). */
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const current = monthOf(this.now().toISOString());
      if (!this.months.includes(current)) {
        this.months = (await this.list(joinPath(this.root, 'messages'))).filter((e) => e.type === 'folder').map((e) => e.name).sort();
      }
      const latest = this.months.filter((m) => m >= prevMonth(current)).slice(-2);
      await this.syncMonths(latest);
    } catch (error) {
      console.warn('Chat poll failed', error);
    } finally {
      this.polling = false;
    }
  }

  async loadOlder() {
    const oldest = this.state.oldestMonth ?? monthOf(this.now().toISOString());
    const older = this.months.filter((m) => m < oldest);
    const next = older.at(-1);
    if (!next) {
      this.set({ hasOlder: false });
      return;
    }
    await this.syncMonths([next]);
    this.set({ hasOlder: older.length > 1 });
  }

  private async syncMonths(months: string[]) {
    let messages = [...this.state.messages];
    const versions = { ...this.state.versions };
    let changed = false;
    for (const ym of months) {
      const entries = (await this.list(this.monthDir(ym))).filter((e) => e.name.endsWith('.json'));
      const toRead = entries.filter((e) => versions[e.name] !== e.version || !messages.some((m) => e.name.endsWith(`_${m.id}.json`)));
      for (let i = 0; i < toRead.length; i += 8) {
        const batch = await Promise.all(
          toRead.slice(i, i + 8).map(async (e) => {
            try {
              return { entry: e, msg: migrate<ChatMessage>(await this.options.storage.readJson<unknown>(e.path), 1, []) };
            } catch {
              return null;
            }
          }),
        );
        for (const item of batch) {
          if (!item) continue;
          versions[item.entry.name] = item.entry.version;
          messages = [...messages.filter((m) => m.id !== item.msg.id), item.msg];
          changed = true;
        }
      }
      if (!this.state.oldestMonth || ym < this.state.oldestMonth) this.state = { ...this.state, oldestMonth: ym };
    }
    if (changed) {
      messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      this.set({ messages, versions });
      await this.loadReactions(messages.slice(-200).map((m) => m.id));
    } else this.set({});
  }

  private async loadReactions(ids: string[]) {
    const folders = new Set((await this.list(joinPath(this.root, 'reactions'))).filter((e) => e.type === 'folder').map((e) => e.name));
    const reactions = { ...this.state.reactions };
    for (const id of ids.filter((x) => folders.has(x))) {
      const files = (await this.list(joinPath(this.root, 'reactions', id))).filter((e) => e.name.endsWith('.json'));
      const map: Record<string, Reaction> = {};
      for (const f of files) {
        const r = await this.options.storage.readJson<{ emoji: Reaction | null }>(f.path).catch(() => null);
        if (r?.emoji) map[f.name.replace(/\.json$/, '')] = r.emoji;
      }
      reactions[id] = map;
    }
    this.set({ reactions });
  }

  /* ---------------- writing ---------------- */

  private fileName(msg: ChatMessage) {
    return `${Date.parse(msg.createdAt)}_${msg.id}.json`;
  }

  async send(text: string, extra: { context?: ItemRef | null; share?: ItemRef | null; replyTo?: ChatMessage['replyTo'] } = {}): Promise<ChatMessage> {
    const trimmed = text.trim().slice(0, MESSAGE_MAX);
    if (!trimmed && !extra.share) throw new Error('Empty message');
    return this.create({ type: 'text', text: trimmed, context: extra.context ?? null, share: extra.share ?? null, replyTo: extra.replyTo ?? null });
  }

  /** Info line from a system event (F6 §4.2). */
  system(event: SystemEvent) {
    return this.create({ type: 'system', text: '', systemKey: event.key, params: event.params, context: event.context ?? null, share: null, replyTo: null });
  }

  private async create(fields: Pick<ChatMessage, 'type' | 'text' | 'context' | 'share' | 'replyTo'> & Partial<ChatMessage>) {
    const me = this.options.memberId();
    const now = this.now().toISOString();
    const msg: ChatMessage = {
      ...fields,
      id: newId('c'),
      schemaVersion: 1,
      editedAt: null,
      createdAt: now,
      createdBy: me,
      updatedAt: now,
      updatedBy: me,
      deletedAt: null,
      deletedBy: null,
    };
    // optimistic (R-UX-07)
    this.set({ messages: [...this.state.messages, msg] });
    const ym = monthOf(now);
    const entry = await this.options.storage.createFile(joinPath(this.monthDir(ym), this.fileName(msg)), JSON.stringify(msg, null, 2) + '\n').catch((error) => {
      this.set({ messages: this.state.messages.filter((m) => m.id !== msg.id) });
      throw error;
    });
    if (!this.months.includes(ym)) this.months = [...this.months, ym].sort();
    this.set({ versions: { ...this.state.versions, [this.fileName(msg)]: entry.version } });
    if (msg.type === 'text') this.markRead(now);
    return msg;
  }

  private async save(next: ChatMessage) {
    const name = this.fileName(next);
    const entry = await this.options.storage.writeJson(joinPath(this.monthDir(monthOf(next.createdAt)), name), next, { expectedVersion: this.state.versions[name] });
    this.set({ messages: this.state.messages.map((m) => (m.id === next.id ? next : m)), versions: { ...this.state.versions, [name]: entry.version } });
  }

  edit(msg: ChatMessage, text: string) {
    const me = this.options.memberId();
    return this.save({ ...touchRecord(msg, me, { text: text.trim().slice(0, MESSAGE_MAX) }), editedAt: nowIso() });
  }

  /** Soft delete → "Nachricht gelöscht" placeholder (R-DATA-05). */
  remove(msg: ChatMessage) {
    return this.save(softDelete(msg, this.options.memberId()));
  }

  /** One file per member and message – no conflicts (F6 §5). null removes the reaction. */
  async react(msg: ChatMessage, emoji: Reaction | null) {
    const me = this.options.memberId();
    await this.options.storage.writeJson(joinPath(this.root, 'reactions', msg.id, `${me}.json`), { schemaVersion: 1, emoji, updatedAt: nowIso() });
    const current = { ...(this.state.reactions[msg.id] ?? {}) };
    if (emoji) current[me] = emoji;
    else delete current[me];
    this.set({ reactions: { ...this.state.reactions, [msg.id]: current } });
  }

  /** Written at most every few seconds (F6 §4.4). */
  markRead(at: string) {
    if (this.state.lastReadAt && this.state.lastReadAt >= at) return;
    this.set({ lastReadAt: at });
    if (this.readTimer) clearTimeout(this.readTimer);
    this.readTimer = setTimeout(() => {
      void this.options.storage
        .writeJson(joinPath(this.root, 'read', `${this.options.memberId()}.json`), { schemaVersion: 1, lastReadAt: this.state.lastReadAt })
        .catch(() => undefined);
    }, 2000);
  }

  unread(): ChatMessage[] {
    const me = this.options.memberId();
    const since = this.state.lastReadAt ?? '';
    return this.state.messages.filter((m) => m.createdBy !== me && m.createdAt > since && !m.deletedAt);
  }

  dispose() {
    if (this.readTimer) clearTimeout(this.readTimer);
    this.listeners.clear();
  }

  private read(): Omit<ChatState, 'status'> | null {
    if (!this.options.cacheKey) return null;
    try {
      const raw = localStorage.getItem(this.options.cacheKey);
      return raw ? (JSON.parse(raw) as Omit<ChatState, 'status'>) : null;
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
