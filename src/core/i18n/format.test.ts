// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dayKey, formatDate, formatDuration, formatMinutes, formatRelativeDay, formatTime, localHour } from './format';

describe('formatters (R-I18N-03)', () => {
  it('formats in Europe/Berlin', () => {
    // 22:30 UTC on 10 Oct = 00:30 on 11 Oct in Berlin (summer time)
    const late = '2026-10-10T22:30:00Z';
    expect(dayKey(late)).toBe('2026-10-11');
    expect(formatTime(late)).toBe('00:30');
    expect(localHour(late)).toBe(0);
    expect(formatDate('2026-10-10T12:00:00Z')).toMatch(/Sa.*10.*Okt/);
  });

  it('handles daylight saving time', () => {
    expect(formatTime('2026-07-01T17:00:00Z')).toBe('19:00');
    expect(formatTime('2026-12-01T18:00:00Z')).toBe('19:00');
  });

  it('formats relative days', () => {
    const now = '2026-09-24T10:00:00Z';
    expect(formatRelativeDay('2026-09-24T20:00:00Z', now)).toBe('Heute');
    expect(formatRelativeDay('2026-09-25T08:00:00Z', now)).toBe('Morgen');
    expect(formatRelativeDay('2026-09-23T08:00:00Z', now)).toBe('Gestern');
    expect(formatRelativeDay('2026-10-10T12:00:00Z', now)).toMatch(/Okt/);
  });

  it('formats durations', () => {
    expect(formatDuration(241.3)).toBe('4:01');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(Number.NaN)).toBe('–:–');
    expect(formatMinutes(48)).toMatch(/^48\sMin\.$/);
  });
});
