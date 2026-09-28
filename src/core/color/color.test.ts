// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BAND_COLOR_SUGGESTIONS, deriveBandTheme } from './bandTheme';
import { contrast, oklchToRgb, parseHex, rgbToOklch, toHex } from './color';

describe('color', () => {
  it('parses and formats hex', () => {
    expect(toHex(parseHex('#e30613')!)).toBe('#E30613');
    expect(toHex(parseHex('fff')!)).toBe('#FFFFFF');
    expect(parseHex('red')).toBeNull();
  });

  it('round-trips through OKLCH', () => {
    const rgb = parseHex('#E30613')!;
    expect(toHex(oklchToRgb(rgbToOklch(rgb)))).toBe('#E30613');
  });

  it('computes WCAG contrast', () => {
    expect(contrast(parseHex('#000')!, parseHex('#fff')!)).toBeCloseTo(21, 0);
  });
});

describe('band theme (design system §3.2)', () => {
  it('keeps Overload red in light mode and lightens it slightly for dark mode', () => {
    const theme = deriveBandTheme('#E30613');
    expect(theme.light.accent).toBe('#E30613');
    expect(theme.light.onAccent).toBe('#FFFFFF');
    expect(theme.dark.accent).not.toBe('#E30613');
    expect(contrast(parseHex(theme.dark.accent)!, parseHex('#18181B')!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BAND_COLOR_SUGGESTIONS)('%s is readable in both themes', (hex) => {
    const theme = deriveBandTheme(hex);
    expect(contrast(parseHex(theme.light.accent)!, parseHex('#FFFFFF')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseHex(theme.dark.accent)!, parseHex('#18181B')!)).toBeGreaterThanOrEqual(4.5);
    for (const t of [theme.light, theme.dark]) {
      expect(contrast(parseHex(t.onAccent)!, parseHex(t.accent)!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
