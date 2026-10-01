import { Loader2, Pause, Play, RotateCcw, RotateCw, SlidersHorizontal, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { practiceSummary } from './practice/summary';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '@/core/audio/PlayerProvider';
import { Button, IconButton, SeekBar } from '@/ui';
import { recordingName, type Recording, type Song } from './model';
import { usePlaySong } from './usePlaySong';
import styles from './SongDetail.module.css';

interface PlayerControlsProps {
  song: Song;
  /** chosen version (defaults to the Band-Version) */
  recording: Recording;
  onRecordingChange: (recording: Recording) => void;
  markers: number[];
}

/** Big player for the song detail (F4 §4.2) incl. version selector (F4 §6.8). */
export function PlayerControls({ song, recording, onRecordingChange, markers }: PlayerControlsProps) {
  const { t } = useTranslation('songs');
  const { play, engine } = usePlaySong();
  const { state } = usePlayer();
  const navigate = useNavigate();
  const current = state.track?.id === recording.id && state.track?.songId === song.id;
  const status = current ? state.status : 'idle';
  const playing = status === 'playing';
  const loading = status === 'loading';
  const duration = current ? state.duration : (recording.durationSec ?? 0);
  const available = song.recordings.filter((r) => !r.missing);

  const message =
    recording.missing
      ? t('missingFile')
      : current && state.error === 'load'
        ? t('player.loadError')
        : current && state.error === 'decode'
          ? t('player.decodeError')
          : current && state.error === 'blocked'
            ? t('player.blocked')
            : null;

  return (
    <div className={styles.player}>
      {available.length > 1 && (
        <label className={styles.versionSelect}>
          <span>{t('versions.select')}</span>
          <select
            value={recording.id}
            onChange={(event) => {
              const next = available.find((r) => r.id === event.target.value);
              if (next) {
                onRecordingChange(next);
                play(song, next);
              }
            }}
          >
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {recordingName(r)}
                {r.id === song.recording?.id ? ` ★ ${t('versions.band')}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {song.recording && recording.id !== song.recording.id && (
        <p className={styles.notBand}>
          <Star size={16} aria-hidden="true" />
          {t('versions.notBand')}
          <Button
            variant="ghost"
            onClick={() => {
              if (!song.recording) return;
              onRecordingChange(song.recording);
              play(song, song.recording);
            }}
          >
            {t('versions.toBand')}
          </Button>
        </p>
      )}
      <SeekBar
        label={t('player.position')}
        position={current ? state.position : 0}
        duration={duration}
        disabled={!current}
        onSeek={(seconds) => engine.seek(seconds)}
        markers={markers}
        loop={current ? state.loop : null}
      />
      <div className={styles.transport}>
        <IconButton label={t('player.back10')} icon={<RotateCcw size={24} />} onClick={() => engine.skip(-10)} disabled={!current} />
        <button
          type="button"
          className={styles.bigPlay}
          aria-label={playing ? t('player.pause') : loading ? t('player.loading') : t('player.play')}
          onClick={() => (current ? (engine.unlock(), engine.toggle()) : play(song, recording))}
          disabled={recording.missing}
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
      {/* Always present, hidden while everything is original: the "Übungsansicht" button below must not move (v0.11) */}
      {(() => {
        const summary = current ? practiceSummary(state, t) : '';
        return (
          <p className={styles.notBand} style={{ justifyContent: 'center', color: 'var(--accent)', minHeight: 'var(--touch)', visibility: summary ? 'visible' : 'hidden' }} aria-hidden={!summary}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {summary || '\u00a0'}
            <Button
              variant="ghost"
              disabled={!summary}
              tabIndex={summary ? 0 : -1}
              onClick={() => {
                engine.setEffects({ tempo: 1, semitones: 0 });
                engine.setLoop(null);
              }}
            >
              {t('practice.reset')}
            </Button>
          </p>
        );
      })()}
      <Button icon={<SlidersHorizontal size={18} />} onClick={() => navigate(`/player?song=${song.id}&view=practice`)} style={{ justifySelf: 'center' }}>
        {t('practice.open')}
      </Button>
      {message && (
        <p className={styles.message} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
