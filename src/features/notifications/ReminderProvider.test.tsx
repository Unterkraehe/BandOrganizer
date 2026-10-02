import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { ReminderProvider } from './ReminderProvider';
import type { ReminderUpload } from './reminders';

const APP = '/h/_BandApp';
const provider = new MemoryStorageProvider();
provider.seedFolder('/h');
const storage = new SafeStorage(provider, { appRoot: APP });
const members = [{ id: 'm_lisa', displayName: 'Lisa', active: true }];
const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();
let calendarState = {
  status: 'ready',
  events: [{ value: { id: 'e_1', type: 'rehearsal', title: null, allDay: false, start: inTwoDays, end: inTwoDays, meetingTime: null, location: null, recurrence: null, status: 'active', deletedAt: null }, version: 'v1' }],
  exceptions: {},
  answers: {},
};
let fresh = false;

vi.mock('@/core/session/BandSession', () => ({
  useSession: () => ({ storage, appRoot: APP, band: { id: 'b_1' }, mode: 'hidrive', currentMember: members[0], members }),
}));
vi.mock('@/features/calendar/CalendarProvider', () => ({
  useCalendar: () => ({ store: { isFresh: () => fresh }, state: calendarState }),
}));
vi.mock('./push', async (original) => ({
  ...(await original<typeof import('./push')>()),
  listDevices: async () => [{ memberId: 'm_lisa', endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' }, prefs: {}, active: true }],
}));
const uploads: ReminderUpload[] = [];
vi.mock('./reminders', async (original) => ({
  ...(await original<typeof import('./reminders')>()),
  uploadReminders: async (upload: ReminderUpload) => void uploads.push(upload),
}));

describe('keeping the token helper current (F6 §4.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    uploads.length = 0;
    fresh = false;
  });
  afterEach(() => vi.useRealTimers());

  const settle = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
  };

  it('uploads only after the calendar came from HiDrive, and only when something changed', async () => {
    const view = render(<ReminderProvider>{null}</ReminderProvider>);
    await settle();
    expect(uploads).toHaveLength(0); // only cached data so far

    fresh = true;
    calendarState = { ...calendarState }; // the store's state after loading from HiDrive
    view.rerender(<ReminderProvider>{' '}</ReminderProvider>);
    await settle();
    // the checksum (crypto.subtle) doesn't run on the fake clock – on a slow CI runner the upload can lag behind
    await vi.waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]!.members.m_lisa!.jobs).toHaveLength(1); // rehearsal default: 2 h before
    expect(uploads[0]!.members.m_lisa!.jobs[0]!.payload.title).toBe('Probe');

    calendarState = { ...calendarState }; // reloaded, nothing changed
    view.rerender(<ReminderProvider>{'  '}</ReminderProvider>);
    await settle();
    expect(uploads).toHaveLength(1); // same list → no second upload
  });
});
