import { BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button } from '@/ui';
import type { CalendarEvent } from '@/features/calendar/model';
import { ReminderChips } from './ReminderChips';
import { useReminders } from './ReminderProvider';
import { describeOffsets, offsetsFor } from './reminders';
import styles from './Notifications.module.css';

/** "Meine Erinnerung" on an event: your own reminder for this event (a series counts as one) (F6 §4.7). */
export function EventReminder({ event }: { event: CalendarEvent }) {
  const { t } = useTranslation('notifications');
  const notify = useNotify();
  const { settings, setEventOffsets } = useReminders();
  if (event.type === 'absence') return null;
  const custom = settings.events[event.id] !== undefined;
  const offsets = offsetsFor(settings, event);
  const typeLabel = t(`reminders.types.${event.type}`);
  const save = (next: number[] | null) => void setEventOffsets(event.id, next).catch(() => notify({ message: t('failed') }));
  return (
    <section className={styles.box} aria-labelledby="event-reminder">
      <h2 id="event-reminder" className={styles.eventTitle}>
        <BellRing size={18} aria-hidden="true" />
        {t('reminders.eventTitle')}
      </h2>
      <p className={styles.hint}>
        {describeOffsets(offsets, t)}
        {' · '}
        {custom ? t('reminders.custom') : t('reminders.default', { type: typeLabel })}
        {event.recurrence ? ` · ${t('reminders.series')}` : ''}
      </p>
      <ReminderChips label={t('reminders.eventTitle')} tone={event.type} value={offsets} onChange={save} />
      {/* always rendered (disabled when not needed): nothing may jump under the finger (R-UI-11) */}
      <div>
        <Button variant="ghost" disabled={!custom} onClick={() => save(null)}>
          {t('reminders.useDefault', { type: typeLabel })}
        </Button>
      </div>
    </section>
  );
}
