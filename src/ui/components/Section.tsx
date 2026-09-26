import type { ReactNode } from 'react';
import styles from './Section.module.css';

/** A titled group of content, e.g. a settings section. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        {hint && <div className={styles.rowHint}>{hint}</div>}
      </div>
      {children && <div className={styles.rowControl}>{children}</div>}
    </div>
  );
}
