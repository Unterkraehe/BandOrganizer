// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CalendarEvent, EventException } from './model';
import { buildRrule, occurrencesOf, seriesDates, withRrule } from './recurrence';
import { fromLocal, toLocal } from './time';

const base = (patch: Partial<CalendarEvent>): CalendarEvent =>
  ({
    id: 'e_1',
    schemaVersion: 1,
    type: 'rehearsal',
    title: null,
    allDay: false,
    start: fromLocal('2026-10-01', '19:00'),
    end: fromLocal('2026-10-01', '22:00'),
    meetingTime: null,
    location: null,
    description: null,
    recurrence: null,
    answersEnabled: true,
    setlistId: null,
    memberId: null,
    status: 'active',
    cancelledAt: null,
    cancelledBy: null,
    createdAt: '',
    createdBy: 'm',
    updatedAt: '',
    updatedBy: 'm',
    ...patch,
  }) as CalendarEvent;

describe('time helpers', () => {
  it('converts Berlin wall time incl. daylight saving', () => {
    expect(fromLocal('2026-10-01', '19:00')).toBe('2026-10-01T19:00:00+02:00');
    expect(fromLocal('2026-11-05', '19:00')).toBe('2026-11-05T19:00:00+01:00');
    expect(toLocal('2026-11-05T19:00:00+01:00')).toEqual({ date: '2026-11-05', time: '19:00' });
  });
});

describe('recurrence (F5 §5)', () => {
  it('weekly rehearsal keeps 19:00 across the DST change', () => {
    const event = base({ recurrence: withRrule({ freq: 'weekly', interval: 1 }, '2026-10-01') });
    const occ = occurrencesOf(event, [], '2026-10-01', '2026-11-05');
    expect(occ.map((o) => o.key)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05']);
    expect(occ.map((o) => toLocal(o.start).time)).toEqual(Array(6).fill('19:00'));
    expect(occ[5]!.start).toBe('2026-11-05T19:00:00+01:00');
    expect(event.recurrence!.rrule).toBe('FREQ=WEEKLY;BYDAY=TH');
  });

  it('every 2 weeks, several weekdays, until / count', () => {
    const r = withRrule({ freq: 'weekly', interval: 2, byDay: ['MO', 'TH'], until: '2026-10-31' }, '2026-10-01');
    expect(seriesDates('2026-10-01', r, '2026-12-31')).toEqual(['2026-10-01', '2026-10-12', '2026-10-15', '2026-10-26', '2026-10-29']);
    expect(seriesDates('2026-10-01', { ...r, until: null, count: 3 }, '2026-12-31')).toHaveLength(3);
    expect(buildRrule({ freq: 'weekly', interval: 2, byDay: ['MO', 'TH'], count: 3 }, '2026-10-01')).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=3');
  });

  it('monthly on the 1st Thursday and on a day of the month', () => {
    const r = withRrule({ freq: 'monthly', interval: 1, monthly: 'weekday' }, '2026-10-01');
    expect(seriesDates('2026-10-01', r, '2027-01-31')).toEqual(['2026-10-01', '2026-11-05', '2026-12-03', '2027-01-07']);
    expect(r.rrule).toBe('FREQ=MONTHLY;BYDAY=1TH');
    expect(seriesDates('2026-01-31', withRrule({ freq: 'monthly', interval: 1, monthly: 'day' }, '2026-01-31'), '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
  });

  it('applies cancelled and moved occurrences', () => {
    const event = base({ recurrence: withRrule({ freq: 'weekly', interval: 1 }, '2026-10-01') });
    const ex: EventException[] = [
      { schemaVersion: 1, eventId: 'e_1', occurrenceDate: '2026-10-08', cancelled: true, override: {}, updatedAt: '', updatedBy: 'm' },
      { schemaVersion: 1, eventId: 'e_1', occurrenceDate: '2026-10-15', cancelled: false, override: { start: fromLocal('2026-10-16', '20:00'), end: fromLocal('2026-10-16', '23:00') }, updatedAt: '', updatedBy: 'm' },
    ];
    const occ = occurrencesOf(event, ex, '2026-10-01', '2026-10-20');
    expect(occ.find((o) => o.key === '2026-10-08')?.cancelled).toBe(true);
    expect(occ.find((o) => o.key === '2026-10-15')).toMatchObject({ startDate: '2026-10-16', changed: true });
  });

  it('multi-day absences and single events', () => {
    const absence = base({ type: 'absence', allDay: true, start: '2026-10-12', end: '2026-10-19', memberId: 'm_t' });
    expect(occurrencesOf(absence, [], '2026-10-15', '2026-10-15')).toHaveLength(1);
    expect(occurrencesOf(absence, [], '2026-10-20', '2026-10-30')).toHaveLength(0);
  });
});
