// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { ChatStore } from './store';

const APP = '/h/_BandApp';

describe('ChatStore (F6)', () => {
  let storage: SafeStorage;
  const make = (member: string, now = () => new Date('2026-10-01T18:00:00Z')) =>
    new ChatStore({ storage, appRoot: APP, memberId: () => member, cacheKey: null, now });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const provider = new MemoryStorageProvider();
    provider.seedFolder('/h');
    storage = new SafeStorage(provider, { appRoot: APP });
  });
  afterEach(() => vi.useRealTimers());

  it('sends, polls on another device, counts unread and shares read status', async () => {
    const lisa = make('m_lisa');
    const tom = make('m_tom');
    await Promise.all([lisa.load(), tom.load()]);
    await lisa.send('Probe heute 30 min später?', { context: { type: 'event', id: 'e_1', occurrence: '2026-10-01' } });
    await tom.poll();
    expect(tom.getState().messages.map((m) => m.text)).toEqual(['Probe heute 30 min später?']);
    expect(tom.unread()).toHaveLength(1);
    tom.markRead(tom.getState().messages[0]!.createdAt);
    await vi.advanceTimersByTimeAsync(2500);
    const tomOnLaptop = make('m_tom');
    await tomOnLaptop.load();
    expect(tomOnLaptop.unread()).toHaveLength(0);
    expect(lisa.unread()).toHaveLength(0); // own messages are never unread
  });

  it('shows edits, deletions and reactions at once and takes them back if saving fails (R-UX-10)', async () => {
    const lisa = make('m_lisa');
    await lisa.load();
    const msg = await lisa.send('Hallo');
    let finish!: () => void;
    const write = vi.spyOn(storage, 'writeJson').mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ version: 'v2' } as never))));
    const editing = lisa.edit(msg, 'Hallo zusammen');
    expect(lisa.getState().messages[0]!.text).toBe('Hallo zusammen'); // before HiDrive answered
    finish();
    await editing;

    write.mockRejectedValueOnce(new Error('offline'));
    await expect(lisa.remove(lisa.getState().messages[0]!)).rejects.toThrow('offline');
    expect(lisa.getState().messages[0]!.deletedAt).toBeNull(); // back as it was

    write.mockRejectedValueOnce(new Error('offline'));
    const reacting = lisa.react(msg, '👍');
    expect(lisa.getState().reactions[msg.id]).toEqual({ m_lisa: '👍' });
    await expect(reacting).rejects.toThrow('offline');
    expect(lisa.getState().reactions[msg.id]).toEqual({});
    write.mockRestore();
  });

  it('edits, deletes softly and picks up the change when polling', async () => {
    const lisa = make('m_lisa');
    const tom = make('m_tom');
    await Promise.all([lisa.load(), tom.load()]);
    const msg = await lisa.send('Hallo');
    await tom.poll();
    await lisa.edit(lisa.getState().messages.find((m) => m.id === msg.id)!, 'Hallo zusammen');
    await tom.poll();
    expect(tom.getState().messages[0]).toMatchObject({ text: 'Hallo zusammen' });
    expect(tom.getState().messages[0]!.editedAt).toBeTruthy();
    await lisa.remove(lisa.getState().messages[0]!);
    await tom.poll();
    expect(tom.getState().messages[0]!.deletedAt).toBeTruthy();
  });

  it('stores reactions per member and loads older months', async () => {
    let now = new Date('2026-08-15T10:00:00Z');
    const lisa = make('m_lisa', () => now);
    await lisa.load();
    await lisa.send('August');
    now = new Date('2026-10-02T10:00:00Z');
    const msg = await lisa.send('Oktober');
    await lisa.react(msg, '👍');
    const tom = make('m_tom', () => now);
    await tom.load();
    // August is loaded because there are few messages
    expect(tom.getState().messages.map((m) => m.text)).toEqual(['August', 'Oktober']);
    expect(tom.getState().reactions[msg.id]).toEqual({ m_lisa: '👍' });
    await tom.react(tom.getState().messages[1]!, '😂');
    await tom.react(tom.getState().messages[1]!, null);
    expect(tom.getState().reactions[msg.id]).toEqual({ m_lisa: '👍' });
  });

  it('writes system info lines', async () => {
    const lisa = make('m_lisa');
    await lisa.load();
    await lisa.system({ key: 'event.cancelled', params: { title: 'Probe', date: '2026-10-15' }, context: { type: 'event', id: 'e_1' } });
    expect(lisa.getState().messages[0]).toMatchObject({ type: 'system', systemKey: 'event.cancelled' });
  });
});
