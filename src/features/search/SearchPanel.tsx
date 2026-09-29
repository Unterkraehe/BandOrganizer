import { CalendarDays, Clock, FileText, ListMusic, MessageCircle, Music, Search, Settings, StickyNote, Tag, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Chip, IconButton } from '@/ui';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { occurrencePath, occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { useSetlistMode } from '@/features/setlists/SetlistModeProvider';
import { useLibrary } from '@/features/songs/LibraryProvider';
import { useSession } from '@/core/session/BandSession';
import { groupOf, GROUPS, type DocType, type Group, type Hit } from './engine';
import { highlight, snippet } from './highlight';
import { recentSongs } from './recent';
import { useSearch } from './SearchProvider';
import styles from './Search.module.css';

const ICONS: Record<DocType, typeof Music> = { song: Music, tag: Tag, lyrics: FileText, event: CalendarDays, setlist: ListMusic, note: StickyNote, chat: MessageCircle, member: Users, setting: Settings };
const FILTERS: (Group | 'all')[] = ['all', 'songs', 'lyrics', 'events', 'setlists', 'notes', 'chat', 'members'];
const recentKey = (memberId: string) => `bandapp.recentSearches.${memberId}`;
const PER_GROUP = 5;

function readRecent(memberId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(recentKey(memberId)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

interface Row {
  key: string;
  type: DocType;
  title: string;
  snippet: string | null;
  context: string;
  route: string;
}

/** Search UI (F8 §3): used as full page on phones and as overlay on larger screens. */
export function SearchPanel({ initialQuery, onNavigate, onClose }: { initialQuery: string; onNavigate?: () => void; onClose?: () => void }) {
  const { t } = useTranslation('search');
  const navigate = useNavigate();
  const { index, version, lyricsPending, dateHits } = useSearch();
  const { songs } = useLibrary();
  const { store: calendar } = useCalendar();
  const { members, currentMember } = useSession();
  const memberId = currentMember?.id ?? 'unknown';
  const mode = useSetlistMode();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [filter, setFilter] = useState<Group | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState(() => readRecent(memberId));
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    const q = debounced.trim();
    const hits: Hit[] = q.length >= 2 ? index.search(q) : [];
    const groups = new Map<Group, Row[]>();
    const archived: Row[] = [];
    const toRow = (h: Hit): Row => ({
      key: h.doc.id,
      type: h.doc.type,
      title: h.doc.title,
      snippet: h.doc.text ? snippet(h.doc.text, q) : null,
      context: h.doc.context,
      route: h.doc.route,
    });
    for (const h of hits) {
      const g = groupOf(h.doc.type);
      if (h.doc.archived) archived.push(toRow(h));
      else groups.set(g, [...(groups.get(g) ?? []), toRow(h)]);
    }
    // date terms ("okt", "morgen") add matching dates to the events group
    const byDate = q.length >= 2 ? dateHits(q) : [];
    if (byDate.length) {
      const seen = new Set((groups.get('events') ?? []).map((r) => r.route));
      const dateRows = byDate
        .filter((d) => !seen.has(d.path))
        .map((d) => ({ key: `date:${d.path}`, type: 'event' as const, title: d.title, snippet: null, context: `${t(`calendar:types.${d.occ.type}`)} · ${d.when}`, route: d.path }));
      groups.set('events', [...dateRows, ...(groups.get('events') ?? [])]);
    }
    return { groups, archived, total: hits.length + byDate.length };
  }, [debounced, index, version, dateHits, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleGroups = GROUPS.filter((g) => (filter === 'all' || filter === g) && results.groups.get(g)?.length);
  const flat: Row[] = visibleGroups.flatMap((g) => {
    const rows = results.groups.get(g)!;
    return filter === 'all' && !expanded.has(g) ? rows.slice(0, PER_GROUP) : rows;
  });
  if (expanded.has('archive')) flat.push(...results.archived);

  const go = (route: string) => {
    const q = debounced.trim();
    if (q.length >= 2) {
      const next = [q, ...recent.filter((r) => r !== q)].slice(0, 8);
      setRecent(next);
      localStorage.setItem(recentKey(memberId), JSON.stringify(next));
    }
    onNavigate?.();
    navigate(route);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      go(flat[active]!.route);
    } else if (e.key === 'Escape') onClose?.();
  };
  useEffect(() => setActive(0), [debounced, filter]);
  useEffect(() => {
    document.querySelector(`[data-search-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const q = debounced.trim();
  let n = -1;
  const renderRow = (row: Row) => {
    n++;
    const Icon = ICONS[row.type];
    return (
      <li key={row.key}>
        <button type="button" className={styles.row} data-active={n === active || undefined} data-search-index={n} onClick={() => go(row.route)}>
          <Icon size={18} className={styles.rowIcon} aria-hidden="true" />
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>
              <Highlighted text={row.title} query={q} />
            </span>
            {row.snippet && (
              <span className={styles.rowSnippet}>
                <Highlighted text={row.snippet} query={q} />
              </span>
            )}
            <span className={styles.rowContext}>{row.context}</span>
          </span>
        </button>
      </li>
    );
  };

  const nextEvent = calendar.upcoming(1, (o) => o.type !== 'absence' && !o.cancelled)[0];
  const recentOpened = recentSongs()
    .map((id) => songs.find((s) => s.id === id))
    .filter((s) => s !== undefined)
    .slice(0, 3);

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <Search size={20} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          className={styles.input}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          enterKeyHint="search"
        />
        {query && <IconButton label={t('common:actions.clear')} icon={<X size={18} />} onClick={() => setQuery('')} />}
        {onClose && <IconButton label={t('close')} icon={<X size={20} />} onClick={onClose} />}
      </div>

      {q.length >= 2 && (
        <div className={styles.filters} role="group" aria-label={t('filter.all')}>
          {FILTERS.map((f) => (
            <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`filter.${f}`)}
            </Chip>
          ))}
        </div>
      )}

      <div className={styles.results} aria-live="polite">
        {q.length < 2 ? (
          <>
            {recent.length > 0 && (
              <section className={styles.group}>
                <h2 className={styles.groupTitle}>
                  {t('recent')}
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => {
                      setRecent([]);
                      localStorage.removeItem(recentKey(memberId));
                    }}
                  >
                    {t('clearRecent')}
                  </button>
                </h2>
                <ul className={styles.list}>
                  {recent.map((r) => (
                    <li key={r}>
                      <button type="button" className={styles.row} onClick={() => setQuery(r)}>
                        <Clock size={18} className={styles.rowIcon} aria-hidden="true" />
                        <span className={styles.rowTitle}>{r}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className={styles.group}>
              <h2 className={styles.groupTitle}>{t('quick')}</h2>
              <ul className={styles.list}>
                {nextEvent && (
                  <li>
                    <button type="button" className={styles.row} onClick={() => go(occurrencePath(nextEvent))}>
                      <CalendarDays size={18} className={styles.rowIcon} aria-hidden="true" />
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{occurrenceTitle(nextEvent, t, members)}</span>
                        <span className={styles.rowContext}>
                          {t('nextEvent')} · {occurrenceWhen(nextEvent, t)}
                        </span>
                      </span>
                    </button>
                  </li>
                )}
                {mode.setlist && (
                  <li>
                    <button type="button" className={styles.row} onClick={() => go(`/setlists/${mode.setlist!.id}`)}>
                      <ListMusic size={18} className={styles.rowIcon} aria-hidden="true" />
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{mode.setlist.name}</span>
                        <span className={styles.rowContext}>{t('currentSetlist')}</span>
                      </span>
                    </button>
                  </li>
                )}
                {recentOpened.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={styles.row} onClick={() => go(`/songs/${s.id}`)}>
                      <Music size={18} className={styles.rowIcon} aria-hidden="true" />
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{s.title}</span>
                        <span className={styles.rowContext}>{t('recentSongs')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <>
            {visibleGroups.map((g) => {
              const rows = results.groups.get(g)!;
              const shown = filter === 'all' && !expanded.has(g) ? rows.slice(0, PER_GROUP) : rows;
              return (
                <section key={g} className={styles.group}>
                  <h2 className={styles.groupTitle}>
                    {t(`groups.${g}`)} <span className={styles.count}>{rows.length}</span>
                  </h2>
                  {g === 'lyrics' && lyricsPending > 0 && <p className={styles.hint}>{t('indexing', { count: lyricsPending })}</p>}
                  <ul className={styles.list}>{shown.map(renderRow)}</ul>
                  {shown.length < rows.length && (
                    <button type="button" className={styles.link} onClick={() => setExpanded((s) => new Set([...s, g]))}>
                      {t('showAll', { count: rows.length })}
                    </button>
                  )}
                </section>
              );
            })}
            {results.archived.length > 0 && (filter === 'all' || filter === 'songs' || filter === 'lyrics') && (
              <section className={styles.group}>
                {expanded.has('archive') ? (
                  <ul className={styles.list}>{results.archived.map(renderRow)}</ul>
                ) : (
                  <button type="button" className={styles.link} onClick={() => setExpanded((s) => new Set([...s, 'archive']))}>
                    {t('archivedHits', { count: results.archived.length })}
                  </button>
                )}
              </section>
            )}
            {visibleGroups.length === 0 && results.archived.length === 0 && (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>{t('empty', { q })}</p>
                <p className={styles.hint}>{t('emptyHint')}</p>
                {lyricsPending > 0 && <p className={styles.hint}>{t('indexing', { count: lyricsPending })}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
