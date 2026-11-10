import { CalendarPlus, Copy, ListMusic, MonitorPlay, Pencil, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatMinutes } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { occurrencePath, occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { occurrenceId } from '@/features/calendar/model';
import { usePlayerSelect } from '@/core/audio/PlayerProvider';
import { Button, EmptyState, IconButton, Menu, Page, type MenuItem } from '@/ui';
import { Discussion } from '@/features/chat/Discussion';
import { LinkEventDialog } from './LinkEventDialog';
import { songEntries } from './model';
import { SetlistList } from './SetlistList';
import { useSetlistMode, useStartSetlist } from './SetlistModeProvider';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

/**
 * Setlist page (F7 §4.2): the one setlist screen every entry point opens (v0.18.0). Since v1.2.0 the list
 * itself is playable (`SetlistList`): a tap on a song plays the setlist from there.
 */
export function SetlistDetailPage() {
  const { t } = useTranslation('setlists');
  const { setlistId } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, setlists, state } = useSetlists();
  const { eventsOf, durationOf } = useSetlistInfo();
  const { members } = useSession();
  const startSetlist = useStartSetlist();
  const setlist = setlists.find((s) => s.id === setlistId);
  const [linking, setLinking] = useState(false);
  const mode = useSetlistMode();
  const player = usePlayerSelect((s) => ({ songId: s.track?.songId, status: s.status }));

  if (!setlist)
    return (
      <Page title={t('title')}>
        {state.status === 'loading' && <p className={styles.hint}>{t('loading')}</p>}
        {state.status !== 'loading' && (
          <EmptyState icon={null} title={t('notFound')} text="" action={<Button onClick={() => navigate('/setlists')}>{t('toList')}</Button>} />
        )}
      </Page>
    );
  const d = durationOf(setlist);
  const events = eventsOf(setlist.id);

  // this setlist is already running: the button continues where it is instead of starting at song 1
  const active = mode.setlist?.id === setlist.id;
  const resume = () => {
    const item = mode.queue[mode.index];
    if (!item?.song || !item.playable) return startSetlist(setlist.id);
    const running = player.songId === item.song.id && (player.status === 'playing' || player.status === 'loading');
    if (!running) mode.startAndPlay(setlist.id, item.entry.id);
    navigate(`/songs/${encodeURIComponent(item.song.id)}`);
  };

  const menu: MenuItem[] = [
    { label: t('actions.print'), icon: <Printer size={18} />, onSelect: () => navigate(`/setlists/${setlist.id}/print`) },
    {
      label: t('actions.duplicate'),
      icon: <Copy size={18} />,
      onSelect: () =>
        void store
          .duplicate(setlist.id, t('copyOf', { name: setlist.name }))
          .then((c) => navigate(`/setlists/${c.id}/edit`, { state: { created: true } }))
          .catch(() => notify({ message: t('editor.failed') })),
    },
    { label: t('actions.link'), icon: <CalendarPlus size={18} />, onSelect: () => setLinking(true) },
  ];

  return (
    <Page
      title={setlist.name}
      titleBelow
      actions={
        <>
          <IconButton label={t('actions.edit')} icon={<Pencil size={20} />} onClick={() => navigate(`/setlists/${setlist.id}/edit`)} />
          <Menu label={t('actions.menu', { name: setlist.name })} items={menu} />
        </>
      }
    >
      <p className={styles.meta}>
        {t(`kind.${setlist.kind}`)} · {t('songs', { count: songEntries(setlist).length })} · {formatMinutes(d.totalSeconds / 60)}
        {d.unknown ? ` (${t('unknownDuration')})` : ''}
      </p>
      {/* one action pair like the song page (R-UX-09); edit in the top bar, the rest in ⋯ */}
      <div className={styles.playRow}>
        <Button variant="primary" size="lg" icon={<ListMusic size={18} />} onClick={active ? resume : () => startSetlist(setlist.id)}>
          {active ? t('actions.resume') : t('actions.play')}
        </Button>
        <Button size="lg" icon={<MonitorPlay size={18} />} onClick={() => navigate(`/setlists/${setlist.id}/stage`)}>
          {t('actions.stage')}
        </Button>
      </div>

      <section className={styles.group}>
        <h2 className={styles.groupTitle}>{t('linkedTo')}</h2>
        {events.length === 0 ? (
          <p className={styles.hint}>{t('noEvent')}</p>
        ) : (
          <ul className={styles.list}>
            {events.map((o) => (
              <li key={occurrenceId(o)}>
                <Link to={occurrencePath(o)}>
                  {occurrenceTitle(o, t, members)} · {occurrenceWhen(o, t)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SetlistList setlist={setlist} />
      <Discussion context={{ type: 'setlist', id: setlist.id }} />

      {linking && <LinkEventDialog setlistId={setlist.id} onClose={() => setLinking(false)} />}
    </Page>
  );
}
