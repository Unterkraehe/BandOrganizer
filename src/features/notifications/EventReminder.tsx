import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button, Dialog } from '@/ui';
import type { CalendarEvent } from '@/features/calendar/model';
import { ReminderChips } from './ReminderChips';
import { useReminders } from './ReminderProvider';
import { describeOffsets, offsetsFor } from './reminders';
import styles from './Notifications.module.css';

/**
 * "Meine Erinnerung" on an event (F6 §4.7): one line with the current choice; "Ändern" opens the
 * choices (v0.18.1 – a rarely changed setting doesn't fill the event page, R-UX-09). A series counts as one event.
 */
export function EventReminder({ event }: { event: CalendarEvent }) {
  const { t } = useTranslation('notifications');
  const notify = useNotify();
  const { settings, setEventOffsets } = useReminders();
  const [open, setOpen] = useState(false);
  if (event.type === 'absence') return null;
  const custom = settings.events[event.id] !== undefined;
  const offsets = offsetsFor(settings, event);
  const typeLabel = t(`reminders.types.${event.type}`);
  const save = (next: number[] | null) => void setEventOffsets(event.id, next).catch(() => notify({ message: t('failed') }));
  const summary = `${describeOffsets(offsets, t)} · ${custom ? t('reminders.custom') : t('reminders.default', { type: typeLabel })}`;
  return (
    <section className={styles.reminderLine} aria-label={t('reminders.eventTitle')}>
      <BellRing size={18} aria-hidden="true" />
      <span className={styles.reminderText}>
        <strong>{t('reminders.eventTitle')}</strong>
        <span className={styles.hint}>{summary}</span>
      </span>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-label={`${t('reminders.change')}: ${t('reminders.eventTitle')}`}>
        {t('reminders.change')}
      </Button>
      <Dialog open={open} title={t('reminders.eventTitle')} closeLabel={t('common:actions.close')} onClose={() => setOpen(false)}>
        <p className={styles.hint}>
          {summary}
          {event.recurrence ? ` · ${t('reminders.series')}` : ''}
        </p>
        <ReminderChips label={t('reminders.eventTitle')} tone={event.type} value={offsets} onChange={save} />
        {/* always rendered (disabled when not needed): nothing may jump under the finger (R-UI-11) */}
        <div>
          <Button variant="ghost" disabled={!custom} onClick={() => save(null)}>
            {t('reminders.useDefault', { type: typeLabel })}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
