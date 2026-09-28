import '@testing-library/jest-dom/vitest';
import '@/core/i18n';

// jsdom has no matchMedia
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom can't play media: minimal stand-ins so the audio engine works in UI tests
if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = function play() {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function pause() {
    this.dispatchEvent(new Event('pause'));
  };
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
}
