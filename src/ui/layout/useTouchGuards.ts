import { useEffect } from 'react';

/**
 * Phone behaviour that CSS/meta tags alone can't guarantee:
 * - iOS Safari ignores `user-scalable=no`; pinch zoom is stopped via its gesture events.
 * - Keyboard: `--kb-inset` (space taken by the on-screen keyboard) + `data-keyboard` on <html>,
 *   so the bottom bar can step aside and the chat input stays right above the keyboard.
 */
export function useTouchGuards() {
  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    document.addEventListener('gesturestart', block);
    document.addEventListener('gesturechange', block);

    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      if (!vv) return;
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      // small differences are browser bars, not a keyboard
      const open = inset > 120;
      root.style.setProperty('--kb-inset', open ? `${inset}px` : '0px');
      if (open) root.setAttribute('data-keyboard', '');
      else root.removeAttribute('data-keyboard');
    };
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    update();
    return () => {
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('gesturechange', block);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      root.removeAttribute('data-keyboard');
      root.style.removeProperty('--kb-inset');
    };
  }, []);
}
