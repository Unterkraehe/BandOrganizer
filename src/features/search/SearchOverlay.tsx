import { useTranslation } from 'react-i18next';
import { SearchPanel } from './SearchPanel';
import { useSearch } from './SearchProvider';
import styles from './Search.module.css';

/** Tablet/desktop: search above the current screen, Esc closes (F8 §3.1). */
export function SearchOverlay() {
  const { t } = useTranslation('search');
  const { overlayOpen, close, initialQuery } = useSearch();
  if (!overlayOpen) return null;
  return (
    <div className={styles.backdrop} onClick={close} data-no-print>
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('placeholder')} onClick={(e) => e.stopPropagation()}>
        <SearchPanel initialQuery={initialQuery} onNavigate={close} onClose={close} />
      </div>
    </div>
  );
}
