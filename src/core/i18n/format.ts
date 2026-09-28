import { LOCALE, TIME_ZONE } from './index';

/**
 * Shared formatters (R-I18N-03). Never build date/number strings by hand.
 * Storage is UTC/ISO; display is de-DE in Europe/Berlin.
 */

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });
const dateWithYearFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' });
const relativeFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const minutesFmt = new Intl.NumberFormat(LOCALE, { style: 'unit', unit: 'minute', unitDisplay: 'short' });

type DateInput = string | number | Date;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

/** "Sa., 10. Okt." */
export function formatDate(value: DateInput): string {
  return dateFmt.format(toDate(value));
}

/** "10.10.2026" */
export function formatDateWithYear(value: DateInput): string {
  return dateWithYearFmt.format(toDate(value));
}

/** "19:00" */
export function formatTime(value: DateInput): string {
  return timeFmt.format(toDate(value));
}

/** Local calendar day in Europe/Berlin as "YYYY-MM-DD". */
export function dayKey(value: DateInput): string {
  return dayKeyFmt.format(toDate(value));
}

/** Hour of day (0–23) in Europe/Berlin. */
export function localHour(value: DateInput = new Date()): number {
  return Number(hourFmt.format(toDate(value)));
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "Heute", "Morgen", "Gestern", otherwise formatDate (F3 §4.1). */
export function formatRelativeDay(value: DateInput, now: DateInput = new Date()): string {
  const diff = daysBetween(dayKey(now), dayKey(value));
  if (Math.abs(diff) <= 1) {
    const text = relativeFmt.format(diff, 'day');
    return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
  }
  return formatDate(value);
}

/** Playback time: 241.3 → "4:01", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '–:–';
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Lengths like setlist durations: 48 → "48 Min." */
export function formatMinutes(minutes: number): string {
  return minutesFmt.format(Math.round(minutes));
}

const longDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' });

/** "Samstag, 26. September" */
export function formatLongDate(value: DateInput): string {
  return longDateFmt.format(toDate(value));
}

/** "vor 2 Tagen", "gerade eben" style relative time for notes etc. */
export function formatAgo(value: DateInput, now: DateInput = new Date()): string {
  const seconds = Math.round((toDate(value).getTime() - toDate(now).getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFmt.format(0, 'second');
  if (abs < 3600) return relativeFmt.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relativeFmt.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86_400) return relativeFmt.format(Math.round(seconds / 86_400), 'day');
  return formatDateWithYear(value);
}
