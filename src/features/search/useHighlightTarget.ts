import { useEffect } from 'react';
import { normalizeText } from '@/core/search/normalize';
import styles from './Search.module.css';

/** Scrolls to and briefly highlights an element (search result targets, F8 §3.4). */
export function flashElement(el: Element | null) {
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove(styles.highlightTarget!);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(styles.highlightTarget!);
  return true;
}

/** `again` (e.g. the location key): highlight once more when it changes, even for the same element. */
export function useHighlightElement(id: string | null, ready: boolean, again?: string) {
  useEffect(() => {
    if (!id || !ready) return;
    const timer = setTimeout(() => flashElement(document.getElementById(id)), 150);
    return () => clearTimeout(timer);
  }, [id, ready, again]);
}

/** Finds the element inside `root` whose text contains `text` (lyrics line) and highlights it. */
export function useHighlightText(root: HTMLElement | null, text: string | null, ready: boolean) {
  useEffect(() => {
    if (!root || !text || !ready) return;
    const wanted = normalizeText(text).slice(0, 40);
    if (!wanted) return;
    const timer = setTimeout(() => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (normalizeText(node.textContent ?? '').includes(wanted)) {
          flashElement(node.parentElement);
          return;
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [root, text, ready]);
}
