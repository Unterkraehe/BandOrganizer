import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useHighlightElement } from '@/features/search/useHighlightTarget';
import { Button, EmptyState, Page } from '@/ui';
import { useChat } from './ChatProvider';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import type { ChatMessage } from './model';
import styles from './Chat.module.css';

/** Band-Chat (F6 §3.1). Opens at the first unread message. */
export function ChatPage() {
  const { t } = useTranslation('chat');
  const { store, state, setFast } = useChat();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [params] = useSearchParams();
  const [composerHeight, setComposerHeight] = useState(72);
  const sentByMe = useRef(false);
  const target = params.get('message');
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const firstUnread = useRef<string | null | undefined>(undefined);
  if (firstUnread.current === undefined && state.status === 'ready') firstUnread.current = store.unread()[0]?.id ?? null;

  // fast polling while the chat is open (F6 §4.3)
  useEffect(() => {
    setFast(true);
    void store.poll();
    return () => setFast(false);
  }, [store, setFast]);

  const last = state.messages.at(-1);
  // read status: everything visible counts as read (F6 §4.4)
  const ready = state.status === 'ready';
  useEffect(() => {
    // only after the unread divider position was taken (first ready render)
    if (ready && last && document.visibilityState === 'visible') store.markRead(last.createdAt);
  }, [last, store, ready]);

  // every arrival (opening the chat, a tapped notification while the chat is open): jump to the unread divider
  // (or the newest message); later: follow new messages
  const { key } = useLocation();
  const targetLoaded = !!target && state.messages.some((m) => m.id === target);
  const arrived = useRef<string | null>(null);
  const jumpFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(jumpFrame.current), []);
  useLayoutEffect(() => {
    if (!state.messages.length) return;
    if (arrived.current !== key) {
      arrived.current = key;
      sentByMe.current = false;
      // A linked message (search result, notification) that is already there is scrolled into view by
      // useHighlightElement. One that isn't there yet – a push is faster than polling, the cached messages
      // show first – would leave the page at the top until it arrives; start at the newest messages instead.
      if (targetLoaded) return;
      // One frame later: the router's <ScrollRestoration> (a layout effect of the root route, which runs
      // after this one) resets the page to the top on every navigation and would undo the jump.
      cancelAnimationFrame(jumpFrame.current);
      jumpFrame.current = requestAnimationFrame(() => {
        const divider = document.getElementById('chat-unread');
        if (divider) divider.scrollIntoView({ block: 'center' });
        else window.scrollTo({ top: document.documentElement.scrollHeight });
      });
      return;
    }
    // Your own message always jumps into view; incoming ones follow only if you are reading at the bottom
    const height = document.documentElement.scrollHeight;
    const nearBottom = window.innerHeight + window.scrollY > height - 400;
    if (sentByMe.current || nearBottom) window.scrollTo({ top: height, behavior: sentByMe.current ? 'auto' : 'smooth' });
    sentByMe.current = false;
  }, [state.messages.length, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => state.messages, [state.messages]);
  useHighlightElement(target ? `msg-${target}` : null, targetLoaded, key);

  return (
    <Page title={t('title')}>
      <div className={styles.page}>
        {state.hasOlder ? (
          <Button variant="ghost" onClick={() => void store.loadOlder()}>
            {t('older')}
          </Button>
        ) : (
          messages.length > 0 && <p className={styles.system}>{t('noOlder')}</p>
        )}
        {state.status === 'error' && <EmptyState icon={null} title={t('loadError')} text="" />}
        {state.status === 'ready' && messages.length === 0 && <EmptyState icon={null} title={t('title')} text={t('empty')} />}
        <MessageList
          messages={messages}
          firstUnreadId={firstUnread.current ?? null}
          showContext
          onReply={(m) => {
            setEditing(null);
            setReplyTo(m);
          }}
          onEdit={(m) => {
            setReplyTo(null);
            setEditing(m);
          }}
        />
        {/* room for the input bar that is fixed to the bottom of the screen */}
        <div style={{ height: composerHeight }} aria-hidden="true" />
        <Composer
          pinned
          onHeight={setComposerHeight}
          replyTo={replyTo}
          editing={editing}
          onDone={() => {
            setReplyTo(null);
            setEditing(null);
          }}
          onSent={() => {
            sentByMe.current = true;
          }}
        />
      </div>
    </Page>
  );
}
