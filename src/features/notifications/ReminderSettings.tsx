import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { ReminderChips } from './ReminderChips';
import { useReminders } from './ReminderProvider';
import { describeOffsets, REMINDER_TYPES } from './reminders';
import styles from './Notifications.module.css';

/** Einstellungen → Benachrichtigungen → "Erinnerungen an Termine": your defaults per event type (F6 §4.7). */
export function ReminderSettings() {
  const { t } = useTranslation('notifications');
  const notify = useNotify();
  const { settings, setDefaults } = useReminders();
  return (
    <div className={styles.box}>
      <strong>{t('reminders.title')}</strong>
      <p className={styles.hint}>{t('reminders.intro')}</p>
      {REMINDER_TYPES.map((type) => {
        const label = t(`reminders.types.${type}`);
        return (
          <div key={type} className={styles.reminderType}>
            <span className={styles.reminderLabel}>
              {label}
              <span className={styles.hint}> – {describeOffsets(settings.defaults[type], t)}</span>
            </span>
            <ReminderChips
              label={t('reminders.typeLabel', { type: label })}
              tone={type}
              value={settings.defaults[type]}
              onChange={(offsets) => void setDefaults(type, offsets).catch(() => notify({ message: t('failed') }))}
            />
          </div>
        );
      })}
      <p className={styles.hint}>{t('reminders.rules')}</p>
    </div>
  );
}
