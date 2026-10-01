import styles from './Tabs.module.css';

interface Tab<T extends string> {
  value: T;
  label: string;
  /** shown after the label in a slot of fixed width, so tabs don't move when the number appears */
  count?: number;
}

/** Simple tabs (song detail sections). */
export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Tab<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className={styles.tabs} data-scroll-x role="tablist" aria-label={label}>
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
          {tab.count !== undefined && (
            <span className={styles.count} aria-hidden={!tab.count}>
              {tab.count ? `(${tab.count})` : ''}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
