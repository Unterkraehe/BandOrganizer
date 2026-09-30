import { MoreVertical } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Menu.module.css';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

const GAP = 4;
const EDGE = 8;

/**
 * "⋯" menu (F4 row menu, note actions). Closes on selection, outside tap and Escape.
 * The menu is rendered at the top level of the page (portal) with fixed positioning: rows, lists
 * and headings can never cover or clip it (v0.13.1). It follows its button while the page scrolls.
 */
export function Menu({ label, items, icon }: { label: string; items: MenuItem[] | (() => MenuItem[]); icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const placeRef = useRef<() => void>(() => undefined);
  // A function is only evaluated while the menu is open: long lists don't build hundreds of menus (performance).
  const lazy = typeof items === 'function';
  const visible = !lazy || open ? (typeof items === 'function' ? items() : items).filter((item) => !item.hidden) : [];

  // Place the menu next to its button, always fully on screen (below if it fits, otherwise above).
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const button = trigger.current?.getBoundingClientRect();
      const el = menu.current;
      if (!button || !el) return;
      const vw = window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      let top = button.bottom + GAP;
      if (top + height > vh - EDGE) top = button.top - GAP - height >= EDGE ? button.top - GAP - height : Math.max(EDGE, vh - EDGE - height);
      let left = button.right - width; // right-aligned to the button …
      if (left < EDGE) left = button.left; // … or left-aligned when there is no room
      left = Math.min(Math.max(EDGE, left), vw - EDGE - width);
      setPosition({ top, left, maxHeight: vh - 2 * EDGE });
    };
    place();
    placeRef.current = place;
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (trigger.current?.contains(target) || menu.current?.contains(target));
    const onDown = (event: PointerEvent) => {
      if (!inside(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    // the page scrolls (also momentum scrolling that was still running): the menu follows its
    // button; only when the button leaves the screen, the menu closes
    const onScroll = (event: Event) => {
      if (inside(event.target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) setOpen(false);
      else placeRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && position) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open, position]);

  if (!lazy && visible.length === 0) return null;
  return (
    <div className={styles.wrap}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {icon ?? <MoreVertical size={20} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className={styles.menu}
            role="menu"
            id={menuId}
            aria-label={label}
            // invisible for the first measurement, so it never flashes at a wrong place
            style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
