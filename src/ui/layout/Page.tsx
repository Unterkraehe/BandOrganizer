import type { ReactNode } from 'react';
import styles from './Page.module.css';

interface PageProps {
  title: string;
  /** Visually hide the title (e.g. start screen with its own header); it stays for screen readers. */
  hideTitle?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

/** Standard screen frame: sticky top bar with the screen title (F3 §4.4) + content column. */
export function Page({ title, hideTitle, actions, children }: PageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.topBar} data-hidden-title={hideTitle || undefined}>
        <div className={styles.topBarInner}>
          <h1 className={hideTitle ? 'visually-hidden' : styles.title}>{title}</h1>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
