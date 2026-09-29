import { Plane, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@/core/session/BandSession';
import { Button, EmptyState } from '@/ui';
import { useCalendar } from './CalendarProvider';
import { EventCard } from './EventCard';
import { occurrencePath, occurrenceTitle, occurrenceWhen } from './format';
import { occurrenceId } from './model';
import { addDays, todayLocal } from './time';
import { useOccurrenceData } from './useOccurrenceData';
import styles from './Calendar.module.css';

/** Start screen "Nächste Termine" (F3 §4.1): next 5 events (no time limit) + relevant absences. */
export function EventsWidget() {
  const { t } = useTranslation('calendar');
  const navigate = useNavigate();
  const { store, state } = useCalendar();
  const { members } = useSession();
  const next = useMemo(() => store.upcoming(5, (o) => o.type !== 'absence'), [store, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const absences = useMemo(() => {
    const today = todayLocal();
    const soon = addDays(today, 14);
    return store
      .upcoming(20, (o) => o.type === 'absence' && !o.cancelled)
      .filter((a) => a.startDate <= soon || next.some((o) => a.startDate <= o.endDate && a.endDate >= o.startDate));
  }, [store, state, next]); // eslint-disable-line react-hooks/exhaustive-deps
  const dataFor = useOccurrenceData(next);

  return (
    <section className={styles.section} aria-labelledby="events-widget">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <h2 id="events-widget" className={styles.sectionTitle}>
          {t('widget.title')}
        </h2>
        <Link to="/calendar" style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
          {t('widget.all')}
        </Link>
      </div>
      {absences.length > 0 && (
        <ul className={styles.list}>
          {absences.map((a) => (
            <li key={occurrenceId(a)}>
              <Link to={occurrencePath(a)} className={styles.hint} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', textDecoration: 'none' }}>
                <Plane size={16} aria-hidden="true" />
                {occurrenceTitle(a, t, members)} · {occurrenceWhen(a, t)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {next.length === 0 ? (
        state.status !== 'loading' && (
          <EmptyState
            icon={null}
            title={t('empty')}
            text={t('emptyText')}
            action={
              <Button icon={<Plus size={18} />} onClick={() => navigate('/calendar/new')}>
                {t('new')}
              </Button>
            }
          />
        )
      ) : (
        <ul className={styles.list}>
          {next.map((o) => (
            <EventCard key={occurrenceId(o)} occ={o} data={dataFor(o)} />
          ))}
        </ul>
      )}
    </section>
  );
}
