import { contrast, mix, oklchToRgb, parseHex, rgbToOklch, toHex, type Rgb } from './color';

/** Neutral default band color "Messing" (design system §3.2) – used until a band sets its own. */
export const DEFAULT_BAND_COLOR = '#C9A13B';

/** Suggestions in the band color picker. */
export const BAND_COLOR_SUGGESTIONS = [
  '#C9A13B', // Messing
  '#E30613', // Signalrot
  '#F2711C', // Orange
  '#2FA84F', // Grün
  '#12A4A4', // Petrol
  '#2D7FF9', // Blau
  '#5B5BD6', // Indigo
  '#9B51E0', // Violett
  '#D6336C', // Magenta
  '#8C6D4F', // Holz
  '#6B7A8F', // Stahl
  '#1F1F24', // Schwarz
] as const;

export interface AccentTokens {
  accent: string;
  hover: string;
  soft: string;
  onAccent: string;
  focus: string;
}

export interface BandTheme {
  light: AccentTokens;
  dark: AccentTokens;
  /** True if the color had to be changed noticeably for readability (shown in the picker). */
  adjusted: boolean;
}

const WHITE: Rgb = [1, 1, 1];
const INK: Rgb = parseHex('#16161A')!;
const LIGHT_SURFACE: Rgb = WHITE;
const DARK_SURFACE: Rgb = parseHex('#18181B')!;
const MIN_TEXT_CONTRAST = 4.5;

function adjustForSurface(base: Rgb, surface: Rgb, direction: -1 | 1): Rgb {
  const [startL, C, H] = rgbToOklch(base);
  let L = startL;
  let rgb = base;
  for (let i = 0; i < 50 && contrast(rgb, surface) < MIN_TEXT_CONTRAST; i++) {
    L = Math.min(0.98, Math.max(0.05, L + direction * 0.02));
    rgb = oklchToRgb([L, C, H]);
  }
  return rgb;
}

function shift(rgb: Rgb, deltaL: number): Rgb {
  const [L, C, H] = rgbToOklch(rgb);
  return oklchToRgb([Math.min(0.98, Math.max(0.05, L + deltaL)), C, H]);
}

function onColor(rgb: Rgb): Rgb {
  return contrast(WHITE, rgb) >= contrast(INK, rgb) ? WHITE : INK;
}

/**
 * Derives accent tokens for both themes from one band color, keeping WCAG AA contrast
 * for accent-colored text on surfaces and for text on accent buttons.
 */
export function deriveBandTheme(hex: string): BandTheme {
  const base = parseHex(hex) ?? parseHex(DEFAULT_BAND_COLOR)!;

  const light = adjustForSurface(base, LIGHT_SURFACE, -1);
  const dark = adjustForSurface(base, DARK_SURFACE, 1);

  const distance = (a: Rgb) => Math.abs(rgbToOklch(a)[0] - rgbToOklch(base)[0]);
  const adjusted = distance(light) > 0.08 && distance(dark) > 0.08;

  return {
    light: {
      accent: toHex(light),
      hover: toHex(shift(light, -0.06)),
      soft: toHex(mix(light, LIGHT_SURFACE, 0.88)),
      onAccent: toHex(onColor(light)),
      focus: toHex(light),
    },
    dark: {
      accent: toHex(dark),
      hover: toHex(shift(dark, 0.06)),
      soft: toHex(mix(dark, DARK_SURFACE, 0.82)),
      onAccent: toHex(onColor(dark)),
      focus: toHex(shift(dark, 0.06)),
    },
    adjusted,
  };
}

const STYLE_ID = 'band-theme';

/** Applies the band color to the whole app by overriding the accent tokens. */
export function applyBandTheme(hex: string | null): void {
  const existing = document.getElementById(STYLE_ID);
  if (!hex) {
    existing?.remove();
    return;
  }
  const theme = deriveBandTheme(hex);
  const block = (t: AccentTokens) =>
    `--accent:${t.accent};--accent-hover:${t.hover};--accent-soft:${t.soft};--on-accent:${t.onAccent};--focus-ring:${t.focus};`;
  const css = `:root,[data-theme='light']{${block(theme.light)}}[data-theme='dark']{${block(theme.dark)}}`;
  const style = existing ?? Object.assign(document.createElement('style'), { id: STYLE_ID });
  style.textContent = css;
  if (!existing) document.head.appendChild(style);
}
