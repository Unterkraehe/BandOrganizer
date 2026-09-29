import { CalendarDays, ListMusic, Music, Paperclip, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemRef } from '@/core/events';
import { matchesQuery } from '@/core/search/normalize';
import { useSession } from '@/core/session/BandSession';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { useSetlists } from '@/features/setlists/SetlistProvider';
import { useLibrary } from '@/features/songs/LibraryProvider';
import { sortSongs } from '@/features/songs/model';
import { Dialog, IconButton, Menu } from '@/ui';
import { useMediaQuery } from '@/ui/useMediaQuery';
import { useChat } from './ChatProvider';
import { ContextChip } from './MessageItem';
import { MESSAGE_MAX, type ChatMessage } from './model';
import styles from './Chat.module.css';

interface ComposerProps {
  context?: ItemRef | null;
  placeholder?: string;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onDone: () => void;
  onSent?: () => void;
}

/** Input bar (F6 §3.1): multi-line, share song/event/setlist, reply/edit, Enter sends on desktop. */
export function Composer({ context, placeholder, replyTo, editing, onDone, onSent }: ComposerProps) {
  const { t } = useTranslation('chat');
  const { store } = useChat();
  const { members } = useSession();
  const [text, setText] = useState('');
  const [share, setShare] = useState<ItemRef | null>(null);
  const [picker, setPicker] = useState<ItemRef['type'] | null>(null);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const finePointer = useMediaQuery('(pointer: fine)');

  useEffect(() => {
    if (editing) {
      setText(editing.text);
      input.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text]);

  const send = async () => {
    const value = text.trim();
    if (!value && !share) return;
    setFailed(false);
    try {
      if (editing) await store.edit(editing, value);
      else {
        const author = replyTo ? (members.find((m) => m.id === replyTo.createdBy)?.displayName ?? '?') : '';
        await store.send(value, {
          context: context ?? null,
          share,
          replyTo: replyTo ? { id: replyTo.id, author, snippet: (replyTo.text || '…').slice(0, 80) } : null,
        });
      }
      setText('');
      setShare(null);
      onDone();
      onSent?.();
    } catch {
      setFailed(true);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (finePointer && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className={styles.composer}>
      {(replyTo || editing) && (
        <div className={styles.pending}>
          <span>{editing ? t('message.editing') : t('message.replyingTo', { name: members.find((m) => m.id === replyTo!.createdBy)?.displayName ?? '?' })}: {(editing ?? replyTo)!.text}</span>
          <IconButton label={editing ? t('message.cancelEdit') : t('message.cancelReply')} icon={<X size={16} />} onClick={() => { setText(''); onDone(); }} />
        </div>
      )}
      {share && (
        <div className={styles.pending}>
          <span>
            <ContextChip refItem={share} />
          </span>
          <IconButton label={t('share.remove')} icon={<X size={16} />} onClick={() => setShare(null)} />
        </div>
      )}
      {failed && <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">{t('message.failed')}</p>}
      <div className={styles.composerRow}>
        {!editing && (
          <Menu
            label={t('share.menu')}
            icon={<Paperclip size={20} />}
            items={[
              { label: t('share.song'), icon: <Music size={18} />, onSelect: () => setPicker('song') },
              { label: t('share.event'), icon: <CalendarDays size={18} />, onSelect: () => setPicker('event') },
              { label: t('share.setlist'), icon: <ListMusic size={18} />, onSelect: () => setPicker('setlist') },
            ]}
          />
        )}
        <textarea
          ref={input}
          className={styles.input}
          rows={1}
          value={text}
          maxLength={MESSAGE_MAX}
          placeholder={placeholder ?? t('inputPlaceholder')}
          aria-label={placeholder ?? t('inputPlaceholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="button" className={styles.sendButton} aria-label={t('send')} disabled={!text.trim() && !share} onClick={() => void send()}>
          <Send size={20} />
        </button>
      </div>
      {picker && <SharePicker type={picker} onPick={(ref) => { setShare(ref); setPicker(null); }} onClose={() => setPicker(null)} />}
    </div>
  );
}

function SharePicker({ type, onPick, onClose }: { type: ItemRef['type']; onPick: (ref: ItemRef) => void; onClose: () => void }) {
  const { t } = useTranslation('chat');
  const [query, setQuery] = useState('');
  const { songs } = useLibrary();
  const { store: calendar } = useCalendar();
  const { setlists } = useSetlists();
  const { members } = useSession();
  const items: { ref: ItemRef; title: string; sub: string }[] =
    type === 'song'
      ? sortSongs(songs.filter((s) => !s.hidden), 'az').map((s) => ({ ref: { type: 'song', id: s.id }, title: s.title, sub: s.recording?.folder ?? '' }))
      : type === 'setlist'
        ? [...setlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((s) => ({ ref: { type: 'setlist', id: s.id }, title: s.name, sub: '' }))
        : calendar.upcoming(40, (o) => o.type !== 'absence').map((o) => ({ ref: { type: 'event', id: o.event.id, occurrence: o.key }, title: occurrenceTitle(o, t, members), sub: occurrenceWhen(o, t) }));
  const visible = items.filter((i) => matchesQuery(`${i.title} ${i.sub}`, query));
  const title = type === 'song' ? t('share.pickSong') : type === 'event' ? t('share.pickEvent') : t('share.pickSetlist');
  return (
    <Dialog open title={title} closeLabel={t('common:actions.close')} onClose={onClose}>
      <input className={styles.input} type="search" placeholder={t('songs:search')} aria-label={t('songs:search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className={styles.pickList}>
        {visible.map((i) => (
          <li key={`${i.ref.id}-${i.ref.occurrence ?? ''}`}>
            <button type="button" onClick={() => onPick(i.ref)}>
              <strong>{i.title}</strong>
              {i.sub && <span className={styles.cardSub}>{i.sub}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
