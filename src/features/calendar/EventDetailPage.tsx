import { Ban, CalendarPlus, MapPin, Pencil, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatDateWithYear, formatTime } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Avatar, Button, ConfirmDialog, EmptyState, Page, TextField } from '@/ui';
import { AnswerButtons } from './AnswerButtons';
import { useCalendar, useWatchCalendar } from './CalendarProvider';
import { describeRecurrence, occurrenceTitle, occurrenceWhen, TYPE_ICON_COLOR, TYPE_ICONS } from './format';
import { buildIcs, deliverIcs } from './ics';
import { ScopeDialog } from './ScopeDialog';
import type { EditScope } from './store';
import { toLocal } from './time';
import { EventSetlist } from '@/features/setlists/EventSetlist';
import { Discussion } from '@/features/chat/Discussion';
import { EventReminder } from '@/features/notifications/EventReminder';
import { useOccurrenceData } from './useOccurrenceData';
import styles from './Calendar.module.css';

/** Termin-Detail (F5 §4.2). */
export function EventDetailPage() {
  const { t } = useTranslation('calendar');
  const { eventId, occurrence } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, state } = useCalendar();
  useWatchCalendar();
  const { members, currentMember, band } = useSession();
  void state; // re-render on store changes
  const occ = eventId ? store.occurrence(eventId, occurrence ?? 'single') : undefined;
  const dataFor = useOccurrenceData(occ ? [occ] : []);
  const [comment, setComment] = useState<string | null>(null);
  const [scopeFor, setScopeFor] = useState<'cancel' | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'cancel' | null>(null);

  if (!occ) {
    return (
      <Page title={t('title')}>
        <EmptyState icon={null} title={t('detail.notFound')} text="" action={<Button onClick={() => navigate('/calendar')}>{t('detail.toCalendar')}</Button>} />
      </Page>
    );
  }

  const data = dataFor(occ);
  const Icon = TYPE_ICONS[occ.type];
  const title = occurrenceTitle(occ, t, members);
  const name = (id: string | null | undefined) => members.find((m) => m.id === id)?.displayName ?? '?';
  const isAbsence = occ.type === 'absence';
  const mayEdit = !isAbsence || occ.event.memberId === currentMember?.id; // absences: only your own (F5 §6.2)
  const answering = occ.event.answersEnabled && !isAbsence;
  const fail = () => notify({ message: t('form.failed') });

  const doCancel = (scope: EditScope) => {
    setScopeFor(null);
    setConfirm(null);
    void store.cancel(occ, scope, !occ.cancelled).catch(fail);
  };

  const exportOne = () => {
    const exceptions = (state.exceptions[occ.event.id] ?? []).map((x) => x.value);
    const ics = buildIcs([{ event: occ.event, exceptions }], { title: () => title, cancelledPrefix: `${t('cancelledEvent')}: ` }, band?.bandName ?? 'Band');
    void deliverIcs(ics, `${title}.ics`).catch(fail);
  };

  const mapUrl = occ.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([occ.location.name, occ.location.address].filter(Boolean).join(', '))}` : null;

  return (
    <Page title={title}>
      <div className={styles.detailHead}>
        <span className={styles.typeLine} style={{ color: TYPE_ICON_COLOR[occ.type] }}>
          <Icon size={18} aria-hidden="true" />
          {t(`types.${occ.type}`)}
        </span>
        <p className={styles.when}>{occurrenceWhen(occ, t)}</p>
        {occ.meetingTime && <p>{t('meeting', { time: formatTime(occ.meetingTime) })}</p>}
        {occ.event.recurrence && (
          <p className={styles.hint} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Repeat size={16} aria-hidden="true" />
            {describeRecurrence(occ.event.recurrence, occ.event.allDay ? occ.event.start : toLocal(occ.event.start).date, t)}
          </p>
        )}
      </div>

      {occ.cancelled && (
        <p className={styles.banner}>
          {occ.key === 'single' || occ.event.status === 'cancelled' ? t('cancelledEvent') : t('cancelled')}
          {occ.event.cancelledBy && ` · ${t('detail.cancelledBy', { name: name(occ.event.cancelledBy) })}`}
        </p>
      )}

      {occ.location && (
        <div className={styles.section}>
          <p style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
            <MapPin size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 3 }} />
            <span>
              <strong>{occ.location.name}</strong>
              {occ.location.address && <><br />{occ.location.address}</>}
            </span>
          </p>
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
              {t('detail.openMap')}
            </a>
          )}
        </div>
      )}
      {occ.description && <p style={{ whiteSpace: 'pre-wrap' }}>{occ.description}</p>}

      {data.conflicts.length > 0 && (
        <p className={styles.conflict}>{data.conflicts.map((c) => t('conflict', { name: name(c.event.memberId) })).join(' · ')}</p>
      )}

      {answering && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('answer.title')}</h2>
          {!occ.cancelled && (
            <>
              <AnswerButtons occ={occ} current={data.mine?.status} comment={comment ?? data.mine?.comment} />
              {/* below the buttons and always present: nothing above them may appear or disappear when tapping */}
              <p className={styles.conflict} style={{ minHeight: '1.5em' }}>
                {data.review ? t('answer.review') : '\u00a0'}
              </p>
              <div className={styles.commentRow}>
                <TextField
                  label={t('answer.comment')}
                  placeholder={t('answer.commentPlaceholder')}
                  value={comment ?? data.mine?.comment ?? ''}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={200}
                />
                <Button
                  disabled={!data.mine || comment === null}
                  onClick={() =>
                    data.mine &&
                    void store
                      .answer(occ, data.mine.status, comment)
                      .then(() => {
                        setComment(null);
                        notify({ message: t('answer.saved') });
                      })
                      .catch(fail)
                  }
                >
                  {t('answer.saveComment')}
                </Button>
              </div>
            </>
          )}
          <div className={styles.groups}>
            {(['yes', 'maybe', 'no', 'absent', 'open'] as const).map((group) =>
              data.summary[group].length ? (
                <div key={group} className={styles.group}>
                  <span className={styles.groupTitle}>
                    {t(`answer.groups.${group}`)} ({data.summary[group].length})
                  </span>
                  <ul className={styles.people}>
                    {data.summary[group].map((m) => {
                      const answer = data.summary.byMember.get(m.id);
                      return (
                        <li key={m.id} className={styles.person}>
                          <Avatar name={m.displayName} color={m.color} size="sm" />
                          <span>
                            {m.displayName}
                            {answer?.comment && <small> – {answer.comment}</small>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </section>
      )}

      {!isAbsence && !occ.cancelled && <EventReminder event={occ.event} />}
      {!isAbsence && <EventSetlist occ={occ} title={title} />}
      {!isAbsence && <Discussion context={{ type: 'event', id: occ.event.id, occurrence: occ.key }} />}

      <div className={styles.actions}>
        {mayEdit && (
          <Button icon={<Pencil size={18} />} onClick={() => navigate(`/calendar/${occ.event.id}${occurrence ? `/${occurrence}` : ''}/edit`)}>
            {t('detail.edit')}
          </Button>
        )}
        <Button icon={<CalendarPlus size={18} />} onClick={exportOne}>
          {t('detail.addToCalendar')}
        </Button>
        {mayEdit && (
          <Button
            icon={occ.cancelled ? <RotateCcw size={18} /> : <Ban size={18} />}
            onClick={() => (occ.event.recurrence ? setScopeFor('cancel') : occ.cancelled ? doCancel('all') : setConfirm('cancel'))}
          >
            {occ.cancelled ? t('detail.uncancel') : t('detail.cancel')}
          </Button>
        )}
        {mayEdit && (
          <Button variant="danger" icon={<Trash2 size={18} />} onClick={() => setConfirm('delete')}>
            {t('detail.delete')}
          </Button>
        )}
      </div>
      {!mayEdit && <p className={styles.hint}>{t('detail.own')}</p>}
      <p className={styles.hint}>
        {t('detail.createdBy', { name: name(occ.event.createdBy) })}
        {occ.event.updatedAt !== occ.event.createdAt &&
          ` · ${t('detail.updatedBy', { name: name(occ.event.updatedBy), date: formatDateWithYear(occ.event.updatedAt) })}`}
      </p>

      <ScopeDialog open={scopeFor !== null} onClose={() => setScopeFor(null)} onChoose={doCancel} />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={t('detail.cancelConfirmTitle')}
        text={t('detail.cancelConfirm')}
        confirmLabel={t('detail.cancel')}
        cancelLabel={t('common:actions.cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => doCancel('all')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={t('detail.deleteConfirmTitle')}
        text={t('detail.deleteConfirm')}
        confirmLabel={t('detail.delete')}
        cancelLabel={t('common:actions.cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          const id = occ.event.id;
          void store
            .remove(id)
            .then(() => {
              notify({ message: t('detail.deleted'), actionLabel: t('songs:undo'), onAction: () => void store.restore(id).catch(fail) });
              navigate('/calendar', { replace: true });
            })
            .catch(fail);
        }}
      />
    </Page>
  );
}
