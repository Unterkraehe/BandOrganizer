import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { dayKey, formatRelativeDay } from '@/core/i18n/format';
import type { ChatMessage } from './model';
import { MessageItem } from './MessageItem';
import styles from './Chat.module.css';

interface Props {
  messages: ChatMessage[];
  firstUnreadId: string | null;
  showContext: boolean;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
}

/** Date separators, "Neue Nachrichten" divider, author grouping (F6 §3.1). */
export function MessageList({ messages, firstUnreadId, showContext, onReply, onEdit }: Props) {
  const { t } = useTranslation('chat');
  return (
    <ul className={styles.messages}>
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || dayKey(prev.createdAt) !== dayKey(msg.createdAt);
        const showAuthor = newDay || !prev || prev.createdBy !== msg.createdBy || prev.type === 'system';
        return (
          <Fragment key={msg.id}>
            {newDay && <li className={styles.day}>{formatRelativeDay(msg.createdAt)}</li>}
            {msg.id === firstUnreadId && (
              <li className={styles.divider} id="chat-unread">
                {t('newMessages')}
              </li>
            )}
            <MessageItem msg={msg} showAuthor={showAuthor} showContext={showContext} onReply={onReply} onEdit={onEdit} />
          </Fragment>
        );
      })}
    </ul>
  );
}
