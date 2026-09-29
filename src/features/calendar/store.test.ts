// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { summarize, needsReview } from './answers';
import { buildIcs } from './ics';
import { withRrule } from './recurrence';
import { CalendarStore, type EventInput } from './store';
import { fromLocal, toLocal } from './time';

const APP = '/h/_BandApp';

describe('CalendarStore (F5)', () => {
  let store: CalendarStore;
  let member = 'm_lisa';
  beforeEach(async () => {
    member = 'm_lisa';
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    store = new CalendarStore({ storage: new SafeStorage(provider, { appRoot: APP }), appRoot: APP, memberId: () => member, cacheKey: null });
    await store.load();
  });

  const rehearsal = (date: string): EventInput => ({
    type: 'rehearsal',
    title: null,
    allDay: false,
    start: fromLocal(date, '19:00'),
    end: fromLocal(date, '22:00'),
    meetingTime: null,
    location: { name: 'Proberaum' },
    description: null,
    recurrence: withRrule({ freq: 'weekly', interval: 1 }, date),
    answersEnabled: true,
    memberId: null,
  });

  it('edits one occurrence, the following ones and the whole series', async () => {
    await store.create(rehearsal('2026-10-01'));
    const occ = () => store.occurrences('2026-10-01', '2026-10-31');
    const third = occ()[2]!;
    await store.update(third, { ...rehearsal('2026-10-15'), start: fromLocal('2026-10-15', '20:00'), end: fromLocal('2026-10-15', '23:00'), recurrence: third.event.recurrence }, 'this');
    expect(occ().map((o) => toLocal(o.start).time)).toEqual(['19:00', '19:00', '20:00', '19:00', '19:00']);

    const fourth = occ()[3]!;
    await store.update(fourth, { ...rehearsal('2026-10-22'), location: { name: 'Halle' } }, 'following');
    expect(occ().map((o) => o.location?.name)).toEqual(['Proberaum', 'Proberaum', 'Proberaum', 'Halle', 'Halle']);
    expect(store.getState().events).toHaveLength(2);

    await store.update(occ()[0]!, { ...rehearsal('2026-10-01'), start: fromLocal('2026-10-01', '18:30'), end: fromLocal('2026-10-01', '21:30') }, 'all');
    expect(toLocal(occ()[1]!.start).time).toBe('18:30');
  });

  it('cancels single occurrences, answers and deletes softly', async () => {
    const event = await store.create(rehearsal('2026-10-01'));
    const second = store.occurrences('2026-10-01', '2026-10-31')[1]!;
    await store.cancel(second, 'this');
    expect(store.occurrences('2026-10-01', '2026-10-31')[1]!.cancelled).toBe(true);

    const first = store.occurrences('2026-10-01', '2026-10-31')[0]!;
    await store.answer(first, 'maybe', 'kläre das');
    member = 'm_tom';
    await store.answer(first, 'yes', null);
    expect(store.answersFor(first).map((a) => a.status).sort()).toEqual(['maybe', 'yes']);

    await store.remove(event.id);
    expect(store.occurrences('2026-10-01', '2026-10-31')).toHaveLength(0);
    await store.restore(event.id);
    expect(store.occurrences('2026-10-01', '2026-10-31')).toHaveLength(5);
  });

  it('summarises answers with absences and review hints', async () => {
    await store.create(rehearsal('2026-10-01'));
    await store.create({ type: 'absence', title: null, allDay: true, start: '2026-10-07', end: '2026-10-09', meetingTime: null, location: null, description: null, recurrence: null, answersEnabled: false, memberId: 'm_tom' });
    const occs = store.occurrences('2026-10-01', '2026-10-31');
    const second = occs.find((o) => o.key === '2026-10-08')!;
    await store.answer(second, 'yes', null);
    const members = ['m_lisa', 'm_tom', 'm_max'].map((id) => ({ id, active: true, displayName: id }) as never);
    const absences = occs.filter((o) => o.type === 'absence');
    const s = summarize(second, store.answersFor(second), members, absences);
    expect([s.yes.length, s.absent.length, s.open.length]).toEqual([1, 1, 1]);
    expect(needsReview(store.answersFor(second)[0], { ...second, start: fromLocal('2026-10-08', '20:00') })).toBe(true);
  });

  it('exports iCalendar with RRULE, time zone and cancelled occurrences', async () => {
    await store.create(rehearsal('2026-10-01'));
    await store.cancel(store.occurrences('2026-10-01', '2026-10-31')[1]!, 'this');
    const state = store.getState();
    const ics = buildIcs(
      state.events.map((e) => ({ event: e.value, exceptions: (state.exceptions[e.value.id] ?? []).map((x) => x.value) })),
      { title: () => 'Probe', cancelledPrefix: 'Abgesagt: ' },
      'Overload',
    );
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TH');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261001T190000');
    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20261008T190000');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('BEGIN:VTIMEZONE');
  });
});

describe('calendar subscription (F5 §6.5b)', () => {
  it('shares band.ics, keeps it current, renews and ends the link', async () => {
    const { createSubscription, endSubscription, readSubscription, writeBandIcs, bandIcs } = await import('./subscription');
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const storage = new SafeStorage(provider, { appRoot: APP });
    const store = new CalendarStore({ storage, appRoot: APP, memberId: () => 'm_lisa', cacheKey: null });
    await store.load();
    const labels = { title: () => 'Probe', cancelledPrefix: 'Abgesagt: ' };
    const ics = () => bandIcs(store.getState(), labels, 'Overload');

    const sub = await createSubscription(storage, APP, ics(), 'm_lisa', null);
    expect(await readSubscription(storage, APP)).toMatchObject({ active: true, url: sub.url });
    expect(await provider.sharedFile(sub.url!)).toContain('X-WR-CALNAME:Overload');

    await store.create({ type: 'rehearsal', title: null, allDay: false, start: fromLocal('2026-10-01', '19:00'), end: fromLocal('2026-10-01', '22:00'), meetingTime: null, location: null, description: null, recurrence: null, answersEnabled: true, memberId: null });
    expect(await writeBandIcs(storage, APP, ics(), null)).toBe(true);
    expect(await provider.sharedFile(sub.url!)).toContain('DTSTART;TZID=Europe/Berlin:20261001T190000');

    const renewed = await createSubscription(storage, APP, ics(), 'm_lisa', sub);
    expect(await provider.sharedFile(sub.url!)).toBeNull(); // old link is dead
    expect(await provider.sharedFile(renewed.url!)).toContain('BEGIN:VEVENT');

    await endSubscription(storage, APP, renewed, 'm_lisa');
    expect(await readSubscription(storage, APP)).toBeNull();
    expect(await provider.sharedFile(renewed.url!)).toBeNull();
  });
});
