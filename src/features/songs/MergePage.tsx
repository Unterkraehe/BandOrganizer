import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { matchesQuery } from '@/core/search/normalize';
import { ConfirmDialog, Page } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { areSimilarSongs, sortSongs, type Song } from './model';
import styles from './Songs.module.css';

/** "Als Version zu anderem Song hinzufügen" (F4 §6.8): pick the target song. */
export function MergePage() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { songs, store } = useLibrary();
  const source = songs.find((s) => s.id === songId);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Song | null>(null);

  const candidates = useMemo(() => {
    if (!source) return [];
    const list = sortSongs(
      songs.filter((s) => s.id !== source.id && !s.hidden && matchesQuery(s.searchText, query)),
      'az',
    );
    // similar titles first
    const similar = list.filter((s) => areSimilarSongs(source, s));
    return [...similar, ...list.filter((s) => !similar.includes(s))];
  }, [songs, source, query]);

  if (!source) return <Page title={t('merge.title')}>{null}</Page>;

  return (
    <Page title={t('merge.title')}>
      <p className={styles.muted} style={{ fontSize: 'var(--fs-md)' }}>
        {t('merge.lead', { title: source.title })}
      </p>
      <label className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul className={styles.list}>
        {candidates.map((song) => (
          <li key={song.id} className={styles.row}>
            <button type="button" className={styles.rowLink} style={{ border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => setTarget(song)}>
              <span className={styles.rowTitle}>{song.title}</span>
              <span className={styles.rowMeta}>{song.recording?.folder || t('rootFolder')}</span>
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        title={t('merge.confirmTitle', { source: source.title, target: target?.title ?? '' })}
        text={t('merge.confirm')}
        confirmLabel={t('merge.action')}
        cancelLabel={t('common:actions.cancel')}
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          const chosen = target;
          setTarget(null);
          if (!chosen) return;
          void store
            .mergeInto(source.id, chosen.id)
            .then(() => {
              notify({ message: t('versions.merged', { source: source.title, target: chosen.title }) });
              navigate(`/songs/${chosen.id}`, { replace: true });
            })
            .catch(() => notify({ message: t('failed') }));
        }}
      />
    </Page>
  );
}
