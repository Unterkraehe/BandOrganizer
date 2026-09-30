import { getAccessToken } from '@/core/auth/tokens';
import { joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import { config } from '@/config';

/**
 * Push notifications (F6 §4.5). Each device that wants notifications stores its Web Push
 * subscription in `_BandApp/push/<memberId>/<deviceId>.json`. Whoever writes a chat message or
 * changes an event asks the token helper to deliver a notification to all OTHER members' devices.
 */

export type PushKind = 'chat' | 'events';

export interface PushDevice {
  schemaVersion: 1;
  memberId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  prefs: Record<PushKind, boolean>;
  device: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** app-relative path, e.g. "chat?message=c_1" */
  url: string;
  tag?: string;
}

export type PushSupport = 'available' | 'unsupported' | 'ios-install' | 'denied';

const dir = (appRoot: string) => joinPath(appRoot, 'push');
const devicePath = (appRoot: string, memberId: string, deviceId: string) => joinPath(dir(appRoot), memberId, `${deviceId}.json`);

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  if (!('PushManager' in window)) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'available';
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Gerät';
}

/** Stable id per subscription (the endpoint), so re-subscribing overwrites the same file. */
async function deviceIdFor(endpoint: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return Array.from(hash.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

function b64uToBytes(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function publicKey(): Promise<string> {
  const res = await fetch(`${config.tokenHelperUrl}/push/key`);
  if (res.status === 501) throw new PushNotConfiguredError();
  if (!res.ok) throw new Error(`push key: ${res.status}`);
  return ((await res.json()) as { publicKey: string }).publicKey;
}

export class PushNotConfiguredError extends Error {
  constructor() {
    super('Push notifications are not configured in the token helper');
    this.name = 'PushNotConfiguredError';
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Must be called from a tap (permission prompt). */
export async function enablePush(storage: SafeStorage, appRoot: string, memberId: string, prefs: Record<PushKind, boolean>): Promise<PushDevice> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission-denied');
  const reg = await navigator.serviceWorker.ready;
  const key = await publicKey();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) as BufferSource }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const now = new Date().toISOString();
  const device: PushDevice = { schemaVersion: 1, memberId, endpoint: json.endpoint, keys: json.keys, prefs, device: deviceLabel(), active: true, createdAt: now, updatedAt: now };
  await storage.writeJson(devicePath(appRoot, memberId, await deviceIdFor(json.endpoint)), device);
  invalidateDevices();
  return device;
}

export async function savePrefs(storage: SafeStorage, appRoot: string, device: PushDevice): Promise<void> {
  await storage.writeJson(devicePath(appRoot, device.memberId, await deviceIdFor(device.endpoint)), { ...device, updatedAt: new Date().toISOString() });
  invalidateDevices();
}

export async function disablePush(storage: SafeStorage, appRoot: string, device: PushDevice | null): Promise<void> {
  const sub = await currentSubscription();
  await sub?.unsubscribe().catch(() => undefined);
  if (device) await markInactive(storage, appRoot, device);
}

async function markInactive(storage: SafeStorage, appRoot: string, device: PushDevice) {
  const path = pathOf.get(device) ?? devicePath(appRoot, device.memberId, await deviceIdFor(device.endpoint));
  await storage.writeJson(path, { ...device, active: false, updatedAt: new Date().toISOString() });
  invalidateDevices();
}

/** This device's stored registration (for the settings screen). */
export async function thisDevice(storage: SafeStorage, appRoot: string, memberId: string): Promise<PushDevice | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  try {
    const d = await storage.readJson<PushDevice>(devicePath(appRoot, memberId, await deviceIdFor(sub.endpoint)));
    return d.active ? d : null;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

let cache: { at: number; devices: PushDevice[] } | null = null;
/** where a listed device came from (file names are hashes, but never rely on it) */
const pathOf = new WeakMap<PushDevice, string>();
const invalidateDevices = () => (cache = null);

/** All registered devices of the band (cached for 5 minutes). */
export async function listDevices(storage: SafeStorage, appRoot: string): Promise<PushDevice[]> {
  if (cache && Date.now() - cache.at < 300_000) return cache.devices;
  const devices: PushDevice[] = [];
  let members: { path: string }[];
  try {
    members = (await storage.list(dir(appRoot))).filter((e) => e.type === 'folder');
  } catch (error) {
    if (error instanceof NotFoundError) members = [];
    else throw error;
  }
  for (const folder of members) {
    const files = (await storage.list(folder.path).catch(() => [])).filter((e) => e.name.endsWith('.json'));
    for (const f of files) {
      const d = await storage.readJson<PushDevice>(f.path).catch(() => null);
      if (d?.active) {
        pathOf.set(d, f.path);
        devices.push(d);
      }
    }
  }
  cache = { at: Date.now(), devices };
  return devices;
}

/** Sends to all other members' devices that want this kind (or to `only` for the test). */
export async function sendPush(
  storage: SafeStorage,
  appRoot: string,
  senderId: string,
  kind: PushKind,
  payload: PushPayload,
  only?: PushDevice,
): Promise<number> {
  const targets = only ? [only] : (await listDevices(storage, appRoot)).filter((d) => d.memberId !== senderId && d.prefs[kind] !== false);
  if (targets.length === 0) return 0;
  const token = await getAccessToken();
  const res = await fetch(`${config.tokenHelperUrl}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscriptions: targets.map((d) => ({ endpoint: d.endpoint, keys: d.keys })), payload }),
  });
  if (res.status === 501) throw new PushNotConfiguredError();
  if (!res.ok) throw new Error(`push: ${res.status}`);
  const { results } = (await res.json()) as { results: { endpoint: string; status: number | string }[] };
  // devices that unsubscribed (uninstalled app, revoked permission) are switched off
  for (const r of results) {
    if (r.status === 404 || r.status === 410) {
      const gone = targets.find((d) => d.endpoint === r.endpoint);
      if (gone) await markInactive(storage, appRoot, gone).catch(() => undefined);
    }
  }
  return results.filter((r) => typeof r.status === 'number' && r.status < 300).length;
}

/** Notification text: at most ~180 characters. */
export const shorten = (text: string, max = 180) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
