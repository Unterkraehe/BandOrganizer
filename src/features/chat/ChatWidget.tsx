import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatTime } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Avatar } from '@/ui';
import { useChat } from './ChatProvider';
import { systemText } from './items';
import styles from './Chat.module.css';

/** Start screen, first widget (F3 §4.1): latest 3 unread messages or one compact line. */
export function ChatWidget() {
  const { t } = useTranslation('chat');
  const { store, state } = useChat();
  const { members } = useSession();
  void state;
  const unread = store.unread();
  if (unread.length === 0) {
    return (
      <p className={styles.none}>
        <span>{t('widget.none')}</span>
        <Link to="/chat">{t('widget.toChat')}</Link>
      </p>
    );
  }
  const latest = unread.slice(-3);
  return (
    <section className={styles.widget} aria-labelledby="chat-widget">
      <h2 id="chat-widget" className={styles.discussionTitle}>
        {t('widget.title', { count: unread.length })}
      </h2>
      {latest.map((m) => {
        const author = members.find((x) => x.id === m.createdBy);
        return (
          <Link key={m.id} to="/chat" className={styles.widgetRow}>
            {author && <Avatar name={author.displayName} color={author.color} size="sm" />}
            <span>
              <strong>{m.type === 'system' ? '' : `${author?.displayName ?? '?'}: `}</strong>
              {m.type === 'system' ? systemText(m, t, members) : m.text || '📎'}
            </span>
            <small style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{formatTime(m.createdAt)}</small>
          </Link>
        );
      })}
      {unread.length > 3 && <span className={styles.cardSub}>{t('widget.more', { count: unread.length - 3 })}</span>}
      <Link to="/chat" style={{ fontWeight: 600 }}>
        {t('widget.toChat')}
      </Link>
    </section>
  );
}
