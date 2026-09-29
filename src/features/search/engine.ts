import MiniSearch from 'minisearch';
import { normalizeText } from '@/core/search/normalize';

/** Client-side full-text index (F8 §6.1) on top of MiniSearch with the shared normalizer. */

export type DocType = 'song' | 'tag' | 'lyrics' | 'event' | 'setlist' | 'note' | 'chat' | 'member' | 'setting';
export type Group = 'songs' | 'lyrics' | 'events' | 'setlists' | 'notes' | 'chat' | 'members' | 'settings';
export const GROUPS: Group[] = ['songs', 'lyrics', 'events', 'setlists', 'notes', 'chat', 'members', 'settings'];

export const groupOf = (type: DocType): Group =>
  (({ song: 'songs', tag: 'songs', lyrics: 'lyrics', event: 'events', setlist: 'setlists', note: 'notes', chat: 'chat', member: 'members', setting: 'settings' }) as const)[type];

export interface SearchDoc {
  id: string;
  type: DocType;
  /** indexed, boosted */
  title: string;
  /** indexed: content (lyrics line, note, message …) */
  text: string;
  /** indexed: tags, key, location, synonyms … */
  extra: string;
  /** shown under the title */
  context: string;
  /** where the result leads */
  route: string;
  archived?: boolean;
  /** ISO date for tie-breaking (newer / upcoming first) */
  sortDate?: string;
}

export interface Hit {
  doc: SearchDoc;
  score: number;
}

const tokenize = (text: string) => text.split(/[\s\p{P}\p{S}]+/u);
const processTerm = (term: string) => {
  const n = normalizeText(term);
  if (!n) return null;
  return n.includes(' ') ? n.split(' ') : n;
};

export class SearchIndex {
  private mini = this.create();
  private docs = new Map<string, SearchDoc>();

  private create() {
    return new MiniSearch<SearchDoc>({
      fields: ['title', 'text', 'extra'],
      storeFields: [],
      tokenize,
      processTerm,
      searchOptions: {
        prefix: true,
        // 1 typo for words ≥ 4 characters, 2 for ≥ 8 (F8 §5)
        fuzzy: (term) => (term.length >= 8 ? 2 : term.length >= 4 ? 1 : false),
        boost: { title: 3, extra: 1.5 },
        combineWith: 'AND',
      },
    });
  }

  get size() {
    return this.docs.size;
  }

  replaceAll(docs: SearchDoc[]) {
    this.mini = this.create();
    this.docs = new Map(docs.map((d) => [d.id, d]));
    this.mini.addAll([...this.docs.values()]);
  }

  search(query: string): Hit[] {
    const q = normalizeText(query);
    if (q.length < 2) return [];
    return this.mini
      .search(query)
      .map((r) => {
        const doc = this.docs.get(r.id as string)!;
        const title = normalizeText(doc.title);
        // exact title > title prefix > other title hits > content (F8 §5)
        const bonus = title === q ? 1000 : title.startsWith(q) ? 100 : 0;
        return { doc, score: r.score + bonus };
      })
      .sort((a, b) => b.score - a.score || (b.doc.sortDate ?? '').localeCompare(a.doc.sortDate ?? ''));
  }
}
