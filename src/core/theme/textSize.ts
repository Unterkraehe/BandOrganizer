/**
 * Text size (v0.12 accessibility): pinch zoom is disabled for an app-like feel, so people who
 * need larger text get it here. Scales the root font size; all text sizes are in rem.
 */
export type TextSize = 'normal' | 'large' | 'xlarge';
export const TEXT_SIZE_KEY = 'bandapp.textSize';
const PERCENT: Record<TextSize, number> = { normal: 100, large: 115, xlarge: 130 };

export function readTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY);
    if (v === 'large' || v === 'xlarge' || v === 'normal') return v;
  } catch {
    // ignore
  }
  return 'normal';
}

export function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = size === 'normal' ? '' : `${PERCENT[size]}%`;
}

export function writeTextSize(size: TextSize) {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    // ignore
  }
  applyTextSize(size);
}
