import type { TFunction } from 'i18next';
import { CalendarClock, Music, Plane, Star } from 'lucide-react';
import { formatDate, formatRelativeDay, formatTime } from '@/core/i18n/format';
import type { Member } from '@/features/members/model';
import { WEEKDAYS, type Occurrence, type Recurrence } from './model';
import { addDays, weekday } from './time';

export function occurrenceTitle(o: Occurrence, t: TFunction, members: Member[]): string {
  if (o.type === 'absence') {
    const name = members.find((m) => m.id === o.event.memberId)?.displayName ?? '?';
    return t('calendar:absentTitle', { name });
  }
  return o.title?.trim() || t(`calendar:types.${o.type}`);
}

/** "Heute · 19:00–22:00", "Sa., 10. Okt. · 20:00", "12. Okt. – 19. Okt." */
export function occurrenceWhen(o: Occurrence, t: TFunction): string {
  if (o.allDay) {
    const from = `${o.startDate}T12:00:00Z`;
    if (o.endDate === o.startDate) return `${formatRelativeDay(from)} · ${t('calendar:allDay')}`;
    return `${formatDate(from)} – ${formatDate(`${o.endDate}T12:00:00Z`)}`;
  }
  const endSameDay = o.endDate === o.startDate;
  return `${formatRelativeDay(o.start)} · ${formatTime(o.start)}–${formatTime(o.end)}${endSameDay ? '' : ` (${formatDate(o.end)})`}`;
}

export function describeRecurrence(r: Recurrence, startDate: string, t: TFunction): string {
  let text: string;
  if (r.freq === 'weekly') {
    const days = (r.byDay?.length ? r.byDay : [WEEKDAYS[weekday(startDate)]!]).map((d) => t(`calendar:weekdays.${d}`)).join(', ');
    text = t('calendar:recurrence.describeWeekly', { count: r.interval, days });
  } else if (r.monthly === 'day') {
    text = t('calendar:recurrence.describeMonthlyDay', { day: Number(startDate.slice(8, 10)) });
  } else {
    const nth = Math.ceil(Number(startDate.slice(8, 10)) / 7);
    text = t('calendar:recurrence.describeMonthly', { nth: t(`calendar:recurrence.nth.${nth}`), day: t(`calendar:weekdays.${WEEKDAYS[weekday(startDate)]}`) });
  }
  if (r.until) text += `, ${t('calendar:recurrence.until', { date: formatDate(`${r.until}T12:00:00Z`) })}`;
  else if (r.count) text += `, ${t('calendar:recurrence.count', { count: r.count })}`;
  return text;
}

export const TYPE_ICON_COLOR: Record<Occurrence['type'], string> = {
  gig: 'var(--event-gig)',
  rehearsal: 'var(--event-rehearsal)',
  absence: 'var(--event-absence)',
  other: 'var(--event-other)',
};

export const dayAfter = (date: string) => addDays(date, 1);

export const TYPE_ICONS = { gig: Star, rehearsal: Music, absence: Plane, other: CalendarClock };

export const occurrencePath = (o: Occurrence) => `/calendar/${o.event.id}${o.key === 'single' ? '' : `/${o.key}`}`;
