import { Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Page } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { PlayerControls } from './PlayerControls';
import styles from './SongDetail.module.css';

const sizeFormat = new Intl.NumberFormat('de-DE', { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 });

/** Song detail (F4 §4.2) – M2: player and file info. Lyrics, notes, versions follow in M3. */
export function SongDetailPage() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const navigate = useNavigate();
  const { songs, state } = useLibrary();
  const song = songs.find((s) => s.id === songId);

  if (!song) {
    if (state.status === 'scanning' && state.files.length === 0) return <Page title={t('title')}>{null}</Page>;
    return (
      <Page title={t('title')}>
        <EmptyState
          icon={<Music size={28} />}
          title={t('notFound')}
          text=""
          action={<Button onClick={() => navigate('/songs')}>{t('toList')}</Button>}
        />
      </Page>
    );
  }

  return (
    <Page title={song.title}>
      <PlayerControls song={song} />
      <dl className={styles.info}>
        <div>
          <dt>{t('folder')}</dt>
          <dd>{song.folder || t('rootFolder')}</dd>
        </div>
        <div>
          <dt>{t('file')}</dt>
          <dd>{song.fileName}</dd>
        </div>
        {song.size !== undefined && (
          <div>
            <dt>{t('size')}</dt>
            <dd>{sizeFormat.format(song.size / 1_000_000)}</dd>
          </div>
        )}
      </dl>
    </Page>
  );
}
