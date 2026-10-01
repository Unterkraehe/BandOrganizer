import { CalendarDays, ListMusic, Music, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { ItemRef } from '@/core/events';
import { formatTime } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { AnswerButtons } from '@/features/calendar/AnswerButtons';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { useStartSetlist } from '@/features/setlists/SetlistModeProvider';
import { usePlaySong } from '@/features/songs/usePlaySong';
import { Avatar, Button, Menu } from '@/ui';
import { useChat } from './ChatProvider';
import { itemPath, systemText } from './items';
import { REACTIONS, type ChatMessage, type Reaction } from './model';
import { useItemResolver } from './useItem';
import styles from './Chat.module.css';

const ICON = { song: Music, event: CalendarDays, setlist: ListMusic };

/** Linkify URLs in plain text (F6 §4.1). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function ContextChip({ refItem }: { refItem: ItemRef }) {
  const { t } = useTranslation('chat');
  const resolve = useItemResolver();
  const item = resolve(refItem);
  const Icon = ICON[refItem.type];
  return (
    <Link to={itemPath(refItem)} className={styles.chip}>
      <Icon size={12} aria-hidden="true" />
      {item ? `${item.title}${item.sub ? ` · ${item.sub}` : ''}` : `${t(`context.${refItem.type}`)} · ${t('card.gone')}`}
    </Link>
  );
}

/** Actionable item card (F6 §3.1): play a song, answer an event, open/practice a setlist. */
function ShareCard({ refItem }: { refItem: ItemRef }) {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const resolve = useItemResolver();
  const { play } = usePlaySong();
  const startSetlist = useStartSetlist();
  const { store: calendar } = useCalendar();
  const { currentMember } = useSession();
  const item = resolve(refItem);
  if (!item) return <div className={styles.card}>{t('card.gone')}</div>;
  const Icon = ICON[refItem.type];
  const mine = item.kind === 'event' && currentMember ? calendar.answersFor(item.occ).find((a) => a.memberId === currentMember.id) : undefined;
  return (
    <div className={styles.card}>
      <span className={styles.cardTitle}>
        <Icon size={16} aria-hidden="true" /> {item.title}
      </span>
      {item.sub && <span className={styles.cardSub}>{item.sub}</span>}
      <div className={styles.cardActions}>
        {item.kind === 'song' && item.song.recording && (
          <Button icon={<Play size={16} />} onClick={() => play(item.song)}>
            {t('card.play')}
          </Button>
        )}
        {item.kind === 'event' && item.occ.event.answersEnabled && !item.occ.cancelled && <AnswerButtons occ={item.occ} current={mine?.status} comment={mine?.comment} compact />}
        {item.kind === 'setlist' && (
          <Button
            icon={<ListMusic size={16} />}
            onClick={() => startSetlist(item.setlist.id)}
          >
            {t('card.practice')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate(itemPath(refItem))}>
          {t('card.open')}
        </Button>
      </div>
    </div>
  );
}

interface MessageItemProps {
  msg: ChatMessage;
  showAuthor: boolean;
  showContext: boolean;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
}

export function MessageItem({ msg, showAuthor, showContext, onReply, onEdit }: MessageItemProps) {
  const { t } = useTranslation('chat');
  const { store, state } = useChat();
  const { members, currentMember } = useSession();

  if (msg.type === 'system') {
    return (
      <li className={styles.system} id={`msg-${msg.id}`}>
        {msg.context ? <Link to={itemPath(msg.context)}>{systemText(msg, t, members)}</Link> : systemText(msg, t, members)}
      </li>
    );
  }

  const author = members.find((m) => m.id === msg.createdBy);
  const mine = msg.createdBy === currentMember?.id;
  const pending = !state.versions[`${Date.parse(msg.createdAt)}_${msg.id}.json`];
  const reactions = state.reactions[msg.id] ?? {};
  const counts = REACTIONS.map((emoji) => ({ emoji, count: Object.values(reactions).filter((r) => r === emoji).length, mine: reactions[currentMember?.id ?? ''] === emoji })).filter((r) => r.count);
  const fail = () => undefined;
  const toggle = (emoji: Reaction) => void store.react(msg, reactions[currentMember?.id ?? ''] === emoji ? null : emoji).catch(fail);

  return (
    <li className={styles.row} data-mine={mine || undefined} id={`msg-${msg.id}`}>
      {!mine && (showAuthor && author ? <Avatar name={author.displayName} color={author.color} size="sm" /> : <span className={styles.avatarSpace} />)}
      <div className={styles.bubble} data-pending={pending || undefined}>
        {!mine && showAuthor && (
          <span className={styles.author} style={{ color: author ? `var(--member-${author.color})` : undefined }}>
            {author?.displayName ?? '?'}
            {author && !author.active ? ` ${t('message.former')}` : ''}
          </span>
        )}
        {msg.deletedAt ? (
          <span className={styles.deleted}>{t('message.deleted')}</span>
        ) : (
          <>
            {showContext && msg.context && <ContextChip refItem={msg.context} />}
            {msg.replyTo && (
              <button type="button" className={styles.quote} onClick={() => document.getElementById(`msg-${msg.replyTo!.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
                <strong>{msg.replyTo.author}</strong>: {msg.replyTo.snippet}
              </button>
            )}
            {msg.text && (
              <span className={styles.text}>
                <Linkified text={msg.text} />
              </span>
            )}
            {msg.share && <ShareCard refItem={msg.share} />}
            {counts.length > 0 && (
              <div className={styles.reactions}>
                {counts.map((r) => (
                  <button key={r.emoji} type="button" className={styles.reaction} aria-pressed={r.mine} onClick={() => toggle(r.emoji)}>
                    {r.emoji} {r.count}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <span className={styles.meta}>
          {pending ? t('message.sending') : formatTime(msg.createdAt)}
          {msg.editedAt && !msg.deletedAt && ` · ${t('message.edited')}`}
          {!msg.deletedAt && (
            <Menu
              label={t('message.menu')}
              items={[
                { label: t('message.reply'), onSelect: () => onReply(msg) },
                ...REACTIONS.map((emoji) => ({ label: t('message.react', { emoji }), onSelect: () => toggle(emoji) })),
                { label: t('message.edit'), onSelect: () => onEdit(msg), hidden: !mine || !msg.text },
                { label: t('message.delete'), danger: true, onSelect: () => void store.remove(msg).catch(fail), hidden: !mine },
              ]}
            />
          )}
        </span>
      </div>
    </li>
  );
}
