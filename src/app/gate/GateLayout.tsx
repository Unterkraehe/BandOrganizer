import type { ReactNode } from 'react';
import styles from './Gate.module.css';

/** Full-screen frame for the screens before the app shell (welcome, setup, profile choice). */
export function GateLayout({ title, lead, wide, children }: { title: string; lead?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <main className={styles.gate}>
      <div className={wide ? `${styles.column} ${styles.wide}` : styles.column}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
        </header>
        {children}
      </div>
    </main>
  );
}
