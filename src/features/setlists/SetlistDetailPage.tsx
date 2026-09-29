import { CalendarPlus, Copy, ListMusic, MonitorPlay, Pencil, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatMinutes } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { occurrencePath, occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { occurrenceId } from '@/features/calendar/model';
import { Button, Dialog, EmptyState, Page, TextField } from '@/ui';
import { LinkEventDialog } from './LinkEventDialog';
import { NOTE_MAX, songEntries } from './model';
import { SetlistSheet } from './SetlistSheet';
import { useSetlistMode } from './SetlistModeProvider';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

/** Setlist-Detail (F7 §4.2): read view for everyone, own notes inline. */
export function SetlistDetailPage() {
  const { t } = useTranslation('setlists');
  const { setlistId } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, setlists, state } = useSetlists();
  const { songById, eventsOf, durationOf } = useSetlistInfo();
  const { members } = useSession();
  const mode = useSetlistMode();
  const setlist = setlists.find((s) => s.id === setlistId);
  const [linking, setLinking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    if (setlistId) void store.loadPersonal(setlistId);
  }, [setlistId, store]);

  if (!setlist) return <Page title={t('title')}>{state.status === 'ready' && <EmptyState icon={null} title={t('missingSong')} text="" />}</Page>;
  const personal = state.personal[setlist.id]?.notes ?? {};
  const d = durationOf(setlist);
  const events = eventsOf(setlist.id);

  return (
    <Page title={setlist.name}>
      <p className={styles.meta}>
        {t(`kind.${setlist.kind}`)} · {t('songs', { count: songEntries(setlist).length })} · {formatMinutes(d.totalSeconds / 60)}
        {d.unknown ? ` (${t('unknownDuration')})` : ''}
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon={<ListMusic size={18} />}
          onClick={() => {
            mode.start(setlist.id);
            navigate(`/songs?setlist=${setlist.id}`);
          }}
        >
          {t('actions.practice')}
        </Button>
        <Button icon={<MonitorPlay size={18} />} onClick={() => navigate(`/setlists/${setlist.id}/stage`)}>
          {t('actions.stage')}
        </Button>
        <Button icon={<Printer size={18} />} onClick={() => navigate(`/setlists/${setlist.id}/print`)}>
          {t('actions.print')}
        </Button>
        <Button icon={<Pencil size={18} />} onClick={() => navigate(`/setlists/${setlist.id}/edit`)}>
          {t('actions.edit')}
        </Button>
        <Button
          icon={<Copy size={18} />}
          onClick={() =>
            void store
              .duplicate(setlist.id, t('copyOf', { name: setlist.name }))
              .then((c) => navigate(`/setlists/${c.id}/edit`))
              .catch(() => notify({ message: t('editor.failed') }))
          }
        >
          {t('actions.duplicate')}
        </Button>
        <Button icon={<CalendarPlus size={18} />} onClick={() => setLinking(true)}>
          {t('actions.link')}
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

      <SetlistSheet
        setlist={setlist}
        songById={songById}
        personal={personal}
        onEditPersonal={(entryId) => {
          setText(personal[entryId] ?? '');
          setEditing(entryId);
        }}
      />
      <p className={styles.hint}>{t('myNoteHint')}</p>

      {linking && <LinkEventDialog setlistId={setlist.id} onClose={() => setLinking(false)} />}
      <Dialog open={editing !== null} title={t('myNote')} closeLabel={t('common:actions.close')} onClose={() => setEditing(null)}>
        <form
          style={{ display: 'grid', gap: 'var(--space-3)' }}
          onSubmit={(e) => {
            e.preventDefault();
            const id = editing!;
            setEditing(null);
            void store.savePersonal(setlist.id, { ...personal, [id]: text }).catch(() => notify({ message: t('editor.failed') }));
          }}
        >
          <TextField label={t('myNote')} placeholder={t('myNotePlaceholder')} hint={t('myNoteHint')} value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_MAX} autoFocus />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary">
              {t('common:actions.save')}
            </Button>
          </div>
        </form>
      </Dialog>
    </Page>
  );
}
