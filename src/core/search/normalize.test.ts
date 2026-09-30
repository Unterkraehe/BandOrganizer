// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeText } from './normalize';

describe('normalize (F8 §5)', () => {
  it('treats umlaut spellings alike', () => {
    expect(normalizeText('Grüße')).toBe(normalizeText('Gruesse'));
    expect(normalizeText('Grüße')).toBe(normalizeText('GRUSSE'));
    expect(normalizeText('Café-Tour!')).toBe('cafe tour');
  });

  it('matches all words in any order', () => {
    expect(matchesQuery('Rust and Thunder', 'thund rust')).toBe(true);
    expect(matchesQuery('Rust and Thunder', 'rust fire')).toBe(false);
    expect(matchesQuery('Anything', '  ')).toBe(true);
  });
});

describe('generous matching (v0.12.3)', () => {
  it('apostrophes and separators', async () => {
    const { matchesQuery } = await import('./normalize');
    expect(matchesQuery("Don't stop me now", 'dont')).toBe(true);
    expect(matchesQuery("Don't stop me now", "don't stop")).toBe(true);
    expect(matchesQuery('Sweet child o’mine', 'omine')).toBe(true);
    expect(matchesQuery('AC/DC – Back in Black', 'acdc')).toBe(true);
    expect(matchesQuery("Guns'n Roses", 'gunsn')).toBe(true);
  });
});
