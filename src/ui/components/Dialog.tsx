import { X } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import styles from './ConfirmDialog.module.css';

/** Modal panel for small tasks (tag picker, rename). Bottom sheet on phones. */
export function Dialog({ open, title, closeLabel, onClose, children, fullScreenOnPhone }: { open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode; fullScreenOnPhone?: boolean }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Rendered at the top level of the page: inside a sticky/positioned parent (e.g. the chat input bar)
  // the dialog would otherwise be painted BELOW the bottom bar.
  return createPortal(
    <div className={fullScreenOnPhone ? `${styles.backdrop} ${styles.fullBackdrop}` : styles.backdrop} onClick={onClose}>
      <div className={fullScreenOnPhone ? `${styles.dialog} ${styles.full}` : styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <IconButton label={closeLabel} icon={<X size={20} />} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
