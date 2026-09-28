import styles from './Tabs.module.css';

interface Tab<T extends string> {
  value: T;
  label: string;
}

/** Simple tabs (song detail sections). */
export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Tab<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className={styles.tab}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
