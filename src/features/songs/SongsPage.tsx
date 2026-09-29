import { AudioLines, Loader2, Music, Pause, Play, Plus, RefreshCw, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { kindOf } from '@/core/uploads/validate';
import { formatDuration } from '@/core/i18n/format';
import { matchesQuery } from '@/core/search/normalize';
import { Button, Chip, EmptyState, IconButton, Menu, Page, SegmentedControl } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { recordingName, sortSongs, type Recording, type Song, type SongSort, type Tag } from './model';
import { SongFolders } from './SongFolders';
import { useSetlistMode } from '@/features/setlists/SetlistModeProvider';
import { SetlistModeView } from '@/features/setlists/SetlistModeView';
import { useEffect } from 'react';
import { TagDialog } from './TagDialog';
import { usePlaySong } from './usePlaySong';
import { useSongActions } from './useSongActions';
import styles from './Songs.module.css';

const SORT_KEY = 'bandapp.songs.sort';
const VIEW_KEY = 'bandapp.songs.view';
type View = 'list' | 'folders';

/** Song list (F4 §4.1): search, sort, "Neu" and tag filters, archive at the end. */
export function SongsPage() {
  const { t } = useTranslation('songs');
  const { store, state, songs, tags } = useLibrary();
  const { play, isCurrent, state: player } = usePlaySong();
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
  const [showHidden, setShowHidden] = useState(false);
  const [tagSong, setTagSong] = useState<Song | null>(null);
  const [sort, setSortState] = useState<SongSort>(() => (localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'az'));
  const menuFor = useSongActions(setTagSong);
  const setlistMode = useSetlistMode();
  const setlistParam = params.get('setlist');
  useEffect(() => {
    if (setlistParam && setlistMode.setlist?.id !== setlistParam) setlistMode.start(setlistParam);
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

  const { active, archived, hidden } = useMemo(() => {
    const matches = (song: Song) =>
      (!onlyNew || song.isNew) &&
      selectedTags.every((id) => song.tagIds.includes(id)) &&
      matchesQuery(`${song.searchText} ${song.tagIds.map((id) => tagById.get(id)?.name ?? '').join(' ')}`, deferredQuery);
    const filtered = songs.filter(matches);
    return {
      active: sortSongs(filtered.filter((s) => !s.archived && !s.hidden), sort),
      archived: sortSongs(filtered.filter((s) => s.archived && !s.hidden), sort),
      hidden: sortSongs(songs.filter((s) => s.hidden), 'az'),
    };
  }, [songs, onlyNew, selectedTags, deferredQuery, sort, tagById]);

  const scanning = state.status === 'scanning';
  if (setlistParam) {
    return (
      <Page title={t('title')}>
        <SetlistModeView />
      </Page>
    );
  }
  const firstScan = scanning && state.files.length === 0;
  const filtering = Boolean(deferredQuery.trim()) || onlyNew || selectedTags.length > 0;

  const row = (song: Song, recording?: Recording) => {
    const version = recording && song.recording && recording.id !== song.recording.id ? recordingName(recording) : null;
    const current = recording ? player.track?.id === recording.id : isCurrent(song);
    return (
      <SongRow
        key={recording ? `${song.id}-${recording.id}` : song.id}
        song={song}
        version={version}
        tags={song.tagIds.map((id) => tagById.get(id)).filter((tag): tag is Tag => Boolean(tag))}
        current={current}
        playing={current && (player.status === 'playing' || player.status === 'loading')}
        onPlay={() => play(song, recording ?? song.recording)}
        menu={<Menu label={t('menu', { title: song.title })} items={menuFor(song)} />}
      />
    );
  };

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
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate('/songs/new')}>
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
          <Chip pressed={onlyNew} onClick={() => setOnlyNew((v) => !v)}>
            {t('filter.new')}
          </Chip>
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
        {usedTags.length > 0 && (
          <div className={styles.tagFilters} role="group" aria-label={t('tagsFilter')}>
            {usedTags.map((tag) => (
              <Chip key={tag.id} pressed={selectedTags.includes(tag.id)} onClick={() => toggleTag(tag.id)}>
                {tag.name}
              </Chip>
            ))}
          </div>
        )}
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

      {scanning && (
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
              <SongFolders songs={active.filter((s) => s.recording)} filtering={filtering} renderEntry={(song, recording) => row(song, recording)} />
            ) : (
              <ul className={styles.list}>{active.map((song) => row(song))}</ul>
            )}
          </div>

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
                  <ul className={`${styles.list} ${styles.muted}`}>{archived.map((song) => row(song))}</ul>
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
                  <ul className={`${styles.list} ${styles.muted}`}>{hidden.map((song) => row(song))}</ul>
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

interface SongRowProps {
  song: Song;
  /** shown in the folder view when the row is not the Band-Version */
  version?: string | null;
  tags: Tag[];
  current: boolean;
  playing: boolean;
  onPlay: () => void;
  menu: ReactNode;
}

function SongRow({ song, version, tags, current, playing, onPlay, menu }: SongRowProps) {
  const { t } = useTranslation('songs');
  const duration = song.recording?.durationSec;
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
    <li className={styles.row} data-current={current || undefined} data-missing={song.missing || undefined}>
      <IconButton
        className={styles.play}
        label={playing ? t('pause', { title: song.title }) : t('play', { title: song.title })}
        icon={playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        onClick={onPlay}
        disabled={song.missing || !song.recording}
      />
      <Link to={`/songs/${song.id}`} className={styles.rowLink}>
        <span className={styles.rowTitle}>
          {current && <AudioLines size={16} className={styles.nowIcon} aria-hidden="true" />}
          {song.title}
          {version && <span className={styles.versionTag}>· {version}</span>}
          {song.isNew && <span className={styles.badge}>{t('newBadge')}</span>}
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
      {menu}
    </li>
  );
}
