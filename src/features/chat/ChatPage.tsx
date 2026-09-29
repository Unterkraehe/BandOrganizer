import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

  // first open: jump to the unread divider, later: follow new messages
  const initial = useRef(true);
  useLayoutEffect(() => {
    if (!state.messages.length) return;
    if (initial.current) {
      initial.current = false;
      const divider = document.getElementById('chat-unread');
      if (divider) divider.scrollIntoView({ block: 'center' });
      else window.scrollTo({ top: document.body.scrollHeight });
      return;
    }
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 300;
    if (nearBottom || last?.createdBy === undefined) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => state.messages, [state.messages]);

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
        <Composer
          replyTo={replyTo}
          editing={editing}
          onDone={() => {
            setReplyTo(null);
            setEditing(null);
          }}
          onSent={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
        />
      </div>
    </Page>
  );
}
