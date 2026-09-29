import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemRef } from '@/core/events';
import { useChat } from './ChatProvider';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { sameRef, type ChatMessage } from './model';
import styles from './Chat.module.css';

/** "Diskussion (4)" on songs, events and setlists (F6 §3.2). Messages also appear in the band chat. */
export function Discussion({ context }: { context: ItemRef }) {
  const { t } = useTranslation('chat');
  const { state } = useChat();
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const messages = state.messages.filter((m) => sameRef(m.context, context));
  const count = messages.filter((m) => m.type === 'text' && !m.deletedAt).length;

  return (
    <section className={styles.discussion}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
      >
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className={styles.discussionTitle}>{count ? t('discussion.title', { count }) : t('discussion.titleEmpty')}</span>
      </button>
      {open && (
        <>
          {messages.length === 0 && <p className={styles.system}>{t('discussion.empty')}</p>}
          <MessageList messages={messages} firstUnreadId={null} showContext={false} onReply={setReplyTo} onEdit={setEditing} />
          <Composer
            context={context}
            placeholder={t('discussion.placeholder')}
            replyTo={replyTo}
            editing={editing}
            onDone={() => {
              setReplyTo(null);
              setEditing(null);
            }}
          />
        </>
      )}
    </section>
  );
}
