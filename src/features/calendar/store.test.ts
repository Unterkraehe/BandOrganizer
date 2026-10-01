// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onSystemEvent, type SystemEvent } from '@/core/events';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { summarize, needsReview } from './answers';
import { buildIcs } from './ics';
import { withRrule } from './recurrence';
import { CalendarStore, type EventInput } from './store';
import { addDays, fromLocal, todayLocal, toLocal } from './time';

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

describe('calendar subscription (F5 §6.5b, v0.19.1: via the token helper)', () => {
  /** stands in for the token helper: secret → .ics */
  function testFeed() {
    const files = new Map<string, string>();
    let puts = 0;
    return {
      files,
      puts: () => puts,
      put: async (secret: string, ics: string) => void (puts++, files.set(secret, ics)),
      remove: async (secret: string) => void files.delete(secret),
      url: (secret: string) => `https://helper.example/calendar/${secret}.ics`,
    };
  }

  it('publishes the calendar at a secret address, keeps it current, renews and ends it', async () => {
    const { createSubscription, endSubscription, readSubscription, updateFeed, bandIcs, isLegacy } = await import('./subscription');
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const storage = new SafeStorage(provider, { appRoot: APP });
    const store = new CalendarStore({ storage, appRoot: APP, memberId: () => 'm_lisa', cacheKey: null });
    await store.load();
    const labels = { title: () => 'Probe', cancelledPrefix: 'Abgesagt: ' };
    const ics = () => bandIcs(store.getState(), labels, 'Overload');
    const feed = testFeed();

    const sub = await createSubscription(storage, APP, feed, ics(), 'm_lisa', null);
    expect(sub.secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(sub.url).toBe(`https://helper.example/calendar/${sub.secret}.ics`);
    expect(await readSubscription(storage, APP)).toMatchObject({ active: true, secret: sub.secret, url: sub.url });
    expect(isLegacy(sub)).toBe(false);
    expect(feed.files.get(sub.secret!)).toContain('X-WR-CALNAME:Overload');

    await store.create({ type: 'rehearsal', title: null, allDay: false, start: fromLocal('2026-10-01', '19:00'), end: fromLocal('2026-10-01', '22:00'), meetingTime: null, location: null, description: null, recurrence: null, answersEnabled: true, memberId: null });
    expect(await updateFeed(feed, sub.secret!, ics(), 'feed')).toBe(true);
    expect(feed.files.get(sub.secret!)).toContain('DTSTART;TZID=Europe/Berlin:20261001T190000');
    // (the "unchanged → no upload" cache needs localStorage – not available in this node test)

    const renewed = await createSubscription(storage, APP, feed, ics(), 'm_lisa', sub);
    expect(feed.files.has(sub.secret!)).toBe(false); // old address is dead
    expect(feed.files.get(renewed.secret!)).toContain('BEGIN:VEVENT');

    await endSubscription(storage, APP, feed, renewed, 'm_lisa');
    expect(await readSubscription(storage, APP)).toBeNull();
    expect(feed.files.size).toBe(0);
  });

  it('recognises an old HiDrive share-link subscription and removes that link when a new one is made', async () => {
    const { createSubscription, readSubscription, isLegacy } = await import('./subscription');
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const storage = new SafeStorage(provider, { appRoot: APP });
    await storage.writeText(`${APP}/calendar/export/band.ics`, 'BEGIN:VCALENDAR');
    const link = await storage.createShareLink(`${APP}/calendar/export/band.ics`);
    await storage.writeJson(`${APP}/calendar/export/subscription.json`, { schemaVersion: 1, active: true, shareId: link.id, url: link.url, createdAt: '', createdBy: 'm_tom' });

    const old = await readSubscription(storage, APP);
    expect(isLegacy(old)).toBe(true);
    const fresh = await createSubscription(storage, APP, testFeed(), 'BEGIN:VCALENDAR', 'm_lisa', old);
    expect(await provider.sharedFile(link.url)).toBeNull();
    expect(isLegacy(fresh)).toBe(false);
  });
});

describe('optimistic updates (v0.12.5)', () => {
  it('shows an answer immediately and rolls it back if saving fails', async () => {
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const storage = new SafeStorage(provider, { appRoot: APP });
    const store = new CalendarStore({ storage, appRoot: APP, memberId: () => 'm_lisa', cacheKey: null });
    await store.load();
    await store.create({ type: 'rehearsal', title: null, allDay: false, start: fromLocal('2026-10-01', '19:00'), end: fromLocal('2026-10-01', '22:00'), meetingTime: null, location: null, description: null, recurrence: null, answersEnabled: true, memberId: null });
    const occ = store.occurrences('2026-10-01', '2026-10-01')[0]!;

    let release: (() => void) | undefined;
    const original = provider.writeText.bind(provider);
    provider.writeText = (...args) => new Promise((resolve, reject) => (release = () => original(...args).then(resolve, reject)));
    const pending = store.answer(occ, 'yes', null);
    expect(store.answersFor(occ).map((a) => a.status)).toEqual(['yes']); // before the write finished
    while (!release) await new Promise((r) => setTimeout(r, 1));
    release();
    await pending;

    provider.writeText = () => Promise.reject(new Error('offline'));
    await expect(store.answer(occ, 'no', null)).rejects.toThrow('offline');
    expect(store.answersFor(occ).map((a) => a.status)).toEqual(['yes']); // rolled back
  });
});

describe('seeing other members\' changes while the app is open (v0.14.3)', () => {
  const day = (offset: number) => addDays(todayLocal(), offset);
  const input = (date: string, recurring = false): EventInput => ({
    type: 'rehearsal',
    title: 'Probe',
    allDay: false,
    start: fromLocal(date, '19:00'),
    end: fromLocal(date, '22:00'),
    meetingTime: null,
    location: null,
    description: null,
    recurrence: recurring ? withRrule({ freq: 'weekly', interval: 1 }, date) : null,
    answersEnabled: true,
    memberId: null,
  });

  async function twoMembers() {
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const storage = new SafeStorage(provider, { appRoot: APP });
    const lisa = new CalendarStore({ storage, appRoot: APP, memberId: () => 'm_lisa', cacheKey: null });
    const tom = new CalendarStore({ storage, appRoot: APP, memberId: () => 'm_tom', cacheKey: null });
    await lisa.load();
    await tom.load();
    return { storage, lisa, tom };
  }

  it('picks up new and changed events, reading only those files', async () => {
    const { storage, lisa, tom } = await twoMembers();
    await lisa.create(input(day(3)));
    await lisa.create(input(day(5)));
    await tom.refresh();
    expect(tom.upcoming(10).map((o) => o.event.id)).toEqual(lisa.upcoming(10).map((o) => o.event.id));

    const reads = vi.spyOn(storage, 'readJson');
    await tom.refresh();
    expect(reads).not.toHaveBeenCalled(); // nothing changed → nothing read

    const first = lisa.upcoming(1)[0]!;
    await lisa.answer(first, 'yes', null);
    await lisa.update(first, { ...input(day(3)), title: 'Generalprobe' }, 'all');
    await tom.refresh();
    expect(tom.upcoming(1)[0]!.title).toBe('Generalprobe');
    expect(reads.mock.calls.filter(([path]) => String(path).includes('/events/'))).toHaveLength(1);
    expect(tom.getState().answers[first.event.id]).toEqual([expect.objectContaining({ memberId: 'm_lisa', status: 'yes' })]);
  });

  it('picks up a cancelled date of a series and keeps your own unsaved event', async () => {
    const { lisa, tom } = await twoMembers();
    await lisa.create(input(day(2), true));
    await tom.refresh();
    await lisa.cancel(lisa.upcoming(3)[1]!, 'this', true);

    const saving = tom.create(input(day(4))); // Tom's own event, not saved yet
    await tom.refresh();
    expect(tom.upcoming(4).filter((o) => o.cancelled)).toHaveLength(1);
    expect(tom.upcoming(10).some((o) => o.event.title === 'Probe' && !o.event.recurrence)).toBe(true);
    await saving;
  });

  it('announces a new event in the chat (+ push), not an absence', async () => {
    const { lisa } = await twoMembers();
    const events: SystemEvent[] = [];
    const off = onSystemEvent((e) => events.push(e));
    await lisa.create(input(day(3)));
    await lisa.create({ ...input(day(4)), type: 'absence', allDay: true, start: day(4), end: day(4), memberId: 'm_lisa' });
    off();
    expect(events).toEqual([expect.objectContaining({ key: 'event.created', params: expect.objectContaining({ actor: 'm_lisa', title: 'Probe' }) })]);
  });
});
