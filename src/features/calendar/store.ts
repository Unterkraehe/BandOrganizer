import type { Versioned } from '@/core/band/band';
import { emitSystemEvent } from '@/core/events';
import { newId } from '@/core/data/ids';
import { nowIso, softDelete, touchRecord } from '@/core/data/record';
import type { SafeStorage } from '@/core/storage';
import { occurrenceId, type Answer, type AnswerStatus, type CalendarEvent, type EventException, type Occurrence } from './model';
import { occurrencesOf, sortKey, withRrule } from './recurrence';
import { listAnswers, listEvents, listExceptions, writeAnswer, writeEvent, writeException } from './repository';
import { addDays, fromLocal, toLocal, todayLocal } from './time';

/** Calendar state + actions (F5). Cached data first, then refreshed (R-UX-07). */

export interface CalendarState {
  status: 'loading' | 'ready' | 'error';
  events: Versioned<CalendarEvent>[];
  exceptions: Record<string, Versioned<EventException>[]>;
  /** occurrence id → answers */
  answers: Record<string, Answer[]>;
}

export type EditScope = 'this' | 'following' | 'all';

export type EventInput = Pick<
  CalendarEvent,
  'type' | 'title' | 'allDay' | 'start' | 'end' | 'meetingTime' | 'location' | 'description' | 'recurrence' | 'answersEnabled' | 'memberId'
>;

interface Options {
  storage: SafeStorage;
  appRoot: string;
  memberId: () => string;
  cacheKey: string | null;
}

const ANSWER_WINDOW_DAYS = 180;

export class CalendarStore {
  private state: CalendarState;
  private listeners = new Set<() => void>();

  constructor(private readonly options: Options) {
    const cached = this.read<Omit<CalendarState, 'status'>>();
    this.state = cached ? { status: 'ready', ...cached } : { status: 'loading', events: [], exceptions: {}, answers: {} };
  }

  /** true once this session loaded the calendar from HiDrive (not only the cache) */
  private fresh = false;
  isFresh = () => this.fresh;

  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<CalendarState>) {
    this.state = { ...this.state, ...patch };
    const { status: _status, ...rest } = this.state;
    void _status;
    this.write(rest);
    this.listeners.forEach((l) => l());
  }

  async load() {
    try {
      const events = await listEvents(this.options.storage, this.options.appRoot);
      const live = events.filter((e) => !e.value.deletedAt);
      const exceptions = await listExceptions(
        this.options.storage,
        this.options.appRoot,
        live.filter((e) => e.value.recurrence).map((e) => e.value.id),
      );
      this.fresh = true;
      this.set({ events, exceptions, status: 'ready' });
      await this.loadAnswers();
    } catch (error) {
      console.error('Calendar load failed', error);
      this.set({ status: this.state.events.length ? 'ready' : 'error' });
    }
  }

  /** Answers for past week … next 180 days (F5 §7.4). */
  async loadAnswers() {
    const from = addDays(todayLocal(), -7);
    const to = addDays(todayLocal(), ANSWER_WINDOW_DAYS);
    const answers: Record<string, Answer[]> = {};
    const byEvent = new Map<string, Occurrence[]>();
    for (const o of this.occurrences(from, to)) {
      if (!o.event.answersEnabled) continue;
      byEvent.set(o.event.id, [...(byEvent.get(o.event.id) ?? []), o]);
    }
    for (const [eventId, occs] of byEvent) {
      const list = await listAnswers(this.options.storage, this.options.appRoot, eventId, new Set(occs.map((o) => o.key)));
      for (const answer of list) {
        const id = answer.occurrenceKey === 'single' ? eventId : `${eventId}:${answer.occurrenceKey}`;
        answers[id] = [...(answers[id] ?? []), answer];
      }
    }
    this.set({ answers });
  }

  event(id: string) {
    return this.state.events.find((e) => e.value.id === id);
  }

  occurrences(fromDate: string, toDate: string): Occurrence[] {
    return this.state.events
      .flatMap((e) => occurrencesOf(e.value, (this.state.exceptions[e.value.id] ?? []).map((x) => x.value), fromDate, toDate))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }

  /** The next `count` occurrences from now, no time limit (F3 §4.1). */
  upcoming(count: number, filter: (o: Occurrence) => boolean = () => true): Occurrence[] {
    const today = todayLocal();
    const now = Date.now();
    const result: Occurrence[] = [];
    for (let span = 60; span <= 3 * 365 && result.length < count; span *= 2) {
      result.length = 0;
      for (const o of this.occurrences(today, addDays(today, span))) {
        const ended = o.allDay ? o.endDate < today : Date.parse(o.end) < now;
        if (!ended && filter(o)) result.push(o);
      }
    }
    return result.slice(0, count);
  }

  occurrence(eventId: string, key: string): Occurrence | undefined {
    const e = this.event(eventId)?.value;
    if (!e) return undefined;
    const exceptions = (this.state.exceptions[eventId] ?? []).map((x) => x.value);
    if (key === 'single') return occurrencesOf(e, exceptions, '0000-01-01', '9999-12-31')[0];
    const ex = exceptions.find((x) => x.occurrenceDate === key);
    const around = ex?.override.start ? (e.allDay ? ex.override.start : ex.override.start.slice(0, 10)) : key;
    const from = addDays(key < around ? key : around, -1);
    const to = addDays(key > around ? key : around, 1);
    return occurrencesOf(e, exceptions, from, to).find((o) => o.key === key);
  }

  /* ---------------- changes ---------------- */

  private now() {
    return nowIso();
  }

  /** Optimistic: the event is in the calendar immediately (synchronously), then saved. */
  async create(input: EventInput, id = newId('e')): Promise<CalendarEvent> {
    const memberId = this.options.memberId();
    const now = this.now();
    const event: CalendarEvent = {
      ...input,
      id,
      schemaVersion: 1,
      setlistId: null,
      status: 'active',
      cancelledAt: null,
      cancelledBy: null,
      createdAt: now,
      createdBy: memberId,
      updatedAt: now,
      updatedBy: memberId,
      deletedAt: null,
      deletedBy: null,
    };
    const optimistic = { value: event, version: undefined as string | undefined };
    this.set({ events: [...this.state.events, optimistic] });
    try {
      const saved = await writeEvent(this.options.storage, this.options.appRoot, event, undefined, true);
      this.set({ events: this.state.events.map((e) => (e === optimistic ? saved : e)) });
      return event;
    } catch (error) {
      this.set({ events: this.state.events.filter((e) => e !== optimistic) });
      throw error;
    }
  }

  /** Optimistic (R-UX-07): visible immediately, rolled back if saving fails. */
  private async saveEvent(event: CalendarEvent) {
    const current = this.event(event.id);
    const optimistic = { value: event, version: current?.version };
    this.set({ events: this.state.events.map((e) => (e.value.id === event.id ? optimistic : e)) });
    try {
      const saved = await writeEvent(this.options.storage, this.options.appRoot, event, current?.version);
      this.set({ events: this.state.events.map((e) => (e === optimistic ? saved : e)) });
    } catch (error) {
      if (current) this.set({ events: this.state.events.map((e) => (e === optimistic ? current : e)) });
      throw error;
    }
  }

  private async saveException(eventId: string, date: string, patch: (ex: EventException) => EventException) {
    const existing = this.state.exceptions[eventId]?.find((x) => x.value.occurrenceDate === date)?.value;
    const base: EventException = existing ?? {
      schemaVersion: 1,
      eventId,
      occurrenceDate: date,
      cancelled: false,
      override: {},
      updatedAt: '',
      updatedBy: '',
    };
    const next = { ...patch(structuredClone(base)), updatedAt: this.now(), updatedBy: this.options.memberId() };
    const previous = this.state.exceptions[eventId] ?? [];
    const others = previous.filter((x) => x.value.occurrenceDate !== date);
    const oldVersion = previous.find((x) => x.value.occurrenceDate === date)?.version;
    this.set({ exceptions: { ...this.state.exceptions, [eventId]: [...others, { value: next, version: oldVersion }] } });
    try {
      const saved = await writeException(this.options.storage, this.options.appRoot, next);
      const list = (this.state.exceptions[eventId] ?? []).filter((x) => x.value.occurrenceDate !== date);
      this.set({ exceptions: { ...this.state.exceptions, [eventId]: [...list, saved] } });
    } catch (error) {
      this.set({ exceptions: { ...this.state.exceptions, [eventId]: previous } });
      throw error;
    }
  }

  /** Info line in the chat for changed/cancelled events (F5 §6.7, F6 §4.2). */
  private announce(key: 'event.changed' | 'event.cancelled' | 'event.uncancelled', occ: Occurrence) {
    if (occ.type === 'absence') return; // absences: no chat lines (decided)
    emitSystemEvent({
      key,
      params: { actor: this.options.memberId(), type: occ.type, title: occ.title ?? '', date: occ.allDay ? occ.startDate : occ.start, allDay: occ.allDay ? '1' : '0' },
      context: { type: 'event', id: occ.event.id, occurrence: occ.key },
    });
  }

  /** Edit with scope for series (F5 §4.3): this / following / all. */
  async update(occ: Occurrence, input: EventInput, scope: EditScope) {
    const changedWhenWhere =
      input.start !== occ.start || input.end !== occ.end || (input.location?.name ?? '') !== (occ.location?.name ?? '');
    if (changedWhenWhere) this.announce('event.changed', occ);
    const event = occ.event;
    const memberId = this.options.memberId();
    if (!event.recurrence || scope === 'all') {
      // for "all": keep the series start date, take the new times/details
      let start = input.start;
      let end = input.end;
      const seriesDate = event.allDay ? event.start : toLocal(event.start).date;
      if (event.recurrence && !event.allDay && !input.allDay) {
        // keep the series' first date, take the new times (correct offset for that date)
        const s = toLocal(input.start);
        const e = toLocal(input.end);
        start = fromLocal(seriesDate, s.time);
        end = fromLocal(addDays(seriesDate, e.date > s.date ? 1 : 0), e.time);
      }
      const recurrence = input.recurrence ? withRrule(input.recurrence, event.recurrence ? seriesDate : input.allDay ? input.start : toLocal(input.start).date) : null;
      await this.saveEvent(touchRecord(event, memberId, { ...input, start, end, recurrence }));
      return;
    }
    if (scope === 'this') {
      await this.saveException(event.id, occ.key, (ex) => ({
        ...ex,
        override: {
          ...ex.override,
          start: input.start,
          end: input.end,
          location: input.location,
          description: input.description,
          title: input.title,
          meetingTime: input.meetingTime,
        },
      }));
      return;
    }
    // following: end the old series the day before, start a new series at this occurrence
    const seriesDate = event.allDay ? event.start : toLocal(event.start).date;
    await this.saveEvent(
      touchRecord(event, memberId, { recurrence: withRrule({ ...event.recurrence, count: null, until: addDays(occ.key, -1) }, seriesDate) }),
    );
    const newStart = input.allDay ? input.start : toLocal(input.start).date;
    await this.create({ ...input, recurrence: input.recurrence ? withRrule({ ...input.recurrence, count: null }, newStart) : null });
  }

  /** "Absagen": stays visible, struck through (F5 §6.3). */
  async cancel(occ: Occurrence, scope: EditScope, cancelled = true) {
    this.announce(cancelled ? 'event.cancelled' : 'event.uncancelled', occ);
    const event = occ.event;
    const memberId = this.options.memberId();
    if (!event.recurrence || scope === 'all') {
      await this.saveEvent(
        touchRecord(event, memberId, { status: cancelled ? 'cancelled' : 'active', cancelledAt: cancelled ? this.now() : null, cancelledBy: cancelled ? memberId : null }),
      );
    } else if (scope === 'this') {
      await this.saveException(event.id, occ.key, (ex) => ({ ...ex, cancelled, cancelledBy: cancelled ? memberId : null }));
    } else {
      await this.saveEvent(
        touchRecord(event, memberId, {
          recurrence: withRrule({ ...event.recurrence, count: null, until: addDays(occ.key, -1) }, event.allDay ? event.start : toLocal(event.start).date),
        }),
      );
    }
  }

  /** "Löschen" (entered by mistake): soft delete, undo possible (R-DATA-05). */
  async remove(eventId: string) {
    const e = this.event(eventId);
    if (e) await this.saveEvent(softDelete(e.value, this.options.memberId()));
  }

  async restore(eventId: string) {
    const e = this.event(eventId);
    if (e) await this.saveEvent({ ...touchRecord(e.value, this.options.memberId()), deletedAt: null, deletedBy: null });
  }

  async setSetlist(occ: Occurrence, setlistId: string | null) {
    if (occ.key === 'single' || !occ.event.recurrence) await this.saveEvent(touchRecord(occ.event, this.options.memberId(), { setlistId }));
    else await this.saveException(occ.event.id, occ.key, (ex) => ({ ...ex, setlistId }));
  }

  answersFor(occ: Occurrence): Answer[] {
    return this.state.answers[occurrenceId(occ)] ?? [];
  }

  async answer(occ: Occurrence, status: AnswerStatus, comment: string | null) {
    const memberId = this.options.memberId();
    const answer: Answer = {
      schemaVersion: 1,
      eventId: occ.event.id,
      occurrenceKey: occ.key,
      memberId,
      status,
      comment: comment?.trim() || null,
      answeredFor: occ.start,
      updatedAt: this.now(),
    };
    // Optimistic: the button reacts at once, the file is written in the background
    const id = occurrenceId(occ);
    const previous = this.state.answers[id] ?? [];
    this.set({ answers: { ...this.state.answers, [id]: [...previous.filter((a) => a.memberId !== memberId), answer] } });
    try {
      await writeAnswer(this.options.storage, this.options.appRoot, answer);
    } catch (error) {
      this.set({ answers: { ...this.state.answers, [id]: previous } });
      throw error;
    }
  }

  private read<T>(): T | null {
    if (!this.options.cacheKey) return null;
    try {
      const raw = localStorage.getItem(this.options.cacheKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(value: unknown) {
    if (!this.options.cacheKey) return;
    try {
      localStorage.setItem(this.options.cacheKey, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}
