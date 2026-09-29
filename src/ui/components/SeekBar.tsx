import type { CSSProperties } from 'react';
import { formatDuration } from '@/core/i18n/format';
import styles from './SeekBar.module.css';

interface SeekBarProps {
  label: string;
  position: number;
  duration: number;
  disabled?: boolean;
  onSeek: (seconds: number) => void;
  /** Positions of time-marked notes (F4 §4.2) */
  markers?: number[];
  /** A–B loop range (F4 §6.9) */
  loop?: { start: number; end: number; enabled: boolean } | null;
}

/** Seek slider with elapsed / remaining time (F4 §4.2). Keyboard: arrows = 5 s steps. */
export function SeekBar({ label, position, duration, disabled, onSeek, markers = [], loop }: SeekBarProps) {
  const max = duration > 0 ? duration : 1;
  const percent = Math.min(100, (position / max) * 100);
  return (
    <div className={styles.seek}>
      <div className={styles.trackWrap}>
        {duration > 0 && loop && (
          <span
            className={styles.loop}
            data-enabled={loop.enabled || undefined}
            style={{ left: `${(loop.start / duration) * 100}%`, width: `${((loop.end - loop.start) / duration) * 100}%` }}
            aria-hidden="true"
          />
        )}
        {duration > 0 &&
          markers
            .filter((m) => m >= 0 && m <= duration)
            .map((m) => <span key={m} className={styles.marker} style={{ left: `${(m / duration) * 100}%` }} aria-hidden="true" />)}
      <input
        type="range"
        className={styles.range}
        min={0}
        max={max}
        step={1}
        value={Math.min(position, max)}
        disabled={disabled || duration <= 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={`${formatDuration(position)} / ${formatDuration(duration)}`}
        style={{ '--progress': `${percent}%` } as CSSProperties}
      />
      </div>
      <div className={styles.times}>
        <span>{formatDuration(position)}</span>
        <span>{duration > 0 ? `-${formatDuration(Math.max(0, duration - position))}` : '–:–'}</span>
      </div>
    </div>
  );
}
