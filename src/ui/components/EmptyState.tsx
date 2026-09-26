import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}

/** Empty, not-found and error states (R-UX-03): say what's going on and what to do. */
export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon} aria-hidden="true">{icon}</div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{text}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
