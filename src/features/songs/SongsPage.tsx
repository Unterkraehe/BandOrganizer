import { AudioLines, Loader2, Music, Pause, Play, RefreshCw, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDuration } from '@/core/i18n/format';
import { matchesQuery } from '@/core/search/normalize';
import { Button, Chip, EmptyState, IconButton, Menu, Page, SegmentedControl } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { sortSongs, type Song, type SongSort, type Tag } from './model';
import { TagDialog } from './TagDialog';
import { usePlaySong } from './usePlaySong';
import { useSongActions } from './useSongActions';
import styles from './Songs.module.css';

const SORT_KEY = 'bandapp.songs.sort';

/** Song list (F4 §4.1): search, sort, "Neu" and tag filters, archive at the end. */
export function SongsPage() {
  const { t } = useTranslation('songs');
  const { store, state, songs, tags } = useLibrary();
  const { play, isCurrent, isPlaying } = usePlaySong();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [onlyNew, setOnlyNew] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [tagSong, setTagSong] = useState<Song | null>(null);
  const [sort, setSortState] = useState<SongSort>(() => (localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'az'));
  const menuFor = useSongActions(setTagSong);

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
  const firstScan = scanning && state.files.length === 0;
  const filtering = Boolean(deferredQuery.trim()) || onlyNew || selectedTags.length > 0;

  const row = (song: Song) => (
    <SongRow
      key={song.id}
      song={song}
      tags={song.tagIds.map((id) => tagById.get(id)).filter((tag): tag is Tag => Boolean(tag))}
      current={isCurrent(song)}
      playing={isPlaying(song)}
      onPlay={() => play(song)}
      menu={<Menu label={t('menu', { title: song.title })} items={menuFor(song)} />}
    />
  );

  return (
    <Page
      title={t('title')}
      actions={
        <IconButton
          label={t('rescan')}
          icon={<RefreshCw size={20} className={scanning ? styles.spin : undefined} />}
          onClick={() => void store.scan()}
          disabled={scanning}
        />
      }
    >
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
            ) : (
              <ul className={styles.list}>{active.map(row)}</ul>
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
                  <ul className={`${styles.list} ${styles.muted}`}>{archived.map(row)}</ul>
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
                  <ul className={`${styles.list} ${styles.muted}`}>{hidden.map(row)}</ul>
                </>
              )}
            </div>
          )}
        </section>
      )}
      <TagDialog song={tagSong ? (songs.find((s) => s.id === tagSong.id) ?? null) : null} onClose={() => setTagSong(null)} />
    </Page>
  );
}

interface SongRowProps {
  song: Song;
  tags: Tag[];
  current: boolean;
  playing: boolean;
  onPlay: () => void;
  menu: ReactNode;
}

function SongRow({ song, tags, current, playing, onPlay, menu }: SongRowProps) {
  const { t } = useTranslation('songs');
  const duration = song.recording.durationSec;
  const meta = song.missing
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
        disabled={song.missing}
      />
      <Link to={`/songs/${song.id}`} className={styles.rowLink}>
        <span className={styles.rowTitle}>
          {current && <AudioLines size={16} className={styles.nowIcon} aria-hidden="true" />}
          {song.title}
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
