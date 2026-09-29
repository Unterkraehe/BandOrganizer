// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseDateQuery } from './dates';
import { highlight, snippet } from './highlight';

describe('date terms (F8 §5)', () => {
  const today = '2026-09-29'; // Tuesday
  it('months, days, relative words', () => {
    expect(parseDateQuery('okt', today).ranges).toEqual([{ from: '2026-10-01', to: '2026-10-31' }]);
    expect(parseDateQuery('Februar', today).ranges).toEqual([{ from: '2027-02-01', to: '2027-02-28' }]);
    expect(parseDateQuery('10.10.', today).ranges).toEqual([{ from: '2026-10-10', to: '2026-10-10' }]);
    expect(parseDateQuery('3.9.', today).ranges).toEqual([{ from: '2027-09-03', to: '2027-09-03' }]);
    expect(parseDateQuery('morgen', today).ranges).toEqual([{ from: '2026-09-30', to: '2026-09-30' }]);
    expect(parseDateQuery('nächste Woche', today).ranges).toEqual([{ from: '2026-10-05', to: '2026-10-11' }]);
    expect(parseDateQuery('Samstag', today).ranges[0]).toEqual({ from: '2026-10-03', to: '2026-10-03' });
  });
  it('keeps the other words', () => {
    expect(parseDateQuery('Probe okt', today)).toMatchObject({ rest: 'Probe' });
    expect(parseDateQuery('Stadtfest', today)).toEqual({ ranges: [], rest: 'Stadtfest' });
  });
});

describe('highlighting', () => {
  it('marks prefix matches umlaut-tolerant', () => {
    expect(highlight('Grüße aus dem Proberaum', 'gruesse probe').filter((s) => s.hit).map((s) => s.text)).toEqual(['Grüße', 'Proberaum']);
  });
  it('cuts a snippet around the hit', () => {
    const text = 'a '.repeat(80) + 'Refrain zweimal' + ' b'.repeat(80);
    expect(snippet(text, 'refrain')).toContain('Refrain');
  });
});
