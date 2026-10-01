import { Loader2, Music, Pause, Play, Plus, RefreshCw, Search } from 'lucide-react';
import { memo, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { kindOf } from '@/core/uploads/validate';
import { formatDuration } from '@/core/i18n/format';
import { normalizeText, searchHaystack } from '@/core/search/normalize';
import { Button, Chip, EmptyState, IconButton, Menu, Page, SegmentedControl, VirtualList, type MenuItem } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { recordingName, sortSongs, type Recording, type Song, type SongSort, type Tag } from './model';
import { SongFolders } from './SongFolders';
import { useSetlistMode } from '@/features/setlists/SetlistModeProvider';
import { useEffect } from 'react';
import { TagDialog } from './TagDialog';
import { usePlaySong } from './usePlaySong';
import { useSongActions } from './useSongActions';
import styles from './Songs.module.css';

const SORT_KEY = 'bandapp.songs.sort';
const VIEW_KEY = 'bandapp.songs.view';
const SUGGESTED_KEY = 'bandapp.songs.showSuggested';
type View = 'list' | 'folders';

/** Song list (F4 §4.1): search, sort, "Neu" and tag filters, archive at the end. */
export function SongsPage() {
  const { t } = useTranslation('songs');
  const { store, state, songs, tags } = useLibrary();
  const { play, state: player } = usePlaySong();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === 'folders' ? 'folders' : 'list'));
  const [dragging, setDragging] = useState(false);
  const setView = (value: View) => {
    setViewState(value);
    localStorage.setItem(VIEW_KEY, value);
  };
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [onlyNew, setOnlyNew] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  // member suggestions: an own section, collapsed by default, remembered per device (v0.13.2)
  const [showSuggested, setShowSuggestedState] = useState(() => localStorage.getItem(SUGGESTED_KEY) === '1');
  const setShowSuggested = (value: boolean) => {
    setShowSuggestedState(value);
    localStorage.setItem(SUGGESTED_KEY, value ? '1' : '0');
  };
  const [showHidden, setShowHidden] = useState(false);
  const [tagSong, setTagSong] = useState<Song | null>(null);
  const [sort, setSortState] = useState<SongSort>(() => (localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'az'));
  const menuFor = useSongActions(setTagSong);
  const setlistMode = useSetlistMode();
  const setlistParam = params.get('setlist');
  // old links "/songs?setlist=…" (before v0.16.0): the setlist now plays in the player – the Songs tab stays the song list
  useEffect(() => {
    if (!setlistParam) return;
    if (setlistMode.setlist?.id !== setlistParam) setlistMode.start(setlistParam);
    navigate('/player?view=queue', { replace: true });
  }, [setlistParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTags = params.getAll('tag');
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const usedTags = useMemo(() => tags.filter((tag) => songs.some((s) => !s.hidden && s.tagIds.includes(tag.id))), [tags, songs]);

  const setSort = (value: SongSort) => {
    setSortState(value);
    try {
      localStorage.setItem(SORT_KEY, value);
    } catch {
      // ignore
    }
  };

  const toggleTag = (tagId: string) => {
    const next = new URLSearchParams(params);
    next.delete('tag');
    const set = selectedTags.includes(tagId) ? selectedTags.filter((id) => id !== tagId) : [...selectedTags, tagId];
    set.forEach((id) => next.append('tag', id));
    setParams(next, { replace: true });
  };

  // Normalized once per data change, not on every keystroke (typing stays fast with hundreds of songs).
  const haystacks = useMemo(
    () => new Map(songs.map((s) => [s.id, searchHaystack(`${s.searchText} ${s.tagIds.map((id) => tagById.get(id)?.name ?? '').join(' ')}`)])),
    [songs, tagById],
  );

  const { active, suggested, archived, hidden } = useMemo(() => {
    const words = normalizeText(deferredQuery).split(' ').filter(Boolean);
    const matches = (song: Song) =>
      (!onlyNew || song.isNew) &&
      selectedTags.every((id) => song.tagIds.includes(id)) &&
      (words.length === 0 || words.every((w) => haystacks.get(song.id)?.includes(w)));
    const filtered = songs.filter(matches);
    return {
      active: sortSongs(filtered.filter((s) => !s.archived && !s.hidden && !s.suggested), sort),
      suggested: sortSongs(filtered.filter((s) => !s.archived && !s.hidden && s.suggested), sort),
      archived: sortSongs(filtered.filter((s) => s.archived && !s.hidden), sort),
      hidden: sortSongs(songs.filter((s) => s.hidden), 'az'),
    };
  }, [songs, onlyNew, selectedTags, deferredQuery, sort, haystacks]);

  const scanning = state.status === 'scanning';
  const firstScan = scanning && state.files.length === 0;
  const filtering = Boolean(deferredQuery.trim()) || onlyNew || selectedTags.length > 0;

  // Rows are memoized: only the row whose playing state changed re-renders (all props are primitives / stable).
  const row = (song: Song, recording?: Recording) => {
    const version = recording && song.recording && recording.id !== song.recording.id ? recordingName(recording) : null;
    const current = recording ? player.track?.id === recording.id : player.track?.songId === song.id;
    return (
      <SongRow
        song={song}
        recording={recording ?? null}
        version={version}
        tagById={tagById}
        current={current}
        playing={current && (player.status === 'playing' || player.status === 'loading')}
        onPlay={play}
        menuFor={menuFor}
      />
    );
  };
  const rowKey = (song: Song) => song.id;
  const rowHeight = (song: Song) => (song.tagIds.length > 0 ? ROW_HEIGHT_TAGS : ROW_HEIGHT);

  return (
    <Page
      title={t('title')}
      actions={
        <>
          <IconButton
            label={t('rescan')}
            icon={<RefreshCw size={20} className={scanning ? styles.spin : undefined} />}
            onClick={() => void store.scan()}
            disabled={scanning}
          />
          <Button variant="primary" icon={<Plus size={18} />} iconOnlyOnPhone onClick={() => navigate('/songs/new')}>
            {t('newSong')}
          </Button>
        </>
      }
    >
      <div
        className={styles.sections}
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && kindOf(file.name) === 'audio') navigate('/songs/new', { state: { file } });
        }}
      >
      {dragging && <p className={styles.dropHint}>{t('uploads:dropAudio')}</p>}
      <div className={styles.tools}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder={t('search')}
            aria-label={t('search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
          />
        </label>
        <div className={styles.filters}>
          <SegmentedControl
            label={t('sort.label')}
            value={sort}
            onChange={setSort}
            options={[
              { value: 'az', label: t('sort.az') },
              { value: 'recent', label: t('sort.recent') },
            ]}
          />
          <SegmentedControl
            label={t('view.label')}
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: t('view.list') },
              { value: 'folders', label: t('view.folders') },
            ]}
          />
        </div>
        {/* second row: filters – "Neu" and the tags */}
        <div className={styles.tagFilters} role="group" aria-label={t('tagsFilter')}>
          <Chip pressed={onlyNew} onClick={() => setOnlyNew((v) => !v)}>
            {t('filter.new')}
          </Chip>
          {usedTags.map((tag) => (
            <Chip key={tag.id} pressed={selectedTags.includes(tag.id)} onClick={() => toggleTag(tag.id)}>
              {tag.name}
            </Chip>
          ))}
        </div>
        {filtering && (
          <div>
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                setOnlyNew(false);
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              {t('resetFilters')}
            </Button>
          </div>
        )}
      </div>

      {/* Only while there is nothing to show yet; later scans just spin the refresh icon (no banner pushing the list down) */}
      {firstScan && (
        <p className={styles.status} role="status">
          <Loader2 size={16} className={styles.spin} aria-hidden="true" />
          {t('scanning', { count: state.progress?.found ?? 0 })}
        </p>
      )}

      {state.status === 'error' && (
        <EmptyState
          icon={<Music size={28} />}
          title={t('scanError')}
          text=""
          action={<Button onClick={() => void store.scan()}>{t('retry')}</Button>}
        />
      )}

      {!firstScan && state.status !== 'error' && songs.length === 0 && !scanning && (
        <EmptyState icon={<Music size={28} />} title={t('empty.title')} text={t('empty.text')} />
      )}

      {songs.length > 0 && (
        <section aria-label={t('title')} className={styles.sections}>
          <div>
            <p className={styles.count}>{t('count', { count: active.length })}</p>
            {active.length === 0 ? (
              <p className={styles.noResults}>{t('noResults', { query })}</p>
            ) : view === 'folders' ? (
              <SongFolders songs={[...active, ...(showSuggested ? suggested : [])].filter((s) => s.recording)} filtering={filtering} renderEntry={(song, recording) => row(song, recording)} />
            ) : (
              <VirtualList className={styles.list} items={active} getKey={rowKey} estimateSize={rowHeight} renderItem={(song) => row(song)} />
            )}
          </div>

          {suggested.length > 0 && (
            <div className={styles.more}>
              <Button variant="ghost" aria-expanded={showSuggested} onClick={() => setShowSuggested(!showSuggested)}>
                {showSuggested
                  ? t('suggested.hide')
                  : filtering
                    ? t('suggested.searchHits', { count: suggested.length })
                    : t('suggested.show', { count: suggested.length })}
              </Button>
              {showSuggested && view === 'list' && (
                <>
                  <h2 className={styles.sectionTitle}>{t('suggested.title')}</h2>
                  <p className={styles.muted}>{t('suggested.hint')}</p>
                  <VirtualList className={styles.list} items={suggested} getKey={rowKey} estimateSize={rowHeight} renderItem={(song) => row(song)} />
                </>
              )}
            </div>
          )}

          {archived.length > 0 && (
            <div className={styles.more}>
              <Button variant="ghost" aria-expanded={showArchive} onClick={() => setShowArchive((v) => !v)}>
                {showArchive
                  ? t('archive.hide')
                  : filtering
                    ? t('archive.searchHits', { count: archived.length })
                    : t('archive.show', { count: archived.length })}
              </Button>
              {showArchive && (
                <>
                  <h2 className={styles.sectionTitle}>{t('archive.title')}</h2>
                  <VirtualList className={`${styles.list} ${styles.muted}`} items={archived} getKey={rowKey} estimateSize={rowHeight} renderItem={(song) => row(song)} />
                </>
              )}
            </div>
          )}

          {hidden.length > 0 && !filtering && (
            <div className={styles.more}>
              <Button variant="ghost" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? t('hidden.hide') : t('hidden.show', { count: hidden.length })}
              </Button>
              {showHidden && (
                <>
                  <h2 className={styles.sectionTitle}>{t('hidden.title')}</h2>
                  <p className={styles.muted}>{t('hidden.hint')}</p>
                  <VirtualList className={`${styles.list} ${styles.muted}`} items={hidden} getKey={rowKey} estimateSize={rowHeight} renderItem={(song) => row(song)} />
                </>
              )}
            </div>
          )}
        </section>
      )}
      </div>
      <TagDialog song={tagSong ? (songs.find((s) => s.id === tagSong.id) ?? null) : null} onClose={() => setTagSong(null)} />
    </Page>
  );
}

// Fixed row heights (single-line title and details) keep the list calm and let the virtual list estimate exactly.
const ROW_HEIGHT = 73;
const ROW_HEIGHT_TAGS = 99;

interface SongRowProps {
  song: Song;
  /** folder view: the version this row stands for */
  recording: Recording | null;
  /** shown in the folder view when the row is not the Band-Version */
  version: string | null;
  tagById: Map<string, Tag>;
  current: boolean;
  playing: boolean;
  onPlay: (song: Song, recording: Recording | null) => void;
  menuFor: (song: Song) => MenuItem[];
}

const SongRow = memo(function SongRow({ song, recording, version, tagById, current, playing, onPlay, menuFor }: SongRowProps) {
  const { t } = useTranslation('songs');
  const duration = song.recording?.durationSec;
  const tags = song.tagIds.map((id) => tagById.get(id)).filter((tag): tag is Tag => Boolean(tag));
  const meta = !song.recording
    ? t('noRecording')
    : song.missing
      ? t('missingFile')
      : [
          duration ? formatDuration(duration) : null,
          song.key,
          song.recordings.length > 1 ? t('versionsCount', { count: song.recordings.length }) : null,
          song.recording.folder || t('rootFolder'),
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <div className={styles.row} data-current={current || undefined} data-missing={song.missing || undefined}>
      <IconButton
        className={styles.play}
        label={playing ? t('pause', { title: song.title }) : t('play', { title: song.title })}
        icon={playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        onClick={() => onPlay(song, recording ?? song.recording)}
        disabled={song.missing || !song.recording}
      />
      <Link to={`/songs/${song.id}`} className={styles.rowLink}>
        <span className={styles.rowTitle}>
          <span className={styles.rowTitleText}>{song.title}</span>
          {version && <span className={styles.versionTag}>· {version}</span>}
          {song.isNew && <span className={styles.badge}>{t('newBadge')}</span>}
          {/* only in the folder view, where suggestions are mixed with the band's songs */}
          {song.suggested && recording && (
            <span className={styles.suggestedBadge} title={t('suggested.badgeHint')}>
              {t('suggested.badge')}
            </span>
          )}
        </span>
        <span className={styles.rowMeta}>{meta}</span>
        {tags.length > 0 && (
          <span className={styles.rowTags}>
            {tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className={styles.tag}>
                {tag.name}
              </span>
            ))}
            {tags.length > 3 && <span className={styles.tag}>+{tags.length - 3}</span>}
          </span>
        )}
      </Link>
      <Menu label={t('menu', { title: song.title })} items={() => menuFor(song)} />
    </div>
  );
});
