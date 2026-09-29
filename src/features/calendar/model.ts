import type { RecordBase } from '@/core/data/record';

/** Calendar data (F5 §7). */

export type EventType = 'gig' | 'rehearsal' | 'absence' | 'other';
export const EVENT_TYPES: EventType[] = ['gig', 'rehearsal', 'absence', 'other'];
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Recurrence {
  freq: 'weekly' | 'monthly';
  /** every n weeks / months */
  interval: number;
  /** weekly: weekdays; default = weekday of the start */
  byDay?: Weekday[];
  /** monthly: "2. Donnerstag" (weekday) or "am 15." (day) */
  monthly?: 'weekday' | 'day';
  until?: string | null; // YYYY-MM-DD inclusive
  count?: number | null;
  /** RFC 5545 RRULE for export (derived) */
  rrule: string;
}

export interface CalendarEvent extends RecordBase {
  type: EventType;
  title: string | null;
  allDay: boolean;
  /** timed: ISO with offset; all-day/absence: YYYY-MM-DD */
  start: string;
  end: string;
  /** gigs: meeting / get-in time (ISO) */
  meetingTime: string | null;
  location: { name: string; address?: string } | null;
  description: string | null;
  recurrence: Recurrence | null;
  answersEnabled: boolean;
  setlistId: string | null;
  /** absences only */
  memberId: string | null;
  status: 'active' | 'cancelled';
  cancelledAt: string | null;
  cancelledBy: string | null;
}

/** Changed or cancelled occurrence of a series (F5 §5). */
export interface EventException {
  schemaVersion: 1;
  eventId: string;
  occurrenceDate: string;
  cancelled: boolean;
  override: Partial<Pick<CalendarEvent, 'start' | 'end' | 'location' | 'description' | 'title' | 'meetingTime'>>;
  setlistId?: string | null;
  cancelledBy?: string | null;
  updatedAt: string;
  updatedBy: string;
}

export type AnswerStatus = 'yes' | 'maybe' | 'no';

export interface Answer {
  schemaVersion: 1;
  eventId: string;
  occurrenceKey: string;
  memberId: string;
  status: AnswerStatus;
  comment: string | null;
  /** start of the occurrence when answering – if it changed, "bitte prüfen" (F5 §6.1) */
  answeredFor: string;
  updatedAt: string;
}

/** One concrete date of an event (single or series occurrence). */
export interface Occurrence {
  key: string; // "single" or original local date
  event: CalendarEvent;
  type: EventType;
  title: string | null;
  allDay: boolean;
  start: string;
  end: string;
  /** local dates covered (all-day ranges) */
  startDate: string;
  endDate: string;
  meetingTime: string | null;
  location: CalendarEvent['location'];
  description: string | null;
  setlistId: string | null;
  cancelled: boolean;
  changed: boolean;
}

export const occurrenceId = (o: Pick<Occurrence, 'event' | 'key'>) => (o.key === 'single' ? o.event.id : `${o.event.id}:${o.key}`);
