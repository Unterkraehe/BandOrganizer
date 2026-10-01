import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { newId } from '@/core/data/ids';
import { useSession } from '@/core/session/BandSession';
import { ConflictError } from '@/core/storage';
import { Button, Page, TextArea, TextField } from '@/ui';
import { useCalendar } from './CalendarProvider';
import { occurrencePath, TYPE_ICON_COLOR, TYPE_ICONS } from './format';
import { EVENT_TYPES, WEEKDAYS, type EventType, type Occurrence, type Recurrence, type Weekday } from './model';
import { withRrule } from './recurrence';
import { ScopeDialog } from './ScopeDialog';
import type { EditScope, EventInput } from './store';
import { addDays, fromLocal, toLocal, todayLocal, weekday } from './time';
import styles from './Calendar.module.css';
import { useBack } from '@/ui/layout/navigation';

type RepeatMode = 'never' | 'weekly' | 'biweekly' | 'monthly' | 'monthlyDay' | 'custom';

interface FormState {
  type: EventType;
  title: string;
  date: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  meetingTime: string;
  locationName: string;
  address: string;
  description: string;
  answersEnabled: boolean;
  repeat: RepeatMode;
  interval: number;
  byDay: Weekday[];
  endMode: 'never' | 'until' | 'count';
  until: string;
  count: number;
}

function repeatFrom(r: Recurrence | null): Pick<FormState, 'repeat' | 'interval' | 'byDay' | 'endMode' | 'until' | 'count'> {
  const base = { interval: 1, byDay: [] as Weekday[], endMode: 'never' as const, until: '', count: 10 };
  if (!r) return { ...base, repeat: 'never' };
  const end = r.until ? { endMode: 'until' as const, until: r.until } : r.count ? { endMode: 'count' as const, count: r.count } : {};
  if (r.freq === 'monthly') return { ...base, ...end, repeat: r.monthly === 'day' ? 'monthlyDay' : 'monthly' };
  const custom = (r.byDay?.length ?? 0) > 1 || r.interval > 2;
  return { ...base, ...end, interval: r.interval, byDay: r.byDay ?? [], repeat: custom ? 'custom' : r.interval === 2 ? 'biweekly' : 'weekly' };
}

/** Termin anlegen / bearbeiten (F5 §4.3) with smart defaults (R-UX-05). */
export function EventFormPage() {
  const { t } = useTranslation('calendar');
  const { eventId, occurrence } = useParams();
  const [params] = useSearchParams();
  const { store } = useCalendar();
  const occ = eventId ? store.occurrence(eventId, occurrence ?? 'single') : undefined;
  const presetType = params.get('type') as EventType | null;
  const [type, setType] = useState<EventType | null>(occ?.type ?? (presetType && EVENT_TYPES.includes(presetType) ? presetType : null));

  if (eventId && !occ) return <Page title={t('form.editTitle')}>{null}</Page>;
  if (!type) {
    return (
      <Page title={t('form.newTitle')}>
        <p style={{ fontWeight: 600 }}>{t('form.chooseType')}</p>
        <div className={styles.typeChooser}>
          {EVENT_TYPES.map((ty) => {
            const Icon = TYPE_ICONS[ty];
            return (
              <button key={ty} type="button" className={styles.typeButton} onClick={() => setType(ty)}>
                <Icon size={28} style={{ color: TYPE_ICON_COLOR[ty] }} aria-hidden="true" />
                {t(`types.${ty}`)}
              </button>
            );
          })}
        </div>
      </Page>
    );
  }
  return <EventForm key={type} type={type} occ={occ} date={params.get('date')} />;
}

function EventForm({ type, occ, date: presetDate }: { type: EventType; occ?: Occurrence; date: string | null }) {
  const { t } = useTranslation('calendar');
  const navigate = useNavigate();
  const { goBack } = useBack();
  const notify = useNotify();
  const { store, state } = useCalendar();
  const { currentMember, members } = useSession();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locations = useMemo(
    () => [...new Set(state.events.map((e) => e.value.location?.name).filter((n): n is string => Boolean(n)))].sort(),
    [state.events],
  );

  const [form, setForm] = useState<FormState>(() => {
    const today = todayLocal();
    if (occ) {
      const s = occ.allDay ? { date: occ.startDate, time: '19:00' } : toLocal(occ.start);
      const e = occ.allDay ? { date: occ.endDate, time: '22:00' } : toLocal(occ.end);
      return {
        type,
        title: occ.title ?? '',
        date: s.date,
        endDate: e.date,
        allDay: occ.allDay,
        startTime: s.time,
        endTime: e.time,
        meetingTime: occ.meetingTime ? toLocal(occ.meetingTime).time : '',
        locationName: occ.location?.name ?? '',
        address: occ.location?.address ?? '',
        description: occ.description ?? '',
        answersEnabled: occ.event.answersEnabled,
        ...repeatFrom(occ.event.recurrence),
      };
    }
    // smart defaults (F5 §4.3)
    const base: FormState = {
      type,
      title: '',
      date: presetDate ?? today,
      endDate: presetDate ?? today,
      allDay: type === 'absence',
      startTime: '19:00',
      endTime: '21:00',
      meetingTime: '',
      locationName: '',
      address: '',
      description: '',
      answersEnabled: type === 'gig' || type === 'rehearsal',
      ...repeatFrom(null),
    };
    if (type === 'rehearsal') {
      const last = state.events
        .map((e) => e.value)
        .filter((e) => e.type === 'rehearsal' && !e.deletedAt && !e.allDay)
        .sort((a, b) => b.start.localeCompare(a.start))[0];
      if (last) {
        const s = toLocal(last.start);
        const next = presetDate ?? addDays(today, (weekday(s.date) - weekday(today) + 7) % 7 || 7);
        return { ...base, date: next, endDate: next, startTime: s.time, endTime: toLocal(last.end).time, locationName: last.location?.name ?? '', address: last.location?.address ?? '' };
      }
      return { ...base, endTime: '22:00' };
    }
    if (type === 'gig') {
      const d = presetDate ?? addDays(today, 7);
      return { ...base, date: d, endDate: d, startTime: '20:00', endTime: '23:00', meetingTime: '18:00' };
    }
    return base;
  });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const needsTitle = type === 'gig' || type === 'other';
  const overnight = !form.allDay && form.endTime <= form.startTime;

  const buildInput = (): EventInput => {
    const location = form.locationName.trim() ? { name: form.locationName.trim(), ...(form.address.trim() ? { address: form.address.trim() } : {}) } : null;
    let recurrence: Recurrence | null = null;
    if (form.repeat !== 'never') {
      const r: Omit<Recurrence, 'rrule'> =
        form.repeat === 'monthly' || form.repeat === 'monthlyDay'
          ? { freq: 'monthly', interval: 1, monthly: form.repeat === 'monthlyDay' ? 'day' : 'weekday' }
          : { freq: 'weekly', interval: form.repeat === 'biweekly' ? 2 : form.repeat === 'custom' ? Math.max(1, form.interval) : 1, byDay: form.repeat === 'custom' && form.byDay.length ? form.byDay : undefined };
      if (form.endMode === 'until' && form.until) r.until = form.until;
      if (form.endMode === 'count') r.count = Math.max(1, form.count);
      recurrence = withRrule(r, form.date);
    }
    const common = {
      type,
      title: needsTitle ? form.title.trim() : form.title.trim() || null,
      location: type === 'absence' ? null : location,
      description: form.description.trim() || null,
      recurrence,
      answersEnabled: type === 'absence' ? false : form.answersEnabled,
      memberId: type === 'absence' ? (occ?.event.memberId ?? currentMember?.id ?? null) : null,
    };
    if (form.allDay) return { ...common, allDay: true, start: form.date, end: form.endDate < form.date ? form.date : form.endDate, meetingTime: null };
    const start = fromLocal(form.date, form.startTime);
    const end = fromLocal(overnight ? addDays(form.date, 1) : form.date, form.endTime);
    const meetingTime = type === 'gig' && form.meetingTime ? fromLocal(form.date, form.meetingTime) : null;
    return { ...common, allDay: false, start, end, meetingTime };
  };

  // Optimistic (R-UX-07): the change is visible and the form closes right away; saving continues in
  // the background. If it fails, the change is undone and a message explains it.
  const save = (scope: EditScope = 'all') => {
    setScopeOpen(false);
    setError(null);
    const input = buildInput();
    const failed = (e: unknown) => notify({ message: e instanceof ConflictError ? t('form.conflict') : t('form.failed') });
    if (occ) {
      store.update(occ, input, scope).catch(failed);
      goBack();
    } else {
      const id = newId('e');
      store.create(input, id).catch(failed);
      const first = store.upcoming(1, (o) => o.event.id === id)[0] ?? store.occurrence(id, input.recurrence ? form.date : 'single');
      navigate(first ? occurrencePath(first) : '/calendar', { replace: true });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (needsTitle && !form.title.trim()) return setError(t('form.required'));
    if (form.allDay && form.endDate < form.date) return setError(t('form.endBeforeStart'));
    if (occ?.event.recurrence) setScopeOpen(true);
    else save('all');
  };

  const nth = Math.ceil(Number(form.date.slice(8, 10)) / 7);
  const wd = WEEKDAYS[weekday(form.date)]!;

  return (
    <Page title={occ ? t('form.editTitle') : `${t('form.newTitle')}: ${t(`types.${type}`)}`}>
      <form className={styles.form} onSubmit={submit} noValidate>
        {type === 'absence' && <p className={styles.hint}>{t('form.absenceFor', { name: members.find((m) => m.id === (occ?.event.memberId ?? currentMember?.id))?.displayName ?? '' })}</p>}
        {type !== 'absence' && (
          <TextField label={t('form.title')} optionalLabel={needsTitle ? undefined : t('profile:form.roleOptional')} value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} required={needsTitle} autoFocus={!occ} />
        )}

        {type === 'other' && (
          <label className={styles.checkbox}>
            <input type="checkbox" checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
            {t('form.allDay')}
          </label>
        )}

        {form.allDay ? (
          <div className={styles.row2}>
            <TextField label={t('form.from')} type="date" value={form.date} onChange={(e) => set({ date: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} required />
            <TextField label={t('form.to')} type="date" value={form.endDate} min={form.date} onChange={(e) => set({ endDate: e.target.value })} required />
          </div>
        ) : (
          <>
            <TextField label={t('form.date')} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
            <div className={styles.row2}>
              {type === 'gig' && <TextField label={t('form.meeting')} type="time" value={form.meetingTime} onChange={(e) => set({ meetingTime: e.target.value })} />}
              <TextField label={t('form.start')} type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} required />
              <TextField label={t('form.end')} type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} hint={overnight ? t('form.endNextDay') : undefined} />
            </div>
          </>
        )}

        {type !== 'absence' && (
          <div className={styles.row2}>
            <TextField label={t('form.location')} value={form.locationName} onChange={(e) => set({ locationName: e.target.value })} list="event-locations" maxLength={80} />
            <TextField label={t('form.address')} optionalLabel={t('profile:form.roleOptional')} value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={160} />
            <datalist id="event-locations">
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
        )}

        <TextArea
          label={type === 'rehearsal' ? t('form.focus') : type === 'absence' ? t('form.note') : t('form.description')}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={3}
          maxLength={2000}
        />

        {(
          <fieldset className={styles.fieldset}>
            <legend>{t('recurrence.label')}</legend>
            <select className={styles.select} aria-label={t('recurrence.label')} value={form.repeat} onChange={(e) => set({ repeat: e.target.value as RepeatMode })}>
              <option value="never">{t('recurrence.never')}</option>
              <option value="weekly">{t('recurrence.weekly')}</option>
              <option value="biweekly">{t('recurrence.biweekly')}</option>
              <option value="monthly">{t('recurrence.monthly', { pattern: `${t(`recurrence.nth.${nth}`)} ${t(`weekdays.${wd}`)}` })}</option>
              <option value="monthlyDay">{t('recurrence.monthlyDay', { day: Number(form.date.slice(8, 10)) })}</option>
              <option value="custom">{t('recurrence.custom')}</option>
            </select>
            {form.repeat === 'custom' && (
              <>
                <div className={styles.commentRow} style={{ alignItems: 'center' }}>
                  <span>{t('recurrence.every')}</span>
                  <input className={styles.select} style={{ width: 80 }} type="number" min={1} max={8} value={form.interval} aria-label={t('recurrence.weeks')} onChange={(e) => set({ interval: Number(e.target.value) || 1 })} />
                  <span>{t('recurrence.weeks')}</span>
                </div>
                <div className={styles.weekdayPicker} role="group" aria-label={t('recurrence.on')}>
                  {WEEKDAYS.map((d) => (
                    <label key={d} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={form.byDay.includes(d) || (!form.byDay.length && d === wd)}
                        onChange={(e) => {
                          const current = form.byDay.length ? form.byDay : [wd];
                          set({ byDay: e.target.checked ? [...new Set([...current, d])] : current.filter((x) => x !== d) });
                        }}
                      />
                      {t(`weekdaysShort.${d}`)}
                    </label>
                  ))}
                </div>
              </>
            )}
            {form.repeat !== 'never' && (
              <div className={styles.commentRow} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{t('recurrence.endLabel')}</span>
                <select className={styles.select} aria-label={t('recurrence.endLabel')} value={form.endMode} onChange={(e) => set({ endMode: e.target.value as FormState['endMode'] })}>
                  <option value="never">{t('recurrence.endNever')}</option>
                  <option value="until">{t('recurrence.endOn')}</option>
                  <option value="count">{t('recurrence.endAfter')}</option>
                </select>
                {form.endMode === 'until' && <input className={styles.select} type="date" min={form.date} value={form.until} aria-label={t('recurrence.endOn')} onChange={(e) => set({ until: e.target.value })} />}
                {form.endMode === 'count' && (
                  <>
                    <input className={styles.select} style={{ width: 80 }} type="number" min={1} max={200} value={form.count} aria-label={t('recurrence.times')} onChange={(e) => set({ count: Number(e.target.value) || 1 })} />
                    <span>{t('recurrence.times')}</span>
                  </>
                )}
              </div>
            )}
          </fieldset>
        )}

        {type !== 'absence' && (
          <label className={styles.checkbox}>
            <input type="checkbox" checked={form.answersEnabled} onChange={(e) => set({ answersEnabled: e.target.checked })} />
            {t('form.answers')}
          </label>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" size="lg">
            {t('form.save')}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => goBack()}>
            {t('common:actions.cancel')}
          </Button>
        </div>
      </form>
      <ScopeDialog open={scopeOpen} onClose={() => setScopeOpen(false)} onChoose={(scope) => save(scope)} />
    </Page>
  );
}
