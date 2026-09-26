import type { ReactNode } from 'react';
import styles from './Toast.module.css';

/** Floating message at the bottom (above the bottom bar on phones). */
export function Toast({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.message}>{message}</span>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
