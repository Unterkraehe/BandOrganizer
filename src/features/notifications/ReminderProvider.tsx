import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Versioned } from '@/core/band/band';
import { useSession } from '@/core/session/BandSession';
import { ConflictError } from '@/core/storage';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { listDevices } from './push';
import {
  buildUpload,
  computeReminders,
  normalizeSettings,
  readAllSettings,
  readSettings,
  RemindersNotConfiguredError,
  uploadReminders,
  writeSettings,
  type ReminderSettings,
  type ReminderType,
} from './reminders';

/** Your reminder settings (F6 §4.7) + keeping the token helper's reminder list current. */
interface ReminderContextValue {
  settings: ReminderSettings;
  setDefaults: (type: ReminderType, offsets: number[]) => Promise<void>;
  /** null = back to the default for the event type */
  setEventOffsets: (eventId: string, offsets: number[] | null) => Promise<void>;
}

const ReminderContext = createContext<ReminderContextValue | null>(null);

/** Waits a moment after changes so several quick edits lead to one upload. */
const SYNC_DELAY_MS = 5000;

async function sha256(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readCache(key: string | null): ReminderSettings | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ReminderSettings) : null;
  } catch {
    return null;
  }
}

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('notifications');
  const { storage, appRoot, band, mode, currentMember, members } = useSession();
  const { store: calendar, state: calendarState } = useCalendar();
  const memberId = currentMember?.id ?? '';
  const cacheKey = mode === 'demo' || !band ? null : `bandapp.reminders.${band.id}.${memberId}`;
  const [own, setOwn] = useState<Versioned<ReminderSettings>>(() => ({
    value: normalizeSettings(readCache(cacheKey), memberId),
    version: undefined,
  }));
  const [loaded, setLoaded] = useState(false);
  const ownRef = useRef(own);
  ownRef.current = own;

  const apply = useCallback(
    (next: Versioned<ReminderSettings>) => {
      setOwn(next);
      ownRef.current = next;
      if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(next.value));
    },
    [cacheKey],
  );

  useEffect(() => {
    if (!storage || !appRoot || !memberId) return;
    let cancelled = false;
    void readSettings(storage, appRoot, memberId)
      .then((file) => !cancelled && apply(file))
      .catch((error) => console.warn('Reminder settings unreadable', error))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [storage, appRoot, memberId, apply]);

  /** Optimistic: the change shows at once and is undone if saving fails (R-UX-07). */
  const save = useCallback(
    async (change: (s: ReminderSettings) => ReminderSettings) => {
      if (!storage || !appRoot) return;
      const before = ownRef.current;
      apply({ value: change(before.value), version: before.version });
      try {
        apply(await writeSettings(storage, appRoot, ownRef.current.value, before.version));
      } catch (error) {
        if (error instanceof ConflictError) {
          // changed on another device in the meantime: take that state, then the user can retry
          apply(await readSettings(storage, appRoot, memberId).catch(() => before));
        } else apply(before);
        throw error;
      }
    },
    [storage, appRoot, memberId, apply],
  );

  const setDefaults = useCallback(
    (type: ReminderType, offsets: number[]) => save((s) => ({ ...s, defaults: { ...s.defaults, [type]: offsets } })),
    [save],
  );
  const setEventOffsets = useCallback(
    (eventId: string, offsets: number[] | null) =>
      save((s) => {
        const events = { ...s.events };
        if (offsets === null) delete events[eventId];
        else events[eventId] = offsets;
        return { ...s, events };
      }),
    [save],
  );

  // Keep the token helper's list current: after the calendar was loaded from HiDrive and whenever
  // it or your settings change. Only uploads when the result differs from the last upload.
  const unavailable = useRef(false);
  useEffect(() => {
    if (mode === 'demo' || !storage || !appRoot || !band || !loaded || unavailable.current) return;
    if (calendarState.status !== 'ready' || !calendar.isFresh()) return;
    const timer = setTimeout(() => {
      void (async () => {
        const all = await readAllSettings(storage, appRoot, members.map((m) => m.id));
        all.set(memberId, ownRef.current.value); // own changes may not be on HiDrive yet
        const jobs = computeReminders({
          events: calendarState.events.map((e) => e.value),
          exceptions: Object.fromEntries(Object.entries(calendarState.exceptions).map(([id, list]) => [id, list.map((x) => x.value)])),
          answers: calendarState.answers,
          members,
          settings: all,
          now: Date.now(),
          t,
        });
        const upload = buildUpload(jobs, await listDevices(storage, appRoot));
        const body = JSON.stringify(upload);
        const hashKey = `bandapp.reminders.uploaded.${band.id}`;
        const hash = await sha256(body);
        if (localStorage.getItem(hashKey) === hash) return;
        await uploadReminders(upload);
        localStorage.setItem(hashKey, hash);
      })().catch((error) => {
        if (error instanceof RemindersNotConfiguredError) unavailable.current = true;
        else console.warn('Updating reminders failed', error);
      });
    }, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, storage, appRoot, band, loaded, calendar, calendarState, members, memberId, own.value, t]);

  return <ReminderContext.Provider value={{ settings: own.value, setDefaults, setEventOffsets }}>{children}</ReminderContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReminders() {
  const ctx = useContext(ReminderContext);
  if (!ctx) throw new Error('useReminders must be used inside ReminderProvider');
  return ctx;
}

