import { useTranslation } from 'react-i18next';
import { Chip } from '@/ui';
import { offsetLabel, REMINDER_OFFSETS, type ReminderType } from './reminders';
import styles from './Notifications.module.css';

/** "15 Min. · 30 Min. · … · 1 Woche" as toggle chips (F6 §4.7). */
export function ReminderChips({ label, value, onChange, tone }: { label: string; value: number[]; onChange: (offsets: number[]) => void; tone?: ReminderType }) {
  const { t } = useTranslation('notifications');
  const toggle = (minutes: number) => onChange(value.includes(minutes) ? value.filter((m) => m !== minutes) : [...value, minutes].sort((a, b) => b - a));
  return (
    <div role="group" aria-label={label} className={styles.chips}>
      {REMINDER_OFFSETS.map((minutes) => (
        <Chip key={minutes} tone={tone} pressed={value.includes(minutes)} onClick={() => toggle(minutes)}>
          {offsetLabel(minutes, t)}
        </Chip>
      ))}
    </div>
  );
}
