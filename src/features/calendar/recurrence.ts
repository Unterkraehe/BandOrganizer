import { WEEKDAYS, type CalendarEvent, type EventException, type Occurrence, type Recurrence, type Weekday } from './model';
import { addDays, addMonths, daysBetween, daysInMonth, fromLocal, minutesBetween, toLocal, weekday } from './time';

/** Recurring events (F5 §5): occurrences are computed on the device, in Berlin local time. */

export function buildRrule(r: Omit<Recurrence, 'rrule'>, startDate: string): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly') parts.push(`BYDAY=${(r.byDay?.length ? r.byDay : [WEEKDAYS[weekday(startDate)]!]).join(',')}`);
  if (r.freq === 'monthly') {
    const day = Number(startDate.slice(8, 10));
    if (r.monthly === 'day') parts.push(`BYMONTHDAY=${day}`);
    else parts.push(`BYDAY=${Math.ceil(day / 7)}${WEEKDAYS[weekday(startDate)]}`);
  }
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`);
  else if (r.count) parts.push(`COUNT=${r.count}`);
  return parts.join(';');
}

export function withRrule(r: Omit<Recurrence, 'rrule'>, startDate: string): Recurrence {
  return { ...r, rrule: buildRrule(r, startDate) };
}

/** All local dates of a series from its start, up to `toDate` (inclusive). */
export function seriesDates(startDate: string, r: Recurrence, toDate: string): string[] {
  const dates: string[] = [];
  const limit = r.until && r.until < toDate ? r.until : toDate;
  const max = r.count ?? Infinity;
  const interval = Math.max(1, r.interval);
  const push = (d: string) => {
    if (d >= startDate && d <= limit && dates.length < max) dates.push(d);
  };

  if (r.freq === 'weekly') {
    const days = (r.byDay?.length ? r.byDay : [WEEKDAYS[weekday(startDate)]!]).map((d) => WEEKDAYS.indexOf(d as Weekday)).sort();
    let weekStart = addDays(startDate, -weekday(startDate));
    for (let guard = 0; weekStart <= limit && dates.length < max && guard < 5000; guard++) {
      for (const day of days) push(addDays(weekStart, day));
      weekStart = addDays(weekStart, 7 * interval);
    }
  } else {
    const day = Number(startDate.slice(8, 10));
    const wd = weekday(startDate);
    const nth = Math.ceil(day / 7);
    let month = startDate.slice(0, 7) + '-01';
    for (let guard = 0; month <= limit && dates.length < max && guard < 1200; guard++) {
      if (r.monthly === 'day') {
        if (day <= daysInMonth(month)) push(`${month.slice(0, 8)}${String(day).padStart(2, '0')}`);
      } else {
        const first = addDays(month, (wd - weekday(month) + 7) % 7);
        const candidate = addDays(first, (nth - 1) * 7);
        if (candidate.slice(0, 7) === month.slice(0, 7)) push(candidate);
      }
      month = addMonths(month, interval);
    }
  }
  return dates;
}

function baseOccurrence(event: CalendarEvent, key: string, start: string, end: string): Occurrence {
  const startDate = event.allDay ? start : toLocal(start).date;
  const endDate = event.allDay ? end : toLocal(end).date;
  return {
    key,
    event,
    type: event.type,
    title: event.title,
    allDay: event.allDay,
    start,
    end,
    startDate,
    endDate,
    meetingTime: event.meetingTime,
    location: event.location,
    description: event.description,
    setlistId: event.setlistId,
    cancelled: event.status === 'cancelled',
    changed: false,
  };
}

function applyException(o: Occurrence, ex: EventException | undefined): Occurrence {
  if (!ex) return o;
  const start = ex.override.start ?? o.start;
  const end = ex.override.end ?? o.end;
  return {
    ...o,
    ...ex.override,
    start,
    end,
    startDate: o.allDay ? start : toLocal(start).date,
    endDate: o.allDay ? end : toLocal(end).date,
    setlistId: ex.setlistId !== undefined ? ex.setlistId : o.setlistId,
    cancelled: o.cancelled || ex.cancelled,
    changed: Object.keys(ex.override).length > 0,
  };
}

/** Occurrences of one event that touch [fromDate, toDate] (local dates, inclusive). */
export function occurrencesOf(event: CalendarEvent, exceptions: EventException[], fromDate: string, toDate: string): Occurrence[] {
  if (event.deletedAt) return [];
  const byDate = new Map(exceptions.map((e) => [e.occurrenceDate, e]));
  const touches = (o: Occurrence) => o.endDate >= fromDate && o.startDate <= toDate;

  if (!event.recurrence) {
    const o = baseOccurrence(event, 'single', event.start, event.end);
    return touches(o) ? [o] : [];
  }

  const startLocal = event.allDay ? { date: event.start, time: '00:00' } : toLocal(event.start);
  const spanDays = event.allDay ? daysBetween(event.start, event.end) : 0;
  const duration = event.allDay ? 0 : minutesBetween(event.start, event.end);
  const meetingOffset = event.meetingTime ? minutesBetween(event.meetingTime, event.start) : null;
  // look a bit beyond the range: an exception may move an occurrence into it
  const dates = seriesDates(startLocal.date, event.recurrence, addDays(toDate, 31));
  const result: Occurrence[] = [];
  for (const date of dates) {
    let o: Occurrence;
    if (event.allDay) o = baseOccurrence(event, date, date, addDays(date, spanDays));
    else {
      const start = fromLocal(date, startLocal.time);
      const endLocal = toLocal(Date.parse(start) + duration * 60000);
      o = baseOccurrence(event, date, start, fromLocal(endLocal.date, endLocal.time));
      if (meetingOffset !== null) {
        const meet = toLocal(Date.parse(start) - meetingOffset * 60000);
        o.meetingTime = fromLocal(meet.date, meet.time);
      }
    }
    o = applyException(o, byDate.get(date));
    if (touches(o)) result.push(o);
  }
  return result;
}

/** Sort key: timed by instant, all-day by date. */
export const sortKey = (o: Occurrence) => (o.allDay ? `${o.startDate}T00:00` : `${o.startDate}T${toLocal(o.start).time}`);
