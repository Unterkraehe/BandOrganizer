import { nowIso } from '@/core/data/record';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import { buildIcs, type IcsLabels } from './ics';
import type { CalendarState } from './store';

/**
 * Calendar subscription (F5 §6.5b): the app keeps `_BandApp/calendar/export/band.ics` up to date and
 * shares exactly this one file with a public read-only HiDrive link. Calendar apps subscribe to it.
 */

export interface Subscription {
  schemaVersion: 1;
  active: boolean;
  shareId: string | null;
  url: string | null;
  createdAt: string;
  createdBy: string;
}

export const exportDir = (appRoot: string) => joinPath(appRoot, 'calendar', 'export');
export const icsPath = (appRoot: string) => joinPath(exportDir(appRoot), 'band.ics');
const subscriptionPath = (appRoot: string) => joinPath(exportDir(appRoot), 'subscription.json');

export async function readSubscription(storage: SafeStorage, appRoot: string): Promise<Subscription | null> {
  try {
    const s = await storage.readJson<Subscription>(subscriptionPath(appRoot));
    return s.active ? s : null;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export function bandIcs(state: Pick<CalendarState, 'events' | 'exceptions'>, labels: IcsLabels, calendarName: string): string {
  return buildIcs(
    state.events.map((e) => ({ event: e.value, exceptions: (state.exceptions[e.value.id] ?? []).map((x) => x.value) })),
    labels,
    calendarName,
  );
}

/** Writes band.ics only if the content changed (no pointless uploads on every app start). */
export async function writeBandIcs(storage: SafeStorage, appRoot: string, ics: string, cacheKey: string | null): Promise<boolean> {
  const last = cacheKey ? safeGet(cacheKey) : null;
  if (last === ics) return false;
  await storage.writeText(icsPath(appRoot), ics);
  if (cacheKey) safeSet(cacheKey, ics);
  return true;
}

/** Creates (or renews) the public link. Renewing invalidates the old link first (F5 §6.5b privacy). */
export async function createSubscription(storage: SafeStorage, appRoot: string, ics: string, memberId: string, previous: Subscription | null): Promise<Subscription> {
  if (previous?.shareId) await storage.deleteShareLink(previous.shareId).catch(() => undefined);
  await storage.writeText(icsPath(appRoot), ics);
  const link = await storage.createShareLink(icsPath(appRoot));
  const sub: Subscription = { schemaVersion: 1, active: true, shareId: link.id, url: link.url, createdAt: nowIso(), createdBy: memberId };
  await storage.writeJson(subscriptionPath(appRoot), sub);
  return sub;
}

/** Ends the subscription: the link stops working; band.ics stays (app file, harmless). */
export async function endSubscription(storage: SafeStorage, appRoot: string, sub: Subscription, memberId: string): Promise<void> {
  if (sub.shareId) await storage.deleteShareLink(sub.shareId).catch(() => undefined);
  await storage.writeJson(subscriptionPath(appRoot), { ...sub, active: false, shareId: null, url: null, createdAt: nowIso(), createdBy: memberId });
}

/** `webcal://` makes iPhones and Outlook open "subscribe" directly. */
export const webcalUrl = (url: string) => url.replace(/^https?:\/\//, 'webcal://');

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
