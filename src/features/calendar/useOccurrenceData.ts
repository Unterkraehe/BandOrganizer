import { useMemo } from 'react';
import { useSession } from '@/core/session/BandSession';
import { summarize, needsReview } from './answers';
import { useCalendar } from './CalendarProvider';
import type { Occurrence } from './model';

/** Answers + absences for a list of occurrences (cards, detail, dashboard). */
export function useOccurrenceData(occurrences: Occurrence[]) {
  const { store } = useCalendar();
  const { members, currentMember } = useSession();
  const absences = useMemo(() => {
    if (occurrences.length === 0) return [];
    const from = occurrences.reduce((min, o) => (o.startDate < min ? o.startDate : min), occurrences[0]!.startDate);
    const to = occurrences.reduce((max, o) => (o.endDate > max ? o.endDate : max), occurrences[0]!.endDate);
    return store.occurrences(from, to).filter((o) => o.type === 'absence' && !o.cancelled);
  }, [occurrences, store]);

  return (occ: Occurrence) => {
    const answers = store.answersFor(occ);
    const summary = summarize(occ, answers, members, absences);
    const mine = currentMember ? summary.byMember.get(currentMember.id) : undefined;
    const conflicts = occ.type === 'absence' ? [] : absences.filter((a) => a.startDate <= occ.endDate && a.endDate >= occ.startDate);
    return { summary, mine, review: needsReview(mine, occ), conflicts, absentMe: Boolean(currentMember && summary.absent.some((m) => m.id === currentMember.id)) };
  };
}
