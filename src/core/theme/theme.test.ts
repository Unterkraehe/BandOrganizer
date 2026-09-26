import { describe, expect, it } from 'vitest';
import { readThemePreference, resolveTheme, THEME_STORAGE_KEY, writeThemePreference } from './theme';

describe('theme', () => {
  it('defaults to system and resolves it from the device setting', () => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    expect(readThemePreference()).toBe('system');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('persists the preference and ignores invalid values', () => {
    writeThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readThemePreference()).toBe('system');
  });
});
