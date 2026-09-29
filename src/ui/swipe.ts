import { useEffect, type RefObject } from 'react';

/**
 * Horizontal swipe detection for touch screens (tab switching, month switching).
 * Deliberately conservative so it never fights scrolling, sliders, text fields or system gestures.
 */

export interface SwipeOptions {
  /** minimum horizontal distance in px */
  distance?: number;
  /** horizontal movement must exceed vertical movement by this factor */
  ratio?: number;
  /** ignore gestures starting this close to the screen edges (system back gesture) */
  edge?: number;
  maxMs?: number;
}

const BLOCKING = 'input, textarea, select, [contenteditable="true"], [data-no-swipe], canvas, [role="slider"], [role="dialog"], [role="menu"], video, audio';

/** True if the element (or a parent) scrolls horizontally or should own horizontal gestures. */
export function ownsHorizontalGestures(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  if (el?.closest(BLOCKING)) return true;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

/** Calls `onSwipe('left' | 'right')` – 'left' means the finger moved to the left. */
export function useSwipe(
  ref: RefObject<HTMLElement | null> | null,
  onSwipe: (direction: 'left' | 'right') => void,
  enabled = true,
  { distance = 72, ratio = 1.8, edge = 24, maxMs = 700 }: SwipeOptions = {},
) {
  useEffect(() => {
    const el = ref?.current ?? document.body;
    if (!enabled) return;
    let start: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || ownsHorizontalGestures(e.target)) {
        start = null;
        return;
      }
      const touch = e.touches[0]!;
      const width = window.innerWidth;
      if (touch.clientX < edge || touch.clientX > width - edge) {
        start = null;
        return;
      }
      start = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.changedTouches[0];
      const s = start;
      start = null;
      if (!touch || Date.now() - s.t > maxMs) return;
      // selecting text is not a swipe
      if (window.getSelection()?.toString()) return;
      const dx = touch.clientX - s.x;
      const dy = touch.clientY - s.y;
      if (Math.abs(dx) >= distance && Math.abs(dx) >= Math.abs(dy) * ratio) onSwipe(dx < 0 ? 'left' : 'right');
    };
    const onCancel = () => {
      start = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [ref, onSwipe, enabled, distance, ratio, edge, maxMs]);
}
