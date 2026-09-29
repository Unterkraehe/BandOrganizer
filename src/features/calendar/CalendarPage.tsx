import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatDate } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Button, Chip, EmptyState, IconButton, Menu, Page, SegmentedControl } from '@/ui';
import { useIsWide } from '@/ui/useMediaQuery';
import { useCalendar } from './CalendarProvider';
import { EventCard } from './EventCard';
import { occurrenceTitle, TYPE_ICON_COLOR } from './format';
import { buildIcs, deliverIcs } from './ics';
import { EVENT_TYPES, occurrenceId, type EventType, type Occurrence } from './model';
import { addDays, addMonths, todayLocal, weekday } from './time';
import { useOccurrenceData } from './useOccurrenceData';
import styles from './Calendar.module.css';

const VIEW_KEY = 'bandapp.calendar.view';
type View = 'list' | 'month';

/** Kalender (F5 §4.1): list ("Demnächst") or month grid, type filters, past events. */
export function CalendarPage() {
  const { t } = useTranslation('calendar');
  const navigate = useNavigate();
  const notify = useNotify();
  const wide = useIsWide();
  const { store, state } = useCalendar();
  const { band } = useSession();
  const [view, setViewState] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View | null) ?? (wide ? 'month' : 'list'));
  const [types, setTypes] = useState<Set<EventType>>(new Set(EVENT_TYPES));
  const [showPast, setShowPast] = useState(false);
  const today = todayLocal();

  const setView = (v: View) => {
    setViewState(v);
    localStorage.setItem(VIEW_KEY, v);
  };
  const toggleType = (type: EventType) =>
    setTypes((s) => {
      const next = new Set(s);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next.size ? next : new Set(EVENT_TYPES);
    });

  const exportAll = () => {
    const ics = buildIcs(
      state.events.map((e) => ({ event: e.value, exceptions: (state.exceptions[e.value.id] ?? []).map((x) => x.value) })),
      { title: (event) => event.title?.trim() || t(`types.${event.type}`), cancelledPrefix: `${t('cancelledEvent')}: ` },
      band?.bandName ?? 'Band',
    );
    void deliverIcs(ics, `${band?.bandName ?? 'Band'}-Termine.ics`).catch(() => notify({ message: t('form.failed') }));
  };

  return (
    <Page
      title={t('title')}
      actions={
        <>
          <Menu label={t('menu')} items={[{ label: t('exportAll'), onSelect: exportAll }]} />
          <Button variant="primary" icon={<Plus size={18} />} iconOnlyOnPhone onClick={() => navigate('/calendar/new')}>
            {t('new')}
          </Button>
        </>
      }
    >
      <div className={styles.tools} style={{ display: 'grid' }}>
        <SegmentedControl
          label={t('view.label')}
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: t('view.list') },
            { value: 'month', label: t('view.month') },
          ]}
        />
        <div className={styles.filterRow} role="group" aria-label={t('filter')}>
          {EVENT_TYPES.map((type) => (
            <Chip key={type} pressed={types.has(type)} tone={type} onClick={() => toggleType(type)}>
              {t(`types.${type}`)}
            </Chip>
          ))}
        </div>
      </div>

      {state.status === 'error' && <EmptyState icon={null} title={t('loadError')} text="" />}
      {view === 'list' ? (
        <ListView types={types} showPast={showPast} setShowPast={setShowPast} today={today} />
      ) : (
        <MonthView types={types} today={today} />
      )}
      {state.status === 'ready' && store.upcoming(1).length === 0 && view === 'list' && (
        <EmptyState
          icon={null}
          title={t('empty')}
          text={t('emptyText')}
          action={
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate('/calendar/new')}>
              {t('new')}
            </Button>
          }
        />
      )}
    </Page>
  );
}

function groupByMonth(occs: Occurrence[]) {
  const groups = new Map<string, Occurrence[]>();
  for (const o of occs) {
    const key = o.startDate.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups];
}

const monthName = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLabel = (ym: string) => monthName.format(new Date(`${ym}-15T12:00:00Z`));

function ListView({ types, showPast, setShowPast, today }: { types: Set<EventType>; showPast: boolean; setShowPast: (v: boolean) => void; today: string }) {
  const { t } = useTranslation('calendar');
  const { store, state } = useCalendar();
  const upcoming = useMemo(
    () => store.occurrences(today, addDays(today, 365)).filter((o) => types.has(o.type) && o.endDate >= today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, state, types, today],
  );
  const past = useMemo(
    () => (showPast ? store.occurrences(addDays(today, -365), addDays(today, -1)).filter((o) => types.has(o.type) && o.endDate < today).reverse() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, state, types, today, showPast],
  );
  const dataFor = useOccurrenceData([...upcoming, ...past]);
  const render = (list: Occurrence[]) =>
    groupByMonth(list).map(([ym, occs]) => (
      <section key={ym} className={styles.month}>
        <h2 className={styles.monthTitle}>{monthLabel(ym)}</h2>
        <ul className={styles.list}>
          {occs.map((o) => (
            <EventCard key={occurrenceId(o)} occ={o} data={dataFor(o)} />
          ))}
        </ul>
      </section>
    ));
  return (
    <>
      {state.status === 'loading' && upcoming.length === 0 && <p className={styles.hint}>{t('loading')}</p>}
      {render(upcoming)}
      <div>
        <Button variant="ghost" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}>
          {showPast ? t('hidePast') : t('past')}
        </Button>
      </div>
      {showPast && render(past)}
    </>
  );
}

function MonthView({ types, today }: { types: Set<EventType>; today: string }) {
  const { t } = useTranslation('calendar');
  const navigate = useNavigate();
  const { store, state } = useCalendar();
  const { members } = useSession();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? today.slice(0, 7);
  const selected = params.get('day') ?? today;
  const first = `${month}-01`;
  const gridStart = addDays(first, -weekday(first));
  const cells = 42; // always six weeks: the calendar keeps its height when switching months
  const days = Array.from({ length: cells }, (_, i) => addDays(gridStart, i));
  const occs = useMemo(
    () => store.occurrences(days[0]!, days[days.length - 1]!).filter((o) => types.has(o.type)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, state, types, month],
  );
  const onDay = (d: string) => occs.filter((o) => o.startDate <= d && o.endDate >= d);
  const selectedOccs = onDay(selected);
  const dataFor = useOccurrenceData(selectedOccs);
  const go = (patch: Record<string, string>) => setParams({ month, day: selected, ...patch }, { replace: true });

  return (
    <>
      <div className={styles.monthNav}>
        <IconButton label={t('prevMonth')} icon={<ChevronLeft size={20} />} onClick={() => go({ month: addMonths(first, -1).slice(0, 7) })} />
        <h2 className={styles.monthTitle}>{monthLabel(month)}</h2>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <Button variant="ghost" onClick={() => go({ month: today.slice(0, 7), day: today })}>
            {t('today')}
          </Button>
          <IconButton label={t('nextMonth')} icon={<ChevronRight size={20} />} onClick={() => go({ month: addMonths(first, 1).slice(0, 7) })} />
        </div>
      </div>
      <div className={styles.grid} role="grid" aria-label={monthLabel(month)}>
        {(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const).map((d) => (
          <div key={d} className={styles.dow} role="columnheader">
            {t(`weekdaysShort.${d}`)}
          </div>
        ))}
        {days.map((d) => {
          const list = onDay(d);
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              className={styles.day}
              data-other={d.slice(0, 7) !== month || undefined}
              data-today={d === today || undefined}
              data-selected={d === selected || undefined}
              aria-label={`${formatDate(`${d}T12:00:00Z`)}${list.length ? `, ${list.length}` : ''}`}
              onClick={() => go({ day: d, month: d.slice(0, 7) })}
            >
              <span className={styles.dayNumber}>{Number(d.slice(8))}</span>
              {list.slice(0, 3).map((o) => (
                <span key={occurrenceId(o)} aria-hidden="true">
                  <span className={styles.dot} style={{ background: TYPE_ICON_COLOR[o.type], opacity: o.cancelled ? 0.4 : 1 }} />
                  <span className={styles.chip} style={{ background: TYPE_ICON_COLOR[o.type], textDecoration: o.cancelled ? 'line-through' : undefined }}>
                    {occurrenceTitle(o, t, members)}
                  </span>
                </span>
              ))}
              {list.length > 3 && <span className={styles.more}>{t('moreOnDay', { count: list.length - 3 })}</span>}
            </button>
          );
        })}
      </div>
      <section className={styles.month}>
        <h2 className={styles.monthTitle}>{formatDate(`${selected}T12:00:00Z`)}</h2>
        {selectedOccs.length === 0 && <p className={styles.hint}>{t('noneOnDay')}</p>}
        <ul className={styles.list}>
          {selectedOccs.map((o) => (
            <EventCard key={occurrenceId(o)} occ={o} data={dataFor(o)} />
          ))}
        </ul>
        <div>
          <Button icon={<Plus size={18} />} onClick={() => navigate(`/calendar/new?date=${selected}`)}>
            {t('newOn', { date: formatDate(`${selected}T12:00:00Z`) })}
          </Button>
        </div>
      </section>
    </>
  );
}
