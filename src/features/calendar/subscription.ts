import { getAccessToken } from '@/core/auth/tokens';
import { nowIso } from '@/core/data/record';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import { config } from '@/config';
import { buildIcs, type IcsLabels } from './ics';
import type { CalendarState } from './store';

/**
 * Calendar subscription (F5 §6.5b, v0.19.1): the band calendar as an .ics file at a secret address
 * of the token helper (`…/calendar/<secret>.ics`). Every member's app uploads the current calendar
 * after changes; calendar apps (Google, Apple, Outlook) fetch it as often as they like.
 *
 * Until v0.19.0 this was a HiDrive share link on `_BandApp/calendar/export/band.ics` – those expire
 * and have a download limit (HiDrive API: ttl / maxcount = tariff maximum), so subscriptions stopped
 * working. Such old subscriptions (`shareId`, no `secret`) are shown as "please create a new link".
 */

export interface Subscription {
  schemaVersion: 1 | 2;
  active: boolean;
  /** v2: the secret part of the address (only the band knows it) */
  secret?: string | null;
  /** v1 (HiDrive share link, no longer working) */
  shareId?: string | null;
  url: string | null;
  createdAt: string;
  createdBy: string;
}

/** Where the .ics lives: the token helper (real band) or memory (demo). */
export interface CalendarFeed {
  put(secret: string, ics: string): Promise<void>;
  remove(secret: string): Promise<void>;
  url(secret: string): string;
}

export class FeedNotConfiguredError extends Error {
  constructor() {
    super('The calendar subscription is not set up in the token helper');
    this.name = 'FeedNotConfiguredError';
  }
}

async function feedRequest(method: 'PUT' | 'DELETE', body: unknown) {
  const token = await getAccessToken();
  const res = await fetch(`${config.tokenHelperUrl}/calendar`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status === 501) throw new FeedNotConfiguredError();
  if (!res.ok) throw new Error(`calendar feed: ${res.status}`);
}

export const workerFeed: CalendarFeed = {
  put: (secret, ics) => feedRequest('PUT', { secret, ics }),
  remove: (secret) => feedRequest('DELETE', { secret }),
  url: (secret) => `${config.tokenHelperUrl}/calendar/${secret}.ics`,
};

/** Demo mode: nothing leaves the browser; the address is only an example. */
export function memoryFeed(): CalendarFeed {
  const files = new Map<string, string>();
  return {
    put: async (secret, ics) => void files.set(secret, ics),
    remove: async (secret) => void files.delete(secret),
    url: (secret) => `https://beispiel.invalid/calendar/${secret}.ics`,
  };
}

export const exportDir = (appRoot: string) => joinPath(appRoot, 'calendar', 'export');
const subscriptionPath = (appRoot: string) => joinPath(exportDir(appRoot), 'subscription.json');

/** 32 characters, URL-safe – unguessable */
export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function readSubscription(storage: SafeStorage, appRoot: string): Promise<Subscription | null> {
  try {
    const s = await storage.readJson<Subscription>(subscriptionPath(appRoot));
    return s.active ? s : null;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** An old HiDrive share-link subscription (until v0.19.0): it no longer works, a new link is needed. */
export const isLegacy = (sub: Subscription | null) => Boolean(sub && !sub.secret);

export function bandIcs(state: Pick<CalendarState, 'events' | 'exceptions'>, labels: IcsLabels, calendarName: string): string {
  return buildIcs(
    state.events.map((e) => ({ event: e.value, exceptions: (state.exceptions[e.value.id] ?? []).map((x) => x.value) })),
    labels,
    calendarName,
  );
}

/** Uploads the calendar only if it changed since this device last uploaded it. */
export async function updateFeed(feed: CalendarFeed, secret: string, ics: string, cacheKey: string | null): Promise<boolean> {
  const key = cacheKey ? `${cacheKey}.${secret}` : null;
  if (key && safeGet(key) === ics) return false;
  await feed.put(secret, ics);
  if (key) safeSet(key, ics);
  return true;
}

/** Creates (or renews) the link. Renewing removes the old address first (F5 §6.5b privacy). */
export async function createSubscription(
  storage: SafeStorage,
  appRoot: string,
  feed: CalendarFeed,
  ics: string,
  memberId: string,
  previous: Subscription | null,
): Promise<Subscription> {
  const secret = newSecret();
  await feed.put(secret, ics);
  if (previous?.secret) await feed.remove(previous.secret).catch(() => undefined);
  if (previous?.shareId) await storage.deleteShareLink(previous.shareId).catch(() => undefined);
  const sub: Subscription = { schemaVersion: 2, active: true, secret, url: feed.url(secret), createdAt: nowIso(), createdBy: memberId };
  await storage.writeJson(subscriptionPath(appRoot), sub);
  return sub;
}

/** Ends the subscription: the address stops working, calendars drop the band dates. */
export async function endSubscription(storage: SafeStorage, appRoot: string, feed: CalendarFeed, sub: Subscription, memberId: string): Promise<void> {
  if (sub.secret) await feed.remove(sub.secret).catch(() => undefined);
  if (sub.shareId) await storage.deleteShareLink(sub.shareId).catch(() => undefined);
  await storage.writeJson(subscriptionPath(appRoot), { schemaVersion: 2, active: false, secret: null, url: null, createdAt: nowIso(), createdBy: memberId } satisfies Subscription);
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
