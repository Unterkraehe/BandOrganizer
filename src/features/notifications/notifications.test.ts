import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/core/i18n';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import type { ChatMessage } from '@/features/chat/model';
import { pushPayloadFor } from './payload';
import { listDevices, sendPush, type PushDevice } from './push';

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
