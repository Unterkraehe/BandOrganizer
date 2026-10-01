import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button, Dialog } from '@/ui';
import { ReminderChips } from './ReminderChips';
import { useReminders } from './ReminderProvider';
import { describeOffsets, REMINDER_TYPES, type ReminderType } from './reminders';
import styles from './Notifications.module.css';

/**
 * Einstellungen → Benachrichtigungen → "Erinnerungen an Termine": your defaults per event type (F6 §4.7).
 * One line per type; "Ändern" opens the choices (v0.18.1, R-UX-09).
 */
export function ReminderSettings() {
  const { t } = useTranslation('notifications');
  const notify = useNotify();
  const { settings, setDefaults } = useReminders();
  const [editing, setEditing] = useState<ReminderType | null>(null);
  const label = (type: ReminderType) => t(`reminders.types.${type}`);
  return (
    <div className={styles.group}>
      <strong>{t('reminders.title')}</strong>
      <p className={styles.hint}>{t('reminders.intro')}</p>
      {REMINDER_TYPES.map((type) => (
        <div key={type} className={styles.reminderLine}>
          <span className={styles.reminderText}>
            <strong>{label(type)}</strong>
            <span className={styles.hint}>{describeOffsets(settings.defaults[type], t)}</span>
          </span>
          <Button variant="ghost" onClick={() => setEditing(type)} aria-label={`${t('reminders.change')}: ${label(type)}`}>
            {t('reminders.change')}
          </Button>
        </div>
      ))}
      <p className={styles.hint}>{t('reminders.rules')}</p>
      <Dialog open={editing !== null} title={editing ? t('reminders.typeLabel', { type: label(editing) }) : ''} closeLabel={t('common:actions.close')} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <p className={styles.hint}>{describeOffsets(settings.defaults[editing], t)}</p>
            <ReminderChips
              label={t('reminders.typeLabel', { type: label(editing) })}
              tone={editing}
              value={settings.defaults[editing]}
              onChange={(offsets) => void setDefaults(editing, offsets).catch(() => notify({ message: t('failed') }))}
            />
          </>
        )}
      </Dialog>
    </div>
  );
}
