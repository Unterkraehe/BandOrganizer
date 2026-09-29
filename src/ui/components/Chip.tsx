import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import styles from './Chip.module.css';

/**
 * Toggle chip for filters (aria-pressed). With `tone` (e.g. an event type) the chip is filled with
 * that color while active – matching the colors used in the calendar.
 */
export function Chip({
  pressed,
  className,
  tone,
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean; tone?: 'gig' | 'rehearsal' | 'absence' | 'other' }) {
  const toned = tone ? ({ '--chip-color': `var(--event-${tone})`, '--chip-on': `var(--event-${tone}-on)`, ...style } as CSSProperties) : style;
  return (
    <button type="button" aria-pressed={pressed} data-tone={tone} className={[styles.chip, className].filter(Boolean).join(' ')} style={toned} {...rest}>
      {children}
    </button>
  );
}
