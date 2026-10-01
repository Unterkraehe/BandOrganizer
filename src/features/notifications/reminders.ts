import type { TFunction } from 'i18next';
import { formatDate, formatTime } from '@/core/i18n/format';
import { joinPath, NotFoundError, type FileEntry, type SafeStorage } from '@/core/storage';
import type { Versioned } from '@/core/band/band';
import { getAccessToken } from '@/core/auth/tokens';
import { config } from '@/config';
import type { Member } from '@/features/members/model';
import { occurrenceTitle } from '@/features/calendar/format';
import { occurrenceId, type Answer, type CalendarEvent, type EventException, type EventType, type Occurrence } from '@/features/calendar/model';
import { occurrencesOf } from '@/features/calendar/recurrence';
import { addDays, fromLocal, toLocal } from '@/features/calendar/time';
import { shorten, type PushDevice, type PushPayload } from './push';

/**
 * Reminders before calendar events (F6 §4.7). Each member chooses, for themselves, how long before
 * an event they want to be reminded: defaults per event type, changeable per event.
 *
 * The phone can't schedule a notification on its own, so the app computes every member's upcoming
 * reminders (next 8 weeks) and hands the list to the token helper; a timer there (every 5 minutes)
 * sends the due ones. Whoever's app has the newest calendar keeps the list current for everyone.
 */

/** Event types that can have reminders (absences don't). */
export type ReminderType = Exclude<EventType, 'absence'>;
export const REMINDER_TYPES: ReminderType[] = ['gig', 'rehearsal', 'other'];

/** Choices in minutes before the event. */
export const REMINDER_OFFSETS = [15, 30, 60, 120, 180, 1440, 2880, 10080] as const;

export const DEFAULT_REMINDERS: Record<ReminderType, number[]> = { gig: [1440, 180], rehearsal: [120], other: [] };

/** `_BandApp/reminders/<memberId>.json` – only the member writes their own file. */
export interface ReminderSettings {
  schemaVersion: 1;
  memberId: string;
  defaults: Record<ReminderType, number[]>;
  /** per event (a series counts as one event); [] = no reminder for this event */
  events: Record<string, number[]>;
  updatedAt: string;
}

/** How far ahead reminders are handed to the token helper. */
export const HORIZON_DAYS = 56;
/** All-day events: reminders count from 9:00 on the first day. */
const ALL_DAY_TIME = '09:00';

const dir = (appRoot: string) => joinPath(appRoot, 'reminders');
const settingsPath = (appRoot: string, memberId: string) => joinPath(dir(appRoot), `${memberId}.json`);

export const defaultSettings = (memberId: string): ReminderSettings => ({
  schemaVersion: 1,
  memberId,
  defaults: { ...DEFAULT_REMINDERS },
  events: {},
  updatedAt: '',
});

const sorted = (offsets: number[]) => [...new Set(offsets)].filter((m) => (REMINDER_OFFSETS as readonly number[]).includes(m)).sort((a, b) => b - a);

/** Tolerant read: unknown values are dropped, missing types fall back to the defaults. */
export function normalizeSettings(raw: Partial<ReminderSettings> | null | undefined, memberId: string): ReminderSettings {
  const base = defaultSettings(memberId);
  if (!raw || typeof raw !== 'object') return base;
  const defaults = { ...base.defaults };
  for (const type of REMINDER_TYPES) if (Array.isArray(raw.defaults?.[type])) defaults[type] = sorted(raw.defaults[type]);
  const events: Record<string, number[]> = {};
  for (const [id, offsets] of Object.entries(raw.events ?? {})) if (Array.isArray(offsets)) events[id] = sorted(offsets);
  return { schemaVersion: 1, memberId, defaults, events, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '' };
}

export async function readSettings(storage: SafeStorage, appRoot: string, memberId: string): Promise<Versioned<ReminderSettings>> {
  const entry = await storage.stat(settingsPath(appRoot, memberId));
  if (!entry) return { value: defaultSettings(memberId), version: undefined };
  const raw = await storage.readJson<ReminderSettings>(entry.path);
  return { value: normalizeSettings(raw, memberId), version: entry.version };
}

export async function writeSettings(storage: SafeStorage, appRoot: string, settings: ReminderSettings, expectedVersion: string | undefined): Promise<Versioned<ReminderSettings>> {
  const value = { ...settings, schemaVersion: 1 as const, updatedAt: new Date().toISOString() };
  const entry = await storage.writeJson(settingsPath(appRoot, settings.memberId), value, expectedVersion ? { expectedVersion } : undefined);
  return { value, version: entry.version };
}

/** Every member's settings (members without a file use the defaults). */
export async function readAllSettings(storage: SafeStorage, appRoot: string, memberIds: string[]): Promise<Map<string, ReminderSettings>> {
  const result = new Map<string, ReminderSettings>(memberIds.map((id) => [id, defaultSettings(id)]));
  let files: FileEntry[];
  try {
    files = await storage.list(dir(appRoot));
  } catch (error) {
    if (error instanceof NotFoundError) return result;
    throw error;
  }
  await Promise.all(
    files
      .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
      .map(async (f) => {
        const id = f.name.slice(0, -'.json'.length);
        if (!result.has(id)) return;
        const raw = await storage.readJson<ReminderSettings>(f.path).catch(() => null);
        result.set(id, normalizeSettings(raw, id));
      }),
  );
  return result;
}

/** The offsets that apply to one event for one member. */
export function offsetsFor(settings: ReminderSettings, event: Pick<CalendarEvent, 'id' | 'type'>): number[] {
  if (event.type === 'absence') return [];
  return settings.events[event.id] ?? settings.defaults[event.type];
}

/** "1 Tag", "2 Std.", "30 Min." */
export function offsetLabel(minutes: number, t: TFunction): string {
  if (minutes % 1440 === 0) return minutes === 10080 ? t('notifications:reminders.week') : t('notifications:reminders.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('notifications:reminders.hours', { count: minutes / 60 });
  return t('notifications:reminders.minutes', { count: minutes });
}

/** "1 Tag und 3 Std. vorher" / "Keine Erinnerung" */
export function describeOffsets(offsets: number[], t: TFunction): string {
  if (!offsets.length) return t('notifications:reminders.none');
  const parts = sorted(offsets).map((m) => offsetLabel(m, t));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${t('notifications:reminders.and')} ${parts.at(-1)}` : parts[0]!;
  return t('notifications:reminders.before', { list });
}

export interface ReminderJob {
  /** when to send (epoch ms) */
  at: number;
  payload: PushPayload;
}

interface ComputeInput {
  events: CalendarEvent[];
  exceptions: Record<string, EventException[]>;
  /** occurrence id → answers */
  answers: Record<string, Answer[]>;
  members: Member[];
  settings: Map<string, ReminderSettings>;
  now: number;
  t: TFunction;
}

/** The moment reminders count back from: meeting time if set, otherwise the start (all-day: 9:00). */
function referenceTime(o: Occurrence): number {
  if (o.allDay) return Date.parse(fromLocal(o.startDate, ALL_DAY_TIME));
  return Date.parse(o.meetingTime ?? o.start);
}

function payloadFor(o: Occurrence, t: TFunction, members: Member[]): PushPayload {
  // absolute date: the text is written days before it is shown, so no "Morgen"
  const when = o.allDay ? `${formatDate(`${o.startDate}T12:00:00Z`)} · ${t('calendar:allDay')}` : `${formatDate(o.start)} · ${formatTime(o.start)}`;
  const parts = [when, o.meetingTime ? t('calendar:meeting', { time: formatTime(o.meetingTime) }) : null, o.location?.name ?? null];
  return {
    title: o.title?.trim()
      ? t('notifications:reminders.pushTitle', { type: t(`calendar:types.${o.type}`), title: occurrenceTitle(o, t, members) })
      : t(`calendar:types.${o.type}`),
    body: shorten(parts.filter(Boolean).join(' · ')),
    url: `calendar/${o.event.id}${o.key === 'single' ? '' : `/${o.key}`}`,
    tag: `reminder-${occurrenceId(o)}`,
  };
}

/** Every active member's reminders in the next HORIZON_DAYS, sorted by time. */
export function computeReminders({ events, exceptions, answers, members, settings, now, t }: ComputeInput): Map<string, ReminderJob[]> {
  const today = toLocal(now).date;
  const to = addDays(today, HORIZON_DAYS);
  const active = members.filter((m) => m.active);
  const occurrences = events.flatMap((e) => occurrencesOf(e, exceptions[e.id] ?? [], today, to)).filter((o) => !o.cancelled);
  const absences = occurrences.filter((o) => o.type === 'absence');
  const absent = (memberId: string, o: Occurrence) =>
    absences.some((a) => a.event.memberId === memberId && a.startDate <= o.startDate && a.endDate >= o.startDate);

  const result = new Map<string, ReminderJob[]>();
  for (const member of active) {
    const own = settings.get(member.id) ?? defaultSettings(member.id);
    const jobs: ReminderJob[] = [];
    for (const o of occurrences) {
      const offsets = offsetsFor(own, o.event);
      if (!offsets.length) continue;
      // no reminder for dates you said no to or are away for
      if (answers[occurrenceId(o)]?.some((a) => a.memberId === member.id && a.status === 'no') || absent(member.id, o)) continue;
      const ref = referenceTime(o);
      const payload = payloadFor(o, t, members);
      for (const minutes of offsets) {
        const at = ref - minutes * 60_000;
        if (at > now) jobs.push({ at, payload: { ...payload, tag: `${payload.tag}-${minutes}` } });
      }
    }
    if (jobs.length) result.set(member.id, jobs.sort((a, b) => a.at - b.at));
  }
  return result;
}

/** What the token helper stores: per member the devices and the upcoming reminders. */
export interface ReminderUpload {
  members: Record<string, { subscriptions: { endpoint: string; keys: PushDevice['keys'] }[]; jobs: ReminderJob[] }>;
}

/** Only members with at least one device that wants reminders. */
export function buildUpload(jobs: Map<string, ReminderJob[]>, devices: PushDevice[]): ReminderUpload {
  const members: ReminderUpload['members'] = {};
  for (const [memberId, list] of jobs) {
    const subscriptions = devices
      .filter((d) => d.memberId === memberId && d.active && d.prefs.reminders !== false)
      .map((d) => ({ endpoint: d.endpoint, keys: d.keys }));
    if (subscriptions.length) members[memberId] = { subscriptions, jobs: list };
  }
  return { members };
}

export class RemindersNotConfiguredError extends Error {
  constructor() {
    super('Reminders are not configured in the token helper');
    this.name = 'RemindersNotConfiguredError';
  }
}

export async function uploadReminders(upload: ReminderUpload): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${config.tokenHelperUrl}/reminders`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(upload),
  });
  if (res.status === 501) throw new RemindersNotConfiguredError();
  if (!res.ok) throw new Error(`reminders: ${res.status}`);
}
