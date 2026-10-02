import { ListMusic, SkipBack, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { IconButton } from '@/ui';
import { useSetlistMode } from './SetlistModeProvider';
import styles from './Setlists.module.css';

/** "3 / 12 · Nächster: X" with ◀ ▶ – song detail and practice view in setlist mode (F3 §5). */
export function SetlistModeBar({ songId }: { songId: string }) {
  const { t } = useTranslation('setlists');
  const mode = useSetlistMode();
  if (!mode.setlist) return null;
  const index = mode.queue.findIndex((q, i) => q.song?.id === songId && i >= mode.index) >= 0
    ? mode.queue.findIndex((q, i) => q.song?.id === songId && i >= mode.index)
    : mode.queue.findIndex((q) => q.song?.id === songId);
  if (index < 0) return null;
  const next = mode.queue.slice(index + 1).find((q) => q.playable);
  return (
    <div className={styles.bar}>
      <ListMusic size={16} aria-hidden="true" />
      <Link to="/player?view=queue">{mode.setlist.name}</Link>
      <strong>{t('mode.position', { n: index + 1, total: mode.queue.length })}</strong>
      {next?.song && (
        <span>
          · {t('mode.nextSong', { title: next.song.title })}
          {mode.queue[index]?.entry.segueToNext ? ` (${t('mode.segueNext')})` : ''}
        </span>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex' }}>
        <IconButton label={t('mode.previous')} icon={<SkipBack size={18} />} onClick={mode.previous} disabled={!mode.hasPrevious} />
        <IconButton label={t('mode.next')} icon={<SkipForward size={18} />} onClick={mode.next} disabled={!mode.hasNext} />
      </span>
    </div>
  );
}
