import { Play, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAgo, formatDuration } from '@/core/i18n/format';
import { matchesQuery } from '@/core/search/normalize';
import { useSession } from '@/core/session/BandSession';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { occurrenceTitle } from '@/features/calendar/format';
import { addDays, todayLocal } from '@/features/calendar/time';
import { useLibrary } from '@/features/songs/LibraryProvider';
import { sortSongs, type Song } from '@/features/songs/model';
import { usePlaySong } from '@/features/songs/usePlaySong';
import { Button, Chip, IconButton, Tabs } from '@/ui';
import { lastPlayed, suggestions } from './history';
import { useSetlists } from './SetlistProvider';
import styles from './Setlists.module.css';

interface SongPickerProps {
  inSetlist: Set<string>;
  onAdd: (songIds: string[]) => void;
  rehearsal: boolean;
  targetLabel: string;
}

/** Song picker (F7 §4.3): all songs (archive at the end), search, tags, multi-select, suggestions. */
export function SongPicker({ inSetlist, onAdd, rehearsal, targetLabel }: SongPickerProps) {
  const { t } = useTranslation('setlists');
  const { songs, tags } = useLibrary();
  const { setlists } = useSetlists();
  const { store: calendar, state: calState } = useCalendar();
  const { members } = useSession();
  const { play } = usePlaySong();
  const [tab, setTab] = useState<'all' | 'suggest'>(rehearsal ? 'suggest' : 'all');
  const [query, setQuery] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(10);

  const matches = (s: Song) => matchesQuery(s.searchText, query) && tagIds.every((id) => s.tagIds.includes(id));
  const usable = songs.filter((s) => !s.hidden && s.recording);
  const active = sortSongs(usable.filter((s) => !s.archived && matches(s)), 'az');
  const archived = sortSongs(usable.filter((s) => s.archived && matches(s)), 'az');

  const played = useMemo(() => {
    const today = todayLocal();
    return lastPlayed(calendar.occurrences(addDays(today, -1100), addDays(today, -1)), setlists, songs);
  }, [calendar, calState, setlists, songs]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggested = suggestions(usable.filter(matches), played, inSetlist);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const add = (ids: string[]) => {
    onAdd(ids);
    setSelected((s) => s.filter((x) => !ids.includes(x)));
  };

  const row = (song: Song, extra?: string) => (
    <li key={song.id} className={styles.pickRow}>
      <label>
        <input type="checkbox" checked={selected.includes(song.id)} onChange={() => toggle(song.id)} aria-label={t('picker.select', { title: song.title })} />
        <span style={{ display: 'grid', minWidth: 0 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>
            {song.title}
            {song.archived && <small className={styles.meta}> · {t('archived')}</small>}
          </strong>
          <span className={styles.meta}>
            {[song.recording?.durationSec ? formatDuration(song.recording.durationSec) : null, song.key, inSetlist.has(song.id) ? t('picker.alreadyIn') : null, extra]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </label>
      <IconButton label={t('picker.preview', { title: song.title })} icon={<Play size={18} />} onClick={() => play(song)} />
      <IconButton label={`${t('picker.add', { count: 1 })}: ${song.title}`} icon={<Plus size={20} />} onClick={() => add([song.id])} />
    </li>
  );

  return (
    <div className={styles.picker}>
      {rehearsal && (
        <Tabs
          label={t('picker.title')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'suggest', label: t('picker.tabSuggest') },
            { value: 'all', label: t('picker.tabAll') },
          ]}
        />
      )}
      <label className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input type="search" placeholder={t('songs:search')} aria-label={t('songs:search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {tags.length > 0 && (
        <div className={styles.tools}>
          {tags.map((tag) => (
            <Chip key={tag.id} pressed={tagIds.includes(tag.id)} onClick={() => setTagIds((ids) => (ids.includes(tag.id) ? ids.filter((x) => x !== tag.id) : [...ids, tag.id]))}>
              {tag.name}
            </Chip>
          ))}
        </div>
      )}
      <p className={styles.meta}>
        {t('picker.into')}: <strong>{targetLabel}</strong>
      </p>
      {tab === 'suggest' ? (
        <>
          <ul className={styles.pickList}>
            {suggested.slice(0, limit).map(({ song, played: p }) =>
              row(
                song,
                p ? t('picker.lastPlayed', { ago: formatAgo(`${p.date}T12:00:00Z`), event: occurrenceTitle(p.occurrence, t, members) }) : t('picker.never'),
              ),
            )}
          </ul>
          {suggested.length > limit && (
            <Button variant="ghost" onClick={() => setLimit((l) => l + 10)}>
              {t('picker.more')}
            </Button>
          )}
        </>
      ) : (
        <>
          <ul className={styles.pickList}>
            {active.map((s) => row(s))}
            {showArchived && archived.map((s) => row(s))}
          </ul>
          {archived.length > 0 && !showArchived && (
            <Button variant="ghost" onClick={() => setShowArchived(true)}>
              {t('picker.showArchived', { count: archived.length })}
            </Button>
          )}
        </>
      )}
      <Button variant="primary" disabled={selected.length === 0} onClick={() => add(selected)}>
        {t('picker.add', { count: selected.length })}
      </Button>
    </div>
  );
}
