import type { CalendarEvent, EventException } from './model';
import { addDays } from './time';

/** iCalendar export (F5 §6.5a). Series as RRULE with EXDATE / RECURRENCE-ID, Berlin time zone. */

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** "2026-10-15T19:00:00+02:00" → local "20261015T190000" (the offset is Berlin's anyway) */
const localStamp = (iso: string) => iso.slice(0, 19).replace(/[-:]/g, '');
const dateStamp = (date: string) => date.replace(/-/g, '');
const utcStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

export interface IcsLabels {
  title: (event: CalendarEvent) => string;
  cancelledPrefix: string;
}

function eventBlock(event: CalendarEvent, labels: IcsLabels, override?: EventException): string[] {
  const start = override?.override.start ?? event.start;
  const end = override?.override.end ?? event.end;
  const location = override?.override.location !== undefined ? override.override.location : event.location;
  const description = override?.override.description !== undefined ? override.override.description : event.description;
  const cancelled = event.status === 'cancelled' || override?.cancelled;
  const lines = ['BEGIN:VEVENT', `UID:${event.id}@bandorganizer`, `DTSTAMP:${utcStamp(event.updatedAt || new Date().toISOString())}`];
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(start)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(end, 1))}`);
  } else {
    lines.push(`DTSTART;TZID=Europe/Berlin:${localStamp(start)}`, `DTEND;TZID=Europe/Berlin:${localStamp(end)}`);
  }
  if (override) {
    lines.push(event.allDay ? `RECURRENCE-ID;VALUE=DATE:${dateStamp(override.occurrenceDate)}` : `RECURRENCE-ID;TZID=Europe/Berlin:${dateStamp(override.occurrenceDate)}T${localStamp(event.start).slice(9)}`);
  } else if (event.recurrence) {
    lines.push(`RRULE:${event.recurrence.rrule}`);
  }
  lines.push(`SUMMARY:${escape((cancelled ? labels.cancelledPrefix : '') + labels.title(event))}`);
  if (location) lines.push(`LOCATION:${escape([location.name, location.address].filter(Boolean).join(', '))}`);
  if (description) lines.push(`DESCRIPTION:${escape(description)}`);
  if (cancelled) lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT');
  return lines;
}

export function buildIcs(items: { event: CalendarEvent; exceptions: EventException[] }[], labels: IcsLabels, calendarName: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BandOrganizer//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escape(calendarName)}`, ...VTIMEZONE];
  for (const { event, exceptions } of items) {
    if (event.deletedAt) continue;
    lines.push(...eventBlock(event, labels));
    for (const ex of exceptions) if (event.recurrence) lines.push(...eventBlock(event, labels, ex));
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Hands the .ics file to the device (share sheet on phones, download otherwise). */
export async function deliverIcs(ics: string, fileName: string) {
  const file = new File([ics], fileName, { type: 'text/calendar' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
