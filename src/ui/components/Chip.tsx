import type { ButtonHTMLAttributes } from 'react';
import styles from './Chip.module.css';

/** Toggle chip for filters (aria-pressed). */
export function Chip({ pressed, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button type="button" aria-pressed={pressed} className={[styles.chip, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}
