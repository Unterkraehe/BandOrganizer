import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { occurrencePath, occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import type { Occurrence } from '@/features/calendar/model';
import { addDays, todayLocal } from '@/features/calendar/time';
import { useChat } from '@/features/chat/ChatProvider';
import { itemPath, systemText } from '@/features/chat/items';
import { songEntries } from '@/features/setlists/model';
import { useSetlists } from '@/features/setlists/SetlistProvider';
import { useLibrary } from '@/features/songs/LibraryProvider';
import { recordingName } from '@/features/songs/model';
import { listNotes, type NoteEntry } from '@/features/songs/repository';
import { useIsWide } from '@/ui/useMediaQuery';
import { inRanges, parseDateQuery } from './dates';
import { SearchIndex, type SearchDoc } from './engine';
import { cachedLines, extractLines } from './lyricsCache';
import { settingsDocs } from './settingsDocs';

interface SearchContextValue {
  index: SearchIndex;
  version: number;
  lyricsPending: number;
  /** occurrences whose dates match date terms in the query */
  dateHits: (query: string) => { occ: Occurrence; title: string; when: string; path: string }[];
  open: (query?: string) => void;
  close: () => void;
  overlayOpen: boolean;
  initialQuery: string;
}

const Ctx = createContext<SearchContextValue | null>(null);
const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));

/** Builds and updates the search index from all features (F8 §6). Per band and member. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const wide = useIsWide();
  const { members, currentMember } = useSession();
  const { songs, tags, state: libState, store: library } = useLibrary();
  const { store: calendar, state: calState } = useCalendar();
  const { setlists, store: setlistStore, state: setlistState } = useSetlists();
  const { store: chat, state: chatState } = useChat();
  const [index] = useState(() => new SearchIndex());
  const [version, setVersion] = useState(0);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [lyricsTick, setLyricsTick] = useState(0);
  const [lyricsPending, setLyricsPending] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const memberId = currentMember?.id ?? 'unknown';

  /* ---------- background loading (throttled, after start) ---------- */
  // another member on this device: drop everything member-specific right away (F2 §5.5, R-SEC-01)
  useEffect(() => {
    setNotes([]);
  }, [memberId]);
  const songIdsKey = songs.map((s) => [s.id, ...s.mergedSongIds].join(',')).join(';');
  useEffect(() => {
    let cancelled = false;
    const handle = idle(() => {
      const ids = songIdsKey.split(/[;,]/).filter(Boolean);
      if (ids.length) void listNotes(library.storage, library.appRoot, ids, memberId).then((n) => !cancelled && setNotes(n)).catch(() => undefined);
      // own personal setlist notes (never other members' – R-SEC-01)
      for (const s of setlistStore.getState().setlists) void setlistStore.loadPersonal(s.value.id).catch(() => undefined);
      // older chat months for indexing
      void (async () => {
        for (let i = 0; i < 24 && chat.getState().hasOlder && !cancelled; i++) await chat.loadOlder().catch(() => undefined);
      })();
    });
    return () => {
      cancelled = true;
      if (typeof handle === 'number') clearTimeout(handle);
    };
  }, [songIdsKey, memberId, library, setlistStore, chat]);

  // lyrics text extraction, one file after the other
  const lyricsJobs = useMemo(() => {
    const versions = new Map(libState.documents.map((d) => [d.path, `${d.modifiedAt ?? ''}:${d.size ?? ''}`]));
    return songs.filter((s) => s.lyrics && !s.lyrics.missing).map((s) => ({ path: s.lyrics!.path, v: versions.get(s.lyrics!.path) ?? '?' }));
  }, [songs, libState.documents]);
  useEffect(() => {
    let cancelled = false;
    const todo = lyricsJobs.filter((j) => cachedLines(j.path, j.v) === undefined);
    setLyricsPending(todo.length);
    if (!todo.length) return;
    const handle = idle(() => {
      void (async () => {
        for (const [i, job] of todo.entries()) {
          if (cancelled) return;
          await extractLines(library.storage, job.path, job.v);
          setLyricsPending(todo.length - i - 1);
          if (i % 5 === 4 || i === todo.length - 1) setLyricsTick((n) => n + 1);
          await new Promise((r) => setTimeout(r, 150));
        }
      })();
    });
    return () => {
      cancelled = true;
      if (typeof handle === 'number') clearTimeout(handle);
    };
  }, [lyricsJobs, library]);

  /* ---------- documents from all features (F8 §4) ---------- */
  const docs = useMemo(() => {
    const out: SearchDoc[] = [];
    const tagName = new Map(tags.map((tag) => [tag.id, tag.name]));
    const songTitle = new Map<string, string>();
    for (const s of songs) {
      songTitle.set(s.id, s.title);
      for (const m of s.mergedSongIds) songTitle.set(m, s.title);
      if (s.hidden) continue;
      out.push({
        id: `song:${s.id}`,
        type: 'song',
        title: s.title,
        text: '',
        extra: [...s.tagIds.map((id) => tagName.get(id) ?? ''), s.key ?? '', s.tuning ?? '', ...s.recordings.map((r) => r.label ?? '')].join(' '),
        context: [t('search:types.song'), s.key, s.recording ? recordingName(s.recording) : null].filter(Boolean).join(' · '),
        route: `/songs/${s.id}`,
        archived: s.archived,
      });
      if (s.lyrics && !s.lyrics.missing) {
        const v = lyricsJobs.find((j) => j.path === s.lyrics!.path)?.v ?? '?';
        const lines = cachedLines(s.lyrics.path, v);
        lines?.forEach((line, i) =>
          out.push({ id: `lyr:${s.id}:${i}`, type: 'lyrics', title: s.title, text: line, extra: '', context: `${t('search:groups.lyrics')} · ${s.title}`, route: `/songs/${s.id}?tab=lyrics&find=${encodeURIComponent(line.slice(0, 60))}`, archived: s.archived }),
        );
      }
    }
    for (const tag of tags) {
      const count = songs.filter((s) => s.tagIds.includes(tag.id) && !s.hidden).length;
      out.push({ id: `tag:${tag.id}`, type: 'tag', title: tag.name, text: '', extra: '', context: `${t('search:types.tag')} · ${t('songs:count', { count })}`, route: `/songs?tag=${tag.id}` });
    }
    for (const n of notes) {
      if (n.scope === 'private' && n.note.createdBy !== memberId) continue; // never index other members' private notes
      const author = members.find((m) => m.id === n.note.createdBy)?.displayName ?? '?';
      out.push({
        id: `note:${n.note.id}`,
        type: 'note',
        title: songTitle.get(n.songId) ?? '?',
        text: n.note.text,
        extra: author,
        context: n.scope === 'private' ? t('search:context.private') : t('search:context.noteBy', { name: author }),
        route: `/songs/${n.songId}?tab=${n.scope}&note=${n.note.id}`,
        sortDate: n.note.createdAt,
      });
    }
    // events: one document per event, leading to the next (or last) occurrence
    const today = todayLocal();
    for (const e of calState.events.map((x) => x.value).filter((x) => !x.deletedAt)) {
      const next = calendar.upcoming(1, (o) => o.event.id === e.id)[0] ?? calendar.occurrences(addDays(today, -730), today).filter((o) => o.event.id === e.id).at(-1);
      if (!next) continue;
      const past = next.endDate < today;
      out.push({
        id: `event:${e.id}`,
        type: 'event',
        title: occurrenceTitle(next, t, members),
        text: e.description ?? '',
        extra: [t(`calendar:types.${e.type}`), e.location?.name ?? '', e.location?.address ?? ''].join(' '),
        context: [t(`calendar:types.${e.type}`), occurrenceWhen(next, t), next.cancelled ? t('calendar:cancelled') : null, past ? t('search:context.past') : null].filter(Boolean).join(' · '),
        route: occurrencePath(next),
        // upcoming before past; upcoming: soonest first, past: most recent first (sorted descending)
        sortDate: past ? `0${next.startDate}` : `1${String(99999999 - Number(next.startDate.replace(/-/g, ''))).padStart(8, '0')}`,
      });
    }
    for (const s of setlists) {
      const personal = setlistState.personal[s.id]?.notes ?? {};
      const titles = songEntries(s).map((e) => songTitle.get(e.songId) ?? '');
      const notesText = s.blocks.flatMap((b) => b.entries.map((e) => (e.type === 'song' ? [e.note ?? '', personal[e.id] ?? ''].join(' ') : e.text))).join(' ');
      out.push({ id: `setlist:${s.id}`, type: 'setlist', title: s.name, text: notesText, extra: titles.join(' '), context: `${t(`setlists:kind.${s.kind}`)} · ${t('setlists:songs', { count: titles.length })}`, route: `/setlists/${s.id}`, sortDate: s.updatedAt });
    }
    for (const m of chatState.messages) {
      if (m.deletedAt) continue;
      const author = members.find((x) => x.id === m.createdBy)?.displayName ?? '?';
      const text = m.type === 'system' ? systemText(m, t, members) : m.text;
      if (!text) continue;
      out.push({
        id: `chat:${m.id}`,
        type: 'chat',
        title: m.type === 'system' ? t('search:types.info') : author,
        text,
        extra: author,
        context: `${t('search:groups.chat')} · ${formatDate(m.createdAt)}`,
        route: m.context && m.type === 'text' ? `${itemPath(m.context)}` : `/chat?message=${m.id}`,
        sortDate: m.createdAt,
      });
    }
    for (const m of members) {
      out.push({ id: `member:${m.id}`, type: 'member', title: m.displayName, text: '', extra: m.role ?? '', context: [m.role, m.active ? null : t('search:context.former')].filter(Boolean).join(' · ') || t('search:types.member'), route: `/members/${m.id}` });
    }
    out.push(...settingsDocs(t));
    return out;
  }, [memberId, songs, tags, notes, calState, calendar, setlists, setlistState.personal, chatState.messages, members, t, lyricsTick, lyricsJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // rebuild the index shortly after data changes (small data: a full rebuild takes a few ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      index.replaceAll(docs);
      setVersion((v) => v + 1);
    }, 200);
    return () => clearTimeout(timer);
  }, [docs, index]);

  const dateHits = useCallback(
    (query: string) => {
      const { ranges, rest } = parseDateQuery(query, todayLocal());
      if (!ranges.length) return [];
      const from = ranges.reduce((min, r) => (r.from < min ? r.from : min), ranges[0]!.from);
      const to = ranges.reduce((max, r) => (r.to > max ? r.to : max), ranges[0]!.to);
      const restHits = rest.trim().length >= 2 ? new Set(index.search(rest).filter((h) => h.doc.type === 'event').map((h) => h.doc.id)) : null;
      return calendar
        .occurrences(from, to)
        .filter((o) => o.type !== 'absence' && inRanges(o.startDate, o.endDate, ranges) && (!restHits || restHits.has(`event:${o.event.id}`)))
        .map((o) => ({ occ: o, title: occurrenceTitle(o, t, members), when: occurrenceWhen(o, t), path: occurrencePath(o) }));
    },
    [calendar, index, members, t, calState], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Ctrl/⌘ + K (F8 §3.1)
  const open = useCallback(
    (query = '') => {
      setInitialQuery(query);
      if (wide) setOverlayOpen(true);
      else navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
    },
    [wide, navigate],
  );
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value: SearchContextValue = { index, version, lyricsPending, dateHits, open, close: () => setOverlayOpen(false), overlayOpen, initialQuery };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSearch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider');
  return ctx;
}
