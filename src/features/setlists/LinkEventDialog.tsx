import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { useSession } from '@/core/session/BandSession';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { occurrenceId } from '@/features/calendar/model';
import { Dialog } from '@/ui';
import styles from './Setlists.module.css';

/** "Mit Termin verknüpfen" (F7 §5): upcoming gigs, rehearsals and other events, soonest first. */
export function LinkEventDialog({ setlistId, onClose }: { setlistId: string; onClose: () => void }) {
  const { t } = useTranslation('setlists');
  const notify = useNotify();
  const { store } = useCalendar();
  const { members } = useSession();
  const upcoming = store.upcoming(30, (o) => o.type !== 'absence' && !o.cancelled);
  return (
    <Dialog open title={t('link.title')} closeLabel={t('common:actions.close')} onClose={onClose}>
      {upcoming.length === 0 && <p className={styles.hint}>{t('link.none')}</p>}
      <ul className={styles.pickList}>
        {upcoming.map((o) => (
          <li key={occurrenceId(o)}>
            <button
              type="button"
              className={styles.rowLink}
              style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => {
                onClose();
                const title = occurrenceTitle(o, t, members);
                void store
                  .setSetlist(o, setlistId)
                  .then(() => notify({ message: t('link.done', { event: title }) }))
                  .catch(() => notify({ message: t('editor.failed') }));
              }}
            >
              <span className={styles.rowTitle}>
                {occurrenceTitle(o, t, members)}
                {o.setlistId && o.setlistId !== setlistId ? ' *' : ''}
              </span>
              <span className={styles.meta}>{occurrenceWhen(o, t)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
