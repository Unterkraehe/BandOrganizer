import { describe, expect, it } from 'vitest';
import i18n from '@/core/i18n';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import type { CalendarEvent } from '@/features/calendar/model';
import type { PushDevice } from './push';
import { buildUpload, computeReminders, defaultSettings, describeOffsets, normalizeSettings, readAllSettings, readSettings, writeSettings, type ReminderSettings } from './reminders';

const t = i18n.t.bind(i18n);
const members = [
  { id: 'm_lisa', displayName: 'Lisa', active: true },
  { id: 'm_tom', displayName: 'Tom', active: true },
  { id: 'm_old', displayName: 'Ex', active: false },
] as never;
// Wed 2026-10-07 12:00 Berlin (UTC+2)
const NOW = Date.parse('2026-10-07T12:00:00+02:00');

const event = (patch: Partial<CalendarEvent>): CalendarEvent =>
  ({
    id: 'e_1',
    type: 'gig',
    title: 'Stadtfest',
    allDay: false,
    start: '2026-10-10T20:00:00+02:00',
    end: '2026-10-10T23:00:00+02:00',
    meetingTime: null,
    location: { name: 'Marktplatz' },
    description: null,
    recurrence: null,
    answersEnabled: true,
    setlistId: null,
    memberId: null,
    status: 'active',
    cancelledAt: null,
    cancelledBy: null,
    schemaVersion: 1,
    createdAt: '',
    createdBy: 'm_lisa',
    updatedAt: '',
    updatedBy: 'm_lisa',
    deletedAt: null,
    deletedBy: null,
    ...patch,
  }) as CalendarEvent;

const settings = (entries: [string, Partial<ReminderSettings>][] = []) =>
  new Map(entries.map(([id, s]) => [id, { ...defaultSettings(id), ...s }]));

const run = (events: CalendarEvent[], extra: Partial<Parameters<typeof computeReminders>[0]> = {}) =>
  computeReminders({ events, exceptions: {}, answers: {}, members, settings: settings(), now: NOW, t, ...extra });

const times = (jobs: { at: number }[] | undefined) => (jobs ?? []).map((j) => new Date(j.at).toISOString());

describe('reminders before events (F6 §4.7)', () => {
  it('uses the defaults per type for every active member: gig = 1 day + 3 h before', () => {
    const jobs = run([event({})]);
    expect([...jobs.keys()]).toEqual(['m_lisa', 'm_tom']); // not the former member
    expect(times(jobs.get('m_lisa'))).toEqual(['2026-10-09T18:00:00.000Z', '2026-10-10T15:00:00.000Z']);
    expect(jobs.get('m_lisa')![0]!.payload).toEqual({
      title: 'Auftritt: Stadtfest',
      body: expect.stringMatching(/^Sa\.?, 10\. Okt\.? · 20:00 · Marktplatz$/),
      url: 'calendar/e_1',
      tag: 'reminder-e_1-1440',
    });
  });

  it('counts from the meeting time, all-day events from 9:00; no title → type only', () => {
    const jobs = run([
      event({ meetingTime: '2026-10-10T18:30:00+02:00' }),
      event({ id: 'e_2', type: 'other', title: null, allDay: true, start: '2026-10-12', end: '2026-10-12', location: null }),
    ], { settings: settings([['m_lisa', { defaults: { gig: [60], rehearsal: [], other: [1440] } }]]) });
    expect(times(jobs.get('m_lisa'))).toEqual(['2026-10-10T15:30:00.000Z', '2026-10-11T07:00:00.000Z']);
    expect(jobs.get('m_lisa')![0]!.payload.body).toContain('Treffpunkt 18:30');
    expect(jobs.get('m_lisa')![1]!.payload.title).toBe('Sonstiges');
  });

  it('per-event setting wins over the default; [] = no reminder', () => {
    const own = settings([
      ['m_lisa', { events: { e_1: [30] } }],
      ['m_tom', { events: { e_1: [] } }],
    ]);
    const jobs = run([event({})], { settings: own });
    expect(times(jobs.get('m_lisa'))).toEqual(['2026-10-10T17:30:00.000Z']);
    expect(jobs.has('m_tom')).toBe(false);
  });

  it('skips cancelled dates, "Nein", own absences, past reminders and anything after 8 weeks', () => {
    const absence = event({ id: 'e_abs', type: 'absence', title: null, allDay: true, start: '2026-10-09', end: '2026-10-11', memberId: 'm_tom' });
    const jobs = run(
      [
        event({}),
        event({ id: 'e_c', status: 'cancelled' }),
        event({ id: 'e_soon', start: '2026-10-07T14:00:00+02:00', end: '2026-10-07T16:00:00+02:00' }), // 1 day before is past, 3 h before too
        event({ id: 'e_far', start: '2026-12-31T20:00:00+01:00', end: '2026-12-31T23:00:00+01:00' }),
        absence,
      ],
      { answers: { e_1: [{ memberId: 'm_lisa', status: 'no' } as never] } },
    );
    expect(jobs.has('m_lisa')).toBe(false);
    expect(jobs.has('m_tom')).toBe(false); // away on the 10th
  });

  it('series: one setting for all dates, each date its own reminder', () => {
    const series = event({
      id: 'e_s',
      type: 'rehearsal',
      title: null,
      start: '2026-10-08T19:00:00+02:00',
      end: '2026-10-08T22:00:00+02:00',
      recurrence: { freq: 'weekly', interval: 1, rrule: 'FREQ=WEEKLY', until: '2026-10-22' },
    });
    const jobs = run([series]);
    expect(times(jobs.get('m_lisa'))).toEqual(['2026-10-08T15:00:00.000Z', '2026-10-15T15:00:00.000Z', '2026-10-22T15:00:00.000Z']);
    expect(jobs.get('m_lisa')![1]!.payload).toMatchObject({ title: 'Probe', url: 'calendar/e_s/2026-10-15' });
  });

  it('only members with a device that wants reminders are uploaded', () => {
    const device = (memberId: string, prefs: PushDevice['prefs']) => ({ memberId, endpoint: `https://fcm.googleapis.com/${memberId}`, keys: { p256dh: 'p', auth: 'a' }, prefs, active: true }) as PushDevice;
    const upload = buildUpload(run([event({})]), [device('m_lisa', { chat: true }), device('m_tom', { reminders: false })]);
    expect(Object.keys(upload.members)).toEqual(['m_lisa']);
    expect(upload.members.m_lisa!.subscriptions).toEqual([{ endpoint: 'https://fcm.googleapis.com/m_lisa', keys: { p256dh: 'p', auth: 'a' } }]);
  });

  it('describes the choice in plain German', () => {
    expect(describeOffsets([180, 1440], t)).toBe('1 Tag und 3 Std. vorher');
    expect(describeOffsets([10080, 30, 120], t)).toBe('1 Woche, 2 Std. und 30 Min. vorher');
    expect(describeOffsets([], t)).toBe('Keine Erinnerung');
  });

  it('stores one file per member, tolerant of unknown values', async () => {
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const APP = '/h/_BandApp';
    const storage = new SafeStorage(provider, { appRoot: APP });
    expect((await readSettings(storage, APP, 'm_lisa')).value).toEqual(defaultSettings('m_lisa'));
    const saved = await writeSettings(storage, APP, { ...defaultSettings('m_lisa'), defaults: { gig: [60], rehearsal: [], other: [] } }, undefined);
    expect((await readSettings(storage, APP, 'm_lisa')).value.defaults.gig).toEqual([60]);
    await expect(writeSettings(storage, APP, saved.value, 'stale-version')).rejects.toThrow();
    const all = await readAllSettings(storage, APP, ['m_lisa', 'm_tom']);
    expect(all.get('m_lisa')!.defaults.gig).toEqual([60]);
    expect(all.get('m_tom')!.defaults.gig).toEqual([1440, 180]);
    expect(normalizeSettings({ defaults: { gig: [7, 60, 60] } } as never, 'x').defaults).toEqual({ gig: [60], rehearsal: [120], other: [] });
  });
});
