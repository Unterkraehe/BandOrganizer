import type { CSSProperties } from 'react';
import { formatDuration } from '@/core/i18n/format';
import styles from './SeekBar.module.css';

interface SeekBarProps {
  label: string;
  position: number;
  duration: number;
  disabled?: boolean;
  onSeek: (seconds: number) => void;
}

/** Seek slider with elapsed / remaining time (F4 §4.2). Keyboard: arrows = 5 s steps. */
export function SeekBar({ label, position, duration, disabled, onSeek }: SeekBarProps) {
  const max = duration > 0 ? duration : 1;
  const percent = Math.min(100, (position / max) * 100);
  return (
    <div className={styles.seek}>
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
      <div className={styles.times}>
        <span>{formatDuration(position)}</span>
        <span>{duration > 0 ? `-${formatDuration(Math.max(0, duration - position))}` : '–:–'}</span>
      </div>
    </div>
  );
}
