import { MoreVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './Menu.module.css';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** "⋯" menu (F4 row menu, note actions). Closes on selection, outside click and Escape. */
export function Menu({ label, items, icon }: { label: string; items: MenuItem[]; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const visible = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;
  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open && ref.current) {
            // Open upwards when the menu would end up behind the bottom bar / mini player
            const rect = ref.current.getBoundingClientRect();
            const reserved = 150;
            setUp(window.innerHeight - rect.bottom - reserved < visible.length * 48 + 16 && rect.top > visible.length * 48 + 16);
          }
          setOpen((v) => !v);
        }}
      >
        {icon ?? <MoreVertical size={20} />}
      </button>
      {open && (
        <div className={up ? `${styles.menu} ${styles.up}` : styles.menu} role="menu" id={menuId}>
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? `${styles.item} ${styles.danger}` : styles.item}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
