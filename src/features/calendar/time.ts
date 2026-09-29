import { TIME_ZONE } from '@/core/i18n';

/**
 * Local wall time in Europe/Berlin ↔ UTC (F5 §6.4). Recurrences are computed in local time,
 * so a 19:00 rehearsal stays 19:00 across daylight-saving changes (F5 §5).
 */

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface LocalDateTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

export function toLocal(value: string | number | Date): LocalDateTime {
  const parts = Object.fromEntries(partsFmt.formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function offsetMinutes(utcMs: number): number {
  const parts = Object.fromEntries(partsFmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2026-10-15" + "19:00" in Berlin → ISO string with offset, e.g. "2026-10-15T19:00:00+02:00". */
export function fromLocal(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall - offsetMinutes(wall) * 60000;
  utc = wall - offsetMinutes(utc) * 60000; // second pass for DST boundaries
  const offset = offsetMinutes(utc);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${date}T${time}:00${tz}`;
}

/* ---------- plain calendar-date arithmetic (no time zone involved) ---------- */

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const todayLocal = () => toLocal(Date.now()).date;

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
}
