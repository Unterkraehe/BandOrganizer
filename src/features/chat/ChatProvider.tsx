import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { onSystemEvent } from '@/core/events';
import { onAppResume } from '@/core/resume';
import { useSession } from '@/core/session/BandSession';
import { useTranslation } from 'react-i18next';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { sendPush } from '@/features/notifications/push';
import { pushPayloadFor } from '@/features/notifications/payload';
import type { ChatMessage } from './model';
import { ChatStore } from './store';

const Ctx = createContext<{ store: ChatStore; setFast: (fast: boolean) => void } | null>(null);

/** Chat store + polling: 10 s while the chat is visible, 60 s otherwise, none in the background (F6 §4.3). */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { storage, appRoot, band, mode, currentMember, members } = useSession();
  const { t } = useTranslation();
  const member = useRef(currentMember?.id ?? 'unknown');
  member.current = currentMember?.id ?? 'unknown';
  // push notifications to the other members (F6 §4.5) – not in the demo (no real HiDrive login)
  const notifyRef = useRef<(message: ChatMessage) => void>(() => undefined);
  notifyRef.current = (message) => {
    if (mode === 'demo' || !storage || !appRoot) return;
    const payload = pushPayloadFor(message, t, members, band?.bandName ?? '');
    if (!payload) return;
    void sendPush(storage, appRoot, message.createdBy, payload.kind, payload.payload).catch((error) => console.warn('Push failed', error));
  };
  const [store] = useState(() => {
    if (!storage || !appRoot || !band) throw new Error('ChatProvider needs a ready session');
    return new ChatStore({
      storage,
      appRoot,
      memberId: () => member.current,
      cacheKey: mode === 'demo' ? null : `bandapp.chat.${band.id}.${member.current}`,
      onSaved: (message) => notifyRef.current(message),
    });
  });
  const [fast, setFast] = useState(false);

  useEffect(() => {
    void store.load();
    const off = onSystemEvent((event) => void store.system(event).catch(() => undefined));
    // back after a while: read status and new months from HiDrive again
    const offResume = onAppResume(() => void store.load());
    return () => {
      off();
      offResume();
      store.dispose();
    };
  }, [store]);

  useEffect(() => {
    const interval = fast ? 10_000 : 60_000;
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void store.poll(), interval);
    const onVisible = () => document.visibilityState === 'visible' && void store.poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [store, fast]);

  // Someone else's event info line arrived: their calendar change is on HiDrive – fetch it now
  // instead of waiting for the calendar's own check (v0.14.3)
  const { store: calendar } = useCalendar();
  const seen = useRef<Set<string> | null>(null);
  const messages = useSyncExternalStore(store.subscribe, () => store.getState().messages);
  useEffect(() => {
    const ids = new Set(messages.map((m) => m.id));
    const before = seen.current;
    seen.current = ids;
    if (!before) return; // first state: nothing is "new"
    const news = messages.some((m) => !before.has(m.id) && m.type === 'system' && m.systemKey?.startsWith('event.') && m.createdBy !== member.current);
    if (news) void calendar.refresh();
  }, [messages, calendar]);

  return <Ctx.Provider value={{ store, setFast }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChat() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  const state = useSyncExternalStore(ctx.store.subscribe, ctx.store.getState);
  return { store: ctx.store, state, setFast: ctx.setFast };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUnreadCount(): number {
  const { store, state } = useChat();
  void state;
  return store.unread().length;
}
