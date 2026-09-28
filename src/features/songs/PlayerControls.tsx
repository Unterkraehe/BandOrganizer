import { Loader2, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '@/core/audio/PlayerProvider';
import { IconButton, SeekBar } from '@/ui';
import type { Song } from './model';
import { usePlaySong } from './usePlaySong';
import styles from './SongDetail.module.css';

/** Big player for the song detail (F4 §4.2). Controls the global engine. */
export function PlayerControls({ song }: { song: Song }) {
  const { t } = useTranslation('songs');
  const { engine } = usePlayer();
  const { play, isCurrent, state } = usePlaySong();
  const current = isCurrent(song);
  const status = current ? state.status : 'idle';
  const playing = status === 'playing';
  const loading = status === 'loading';
  const duration = current ? state.duration : (song.durationSec ?? 0);

  const message =
    current && state.error === 'load'
      ? t('player.loadError')
      : current && state.error === 'decode'
        ? t('player.decodeError')
        : current && state.error === 'blocked'
          ? t('player.blocked')
          : null;

  return (
    <div className={styles.player}>
      <SeekBar
        label={t('player.position')}
        position={current ? state.position : 0}
        duration={duration}
        disabled={!current}
        onSeek={(seconds) => engine.seek(seconds)}
      />
      <div className={styles.transport}>
        <IconButton label={t('player.back10')} icon={<RotateCcw size={24} />} onClick={() => engine.skip(-10)} disabled={!current} />
        <button
          type="button"
          className={styles.bigPlay}
          aria-label={playing ? t('player.pause') : loading ? t('player.loading') : t('player.play')}
          onClick={() => play(song)}
        >
          {loading ? (
            <Loader2 size={32} className={styles.spin} />
          ) : playing ? (
            <Pause size={32} fill="currentColor" />
          ) : (
            <Play size={32} fill="currentColor" className={styles.playIcon} />
          )}
        </button>
        <IconButton label={t('player.forward10')} icon={<RotateCw size={24} />} onClick={() => engine.skip(10)} disabled={!current} />
      </div>
      {message && (
        <p className={styles.message} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
