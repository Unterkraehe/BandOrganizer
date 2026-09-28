import { AudioLines, Loader2, Music, Pause, Play, RefreshCw, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDuration } from '@/core/i18n/format';
import { matchesQuery } from '@/core/search/normalize';
import { Button, Chip, EmptyState, IconButton, Page, SegmentedControl } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { sortSongs, type Song, type SongSort } from './model';
import { usePlaySong } from './usePlaySong';
import styles from './Songs.module.css';

const SORT_KEY = 'bandapp.songs.sort';

/** Song list (F4 §4.1): search, sort, "Neu" filter, play from the list. */
export function SongsPage() {
  const { t } = useTranslation('songs');
  const { store, state, songs } = useLibrary();
  const { play, isCurrent, isPlaying } = usePlaySong();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSortState] = useState<SongSort>(() => (localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'az'));

  const setSort = (value: SongSort) => {
    setSortState(value);
    try {
      localStorage.setItem(SORT_KEY, value);
    } catch {
      // ignore
    }
  };

  const visible = useMemo(() => {
    const filtered = songs.filter(
      (song) => (!onlyNew || song.isNew) && matchesQuery(`${song.title} ${song.fileName} ${song.folder}`, deferredQuery),
    );
    return sortSongs(filtered, sort);
  }, [songs, onlyNew, deferredQuery, sort]);

  const scanning = state.status === 'scanning';
  const firstScan = scanning && state.files.length === 0;

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
        <section aria-label={t('title')}>
          <p className={styles.count}>{t('count', { count: visible.length })}</p>
          {visible.length === 0 ? (
            <p className={styles.noResults}>{t('noResults', { query })}</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  current={isCurrent(song)}
                  playing={isPlaying(song)}
                  onPlay={() => play(song)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </Page>
  );
}

function SongRow({ song, current, playing, onPlay }: { song: Song; current: boolean; playing: boolean; onPlay: () => void }) {
  const { t } = useTranslation('songs');
  const meta = [song.durationSec ? formatDuration(song.durationSec) : null, song.folder || t('rootFolder')].filter(Boolean).join(' · ');
  return (
    <li className={styles.row} data-current={current || undefined}>
      <IconButton
        className={styles.play}
        label={playing ? t('pause', { title: song.title }) : t('play', { title: song.title })}
        icon={playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        onClick={onPlay}
      />
      <Link to={`/songs/${song.id}`} className={styles.rowLink}>
        <span className={styles.rowTitle}>
          {current && <AudioLines size={16} className={styles.nowIcon} aria-hidden="true" />}
          {song.title}
          {song.isNew && <span className={styles.badge}>{t('newBadge')}</span>}
        </span>
        <span className={styles.rowMeta}>{meta}</span>
      </Link>
    </li>
  );
}
