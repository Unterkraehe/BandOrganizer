import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/core/i18n';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import type { ChatMessage } from '@/features/chat/model';
import { pushPayloadFor } from './payload';
import { listDevices, repairPush, sendPush, type PushDevice } from './push';

vi.mock('@/core/auth/tokens', () => ({ getAccessToken: async () => 'access-token' }));

const APP = '/h/_BandApp';
const members = [
  { id: 'm_lisa', displayName: 'Lisa', active: true },
  { id: 'm_tom', displayName: 'Tom', active: true },
] as never;
const msg = (patch: Partial<ChatMessage>): ChatMessage =>
  ({ id: 'c_1', type: 'text', text: 'Probe heute 30 min später?', context: null, share: null, replyTo: null, editedAt: null, createdAt: '2026-10-01T18:00:00Z', createdBy: 'm_lisa', updatedAt: '', updatedBy: '', deletedAt: null, deletedBy: null, schemaVersion: 1, ...patch }) as ChatMessage;

describe('notification content (decided: sender + text; chat + event changes)', () => {
  const t = i18n.t.bind(i18n);
  it('chat message', () => {
    expect(pushPayloadFor(msg({}), t, members, 'Overload')).toEqual({
      kind: 'chat',
      payload: { title: 'Lisa · Overload', body: 'Probe heute 30 min später?', url: 'chat?message=c_1', tag: 'chat-c_1' },
    });
  });
  it('event cancelled → events; other info lines → nothing', () => {
    const cancelled = pushPayloadFor(
      msg({ type: 'system', text: '', systemKey: 'event.cancelled', params: { actor: 'm_lisa', type: 'rehearsal', title: '', date: '2026-10-15', allDay: '1' }, context: { type: 'event', id: 'e_1', occurrence: '2026-10-15' } }),
      t,
      members,
      'Overload',
    );
    expect(cancelled).toMatchObject({ kind: 'events', payload: { title: 'Termin abgesagt', url: 'calendar/e_1/2026-10-15' } });
    expect(cancelled!.payload.body).toMatch(/Lisa hat Probe am .* abgesagt/);
    expect(pushPayloadFor(msg({ type: 'system', systemKey: 'band.branding', params: {} }), t, members, 'Overload')).toBeNull();
  });
});

describe('sending', () => {
  afterEach(() => vi.restoreAllMocks());

  it('goes to the other members only, respects their settings, switches off gone devices', async () => {
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    const storage = new SafeStorage(provider, { appRoot: APP });
    const device = (memberId: string, endpoint: string, prefs = { chat: true, events: true }): PushDevice => ({
      schemaVersion: 1, memberId, endpoint, keys: { p256dh: 'p', auth: 'a' }, prefs, device: 'Android', active: true, createdAt: '', updatedAt: '',
    });
    await storage.writeJson(`${APP}/push/m_lisa/d1.json`, device('m_lisa', 'https://fcm.googleapis.com/lisa'));
    await storage.writeJson(`${APP}/push/m_tom/d2.json`, device('m_tom', 'https://fcm.googleapis.com/tom'));
    await storage.writeJson(`${APP}/push/m_tom/d3.json`, device('m_tom', 'https://web.push.apple.com/tom-old'));
    await storage.writeJson(`${APP}/push/m_max/d4.json`, device('m_max', 'https://fcm.googleapis.com/max', { chat: false, events: true }));

    const bodies: { subscriptions: { endpoint: string }[] }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      bodies.push(body);
      return new Response(JSON.stringify({ results: body.subscriptions.map((s: { endpoint: string }) => ({ endpoint: s.endpoint, status: s.endpoint.includes('old') ? 410 : 201 })) }));
    });
    const delivered = await sendPush(storage, APP, 'm_lisa', 'chat', { title: 'Lisa', body: 'Hi', url: 'chat' });
    expect(delivered).toBe(1);
    expect(bodies[0]!.subscriptions.map((s) => s.endpoint).sort()).toEqual(['https://fcm.googleapis.com/tom', 'https://web.push.apple.com/tom-old']);
    expect((await listDevices(storage, APP)).map((d) => d.endpoint)).not.toContain('https://web.push.apple.com/tom-old');
  });
});

describe('this device repairs its registration by itself (v1.0.2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  /** A browser with granted permission and a push manager handing out the given addresses. */
  function browser(first: string | null, next: string[]) {
    const make = (endpoint: string) => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: vi.fn(async () => {
        current = null;
        return true;
      }),
    });
    let current = first ? make(first) : null;
    const pushManager = {
      getSubscription: async () => current,
      subscribe: vi.fn(async () => (current = make(next.shift()!))),
    };
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('PushManager', class {});
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ pushManager }) } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ publicKey: 'AAAA' })));
    return pushManager;
  }
  const setup = () => {
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    return new SafeStorage(provider, { appRoot: APP });
  };
  /** read straight from the files: `listDevices` caches for 5 minutes across tests */
  const stored = async (storage: SafeStorage) => {
    const devices: PushDevice[] = [];
    for (const folder of await storage.list(`${APP}/push`).catch(() => [])) {
      for (const file of await storage.list(folder.path)) devices.push(await storage.readJson<PushDevice>(file.path));
    }
    return devices.filter((d) => d.active);
  };
  const active = async (storage: SafeStorage) => (await stored(storage)).map((d) => d.endpoint);

  it('a device switched off after a failed delivery gets a new address and is on again', async () => {
    const storage = setup();
    const pushManager = browser('https://fcm.googleapis.com/one', ['https://fcm.googleapis.com/two']);
    // turned on before v1.0.2 (subscription, no local mark), nothing stored yet → registered
    expect(await repairPush(storage, APP, 'm_tom')).toBe('repaired');
    expect(await active(storage)).toEqual(['https://fcm.googleapis.com/one']);
    expect(await repairPush(storage, APP, 'm_tom')).toBe('ok');

    // a sender's delivery fails with 410 → the device is switched off …
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ results: body.subscriptions.map((s: { endpoint: string }) => ({ endpoint: s.endpoint, status: 410 })) }));
    });
    await sendPush(storage, APP, 'm_lisa', 'chat', { title: 'Lisa', body: 'Hi', url: 'chat' });
    expect(await active(storage)).toEqual([]);

    // … and comes back by itself the next time the app is opened, with a fresh address
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ publicKey: 'AAAA' })));
    expect(await repairPush(storage, APP, 'm_tom')).toBe('repaired');
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(await active(storage)).toEqual(['https://fcm.googleapis.com/two']);
  });

  it('a push address the browser dropped is replaced; a device that never had notifications stays off', async () => {
    const storage = setup();
    browser(null, ['https://fcm.googleapis.com/new']);
    expect(await repairPush(storage, APP, 'm_tom')).toBe('off');
    expect(await active(storage)).toEqual([]);

    // notifications were on (local mark + stored registration), the browser lost the subscription
    localStorage.setItem('bandapp.push.wanted.m_tom', JSON.stringify({ endpoint: 'https://fcm.googleapis.com/lost', prefs: { chat: true, events: false } }));
    await storage.writeJson(`${APP}/push/m_tom/x.json`, { schemaVersion: 1, memberId: 'm_tom', endpoint: 'https://fcm.googleapis.com/other', keys: { p256dh: 'p', auth: 'a' }, prefs: {}, device: 'Mac', active: true, createdAt: '', updatedAt: '' });
    expect(await repairPush(storage, APP, 'm_tom')).toBe('repaired');
    const devices = await stored(storage);
    expect(devices.map((d) => d.endpoint).sort()).toEqual(['https://fcm.googleapis.com/new', 'https://fcm.googleapis.com/other']);
    expect(devices.find((d) => d.endpoint.endsWith('/new'))!.prefs).toEqual({ chat: true, events: false }); // the member's choices survive
  });

  it('does nothing without permission', async () => {
    const storage = setup();
    browser('https://fcm.googleapis.com/one', []);
    vi.stubGlobal('Notification', { permission: 'default' });
    expect(await repairPush(storage, APP, 'm_tom')).toBe('off');
    expect(await active(storage)).toEqual([]);
  });
});
