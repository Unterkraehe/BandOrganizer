import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { formatMinutes } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { Button } from '@/ui';
import { SetlistSheet } from './SetlistSheet';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

const MY_NOTES_KEY = 'bandapp.print.myNotes';

/** Print view (F7 §4.5): always black on white, no page break inside a block, own notes optional. */
export function PrintPage() {
  const { t } = useTranslation('setlists');
  const { setlistId } = useParams();
  const navigate = useNavigate();
  const { store, setlists, state } = useSetlists();
  const { songById, eventsOf, durationOf } = useSetlistInfo();
  const { members } = useSession();
  const setlist = setlists.find((s) => s.id === setlistId);
  const [myNotes, setMyNotes] = useState(() => localStorage.getItem(MY_NOTES_KEY) !== '0');

  useEffect(() => {
    if (setlistId) void store.loadPersonal(setlistId);
  }, [setlistId, store]);

  if (!setlist) return null;
  const event = eventsOf(setlist.id).at(-1);

  return (
    <div style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-4)', maxWidth: 820, margin: '0 auto' }}>
      <div className={styles.printControls}>
        <Button variant="ghost" icon={<ArrowLeft size={18} />} onClick={() => navigate(-1)}>
          {t('print.back')}
        </Button>
        <label style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={myNotes}
            onChange={(e) => {
              setMyNotes(e.target.checked);
              localStorage.setItem(MY_NOTES_KEY, e.target.checked ? '1' : '0');
            }}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
          />
          {t('print.myNotes')}
        </label>
        <Button variant="primary" icon={<Printer size={18} />} onClick={() => window.print()}>
          {t('print.button')}
        </Button>
      </div>
      <article className={styles.printPage}>
        <header className={styles.printHead}>
          <h1>{setlist.name}</h1>
          <span>
            {event ? `${occurrenceTitle(event, t, members)} · ${occurrenceWhen(event, t)}${event.location ? ` · ${event.location.name}` : ''}` : ''}
          </span>
          <small>{formatMinutes(durationOf(setlist).totalSeconds / 60)}</small>
        </header>
        <SetlistSheet setlist={setlist} songById={songById} personal={state.personal[setlist.id]?.notes ?? {}} showPersonal={myNotes} />
      </article>
    </div>
  );
}
