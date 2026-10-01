import { ListMusic, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useStartSetlist } from '@/features/setlists/SetlistModeProvider';
import { useSetlists } from '@/features/setlists/SetlistProvider';
import { Button } from '@/ui';
import { formatTime } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { AnswerButtons } from './AnswerButtons';
import { occurrencePath, occurrenceTitle, occurrenceWhen, TYPE_ICON_COLOR, TYPE_ICONS } from './format';
import { occurrenceId, type Occurrence } from './model';
import type { useOccurrenceData } from './useOccurrenceData';
import styles from './Calendar.module.css';

/** Event card for lists and the start screen (F5 §4.1, F3 §4.1). */
export function EventCard({ occ, data }: { occ: Occurrence; data: ReturnType<ReturnType<typeof useOccurrenceData>> }) {
  const { t } = useTranslation('calendar');
  const { members } = useSession();
  const startSetlist = useStartSetlist();
  const { setlists } = useSetlists();
  const setlist = occ.setlistId ? setlists.find((s) => s.id === occ.setlistId) : undefined;
  const Icon = TYPE_ICONS[occ.type];
  const { summary, mine, review, conflicts, absentMe } = data;
  const answering = occ.event.answersEnabled && occ.type !== 'absence' && !occ.cancelled;
  return (
    <li className={styles.card} data-cancelled={occ.cancelled || undefined} data-type={occ.type} id={occurrenceId(occ)}>
      <Link to={occurrencePath(occ)} className={styles.cardLink}>
        <span className={styles.typeIcon} style={{ color: TYPE_ICON_COLOR[occ.type] }} aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>
            {occurrenceTitle(occ, t, members)}
            {occ.event.recurrence && <Repeat size={14} aria-label={t('recurring')} className={styles.muted} />}
            {occ.cancelled && <span className={styles.cancelBadge}>{occ.key === 'single' ? t('cancelledEvent') : t('cancelled')}</span>}
          </span>
          <span className={styles.cardMeta}>
            {occurrenceWhen(occ, t)}
            {occ.meetingTime && ` · ${t('meeting', { time: formatTime(occ.meetingTime) })}`}
          </span>
          {occ.location && <span className={styles.cardMeta}>{occ.location.name}</span>}
          {conflicts.length > 0 && (
            <span className={styles.conflict}>
              {conflicts.map((c) => t('conflict', { name: members.find((m) => m.id === c.event.memberId)?.displayName ?? '?' })).join(' · ')}
            </span>
          )}
          {answering && (
            <>
              <span className={`${styles.cardMeta} ${styles.oneLine}`}>
                {t('answer.summary', { yes: summary.yes.length, maybe: summary.maybe.length, no: summary.no.length, open: summary.open.length })}
              </span>
              {/* Always one line (blank when nothing to say): the answer buttons below must not move after tapping */}
              <span className={`${styles.cardMeta} ${styles.missing} ${styles.oneLine}`}>
                <strong>
                  {review ? t('answer.review') : !mine && !absentMe ? t('answer.missing') : mine?.status === 'maybe' ? t('answer.unsure') : '\u00a0'}
                </strong>
              </span>
            </>
          )}
        </span>
      </Link>
      {(answering || (setlist && !occ.cancelled)) && (
        <div className={styles.cardAnswers} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
          {answering && <AnswerButtons occ={occ} current={mine?.status} comment={mine?.comment} compact />}
          {setlist && !occ.cancelled && (
            <Button
              variant="primary"
              icon={<ListMusic size={16} />}
              onClick={() => startSetlist(setlist.id)}
            >
              {t('setlists:actions.practice')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
