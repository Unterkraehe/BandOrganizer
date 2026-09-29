import { Check, HelpCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { useCalendar } from './CalendarProvider';
import type { AnswerStatus, Occurrence } from './model';
import styles from './Calendar.module.css';

const ICONS = { yes: Check, maybe: HelpCircle, no: X };

/** ✓ / ? / ✗ – large in the detail, compact on cards (F5 §6.1, F3 §4.1). */
export function AnswerButtons({ occ, current, comment, compact }: { occ: Occurrence; current: AnswerStatus | undefined; comment?: string | null; compact?: boolean }) {
  const { t } = useTranslation('calendar');
  const { store } = useCalendar();
  const notify = useNotify();
  return (
    <div className={compact ? `${styles.answers} ${styles.answersCompact}` : styles.answers} role="group" aria-label={t('answer.yourAnswer')}>
      {(['yes', 'maybe', 'no'] as const).map((status) => {
        const Icon = ICONS[status];
        return (
          <button
            key={status}
            type="button"
            className={styles.answer}
            data-status={status}
            aria-pressed={current === status}
            aria-label={t(`answer.${status}`)}
            title={t(`answer.${status}`)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void store.answer(occ, status, comment ?? null).catch(() => notify({ message: t('form.failed') }));
            }}
          >
            <Icon size={compact ? 16 : 18} aria-hidden="true" />
            {!compact && <span>{t(`answer.${status}Short`)}</span>}
          </button>
        );
      })}
    </div>
  );
}
