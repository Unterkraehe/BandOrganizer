import { Loader2, Pause, Play, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { usePlayer } from '@/core/audio/PlayerProvider';
import { formatDuration } from '@/core/i18n/format';
import { IconButton } from '@/ui';
import { practiceSummary } from './practice/summary';
import { useSetlistMode } from '@/features/setlists/SetlistModeProvider';
import styles from './MiniPlayer.module.css';

/** Persistent mini player (F3 §3, R-UX-08). Hidden on the detail page of the playing song. */
export function MiniPlayer() {
  const { t } = useTranslation('songs');
  const { engine, state } = usePlayer();
  const setlistMode = useSetlistMode();
  const { pathname } = useLocation();
  const track = state.track;
  // track.id is the recording; links go to the song (since M3a)
  const songPath = track ? `/songs/${track.songId ?? track.id}` : '';
  if (!track || pathname === songPath || pathname === `${songPath}/practice`) return null;

  const playing = state.status === 'playing';
  const loading = state.status === 'loading';
  const progress = state.duration > 0 ? (state.position / state.duration) * 100 : 0;
  const summary = practiceSummary(state, t);
  const status = loading
    ? t('player.loading')
    : state.duration > 0
      ? `${formatDuration(state.position)} / ${formatDuration(state.duration)}${summary ? ` · ${summary}` : ''}`
      : (track.subtitle ?? '');

  const inQueue = setlistMode.setlist ? setlistMode.queue.findIndex((q) => q.song?.id === track.songId) : -1;
  return (
    <div className={styles.mini} role="region" aria-label={t('player.nowPlaying')}>
      <div className={styles.progress} style={{ width: `${progress}%` }} aria-hidden="true" />
      <Link to={songPath} className={styles.info} aria-label={`${t('player.open')}: ${track.title}`}>
        <span className={styles.title}>{track.title}</span>
        <span className={styles.status}>
          {inQueue >= 0 ? `${t('setlists:mode.position', { n: setlistMode.index + 1, total: setlistMode.queue.length })} · ` : ''}
          {status}
        </span>
      </Link>
      <IconButton
        className={styles.button}
        label={playing ? t('player.pause') : t('player.play')}
        icon={
          loading ? (
            <Loader2 size={22} className={styles.spin} />
          ) : playing ? (
            <Pause size={22} fill="currentColor" />
          ) : (
            <Play size={22} fill="currentColor" />
          )
        }
        onClick={() => {
          engine.unlock();
          engine.toggle();
        }}
      />
      {inQueue >= 0 && <IconButton className={styles.button} label={t('setlists:mode.next')} icon={<SkipForward size={20} />} onClick={setlistMode.next} />}
    </div>
  );
}
