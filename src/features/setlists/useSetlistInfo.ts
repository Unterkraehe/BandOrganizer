import { useMemo } from 'react';
import { formatMinutes } from '@/core/i18n/format';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import type { Occurrence } from '@/features/calendar/model';
import { addDays, todayLocal } from '@/features/calendar/time';
import { useLibrary } from '@/features/songs/LibraryProvider';
import type { Song } from '@/features/songs/model';
import { durations, songEntries, type Setlist } from './model';

/** Songs lookup (incl. merged ids), durations and linked events for setlists. */
export function useSetlistInfo() {
  const { songs } = useLibrary();
  const { store: calendar, state: calState } = useCalendar();
  const songById = useMemo(() => {
    const map = new Map<string, Song>();
    for (const s of songs) {
      map.set(s.id, s);
      for (const m of s.mergedSongIds) map.set(m, s);
    }
    return map;
  }, [songs]);

  // occurrences with a setlist in ±2 years
  const linked = useMemo(() => {
    const today = todayLocal();
    return calendar.occurrences(addDays(today, -730), addDays(today, 730)).filter((o) => o.setlistId);
  }, [calendar, calState]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventsOf = (setlistId: string): Occurrence[] => linked.filter((o) => o.setlistId === setlistId);
  const durationOf = (setlist: Setlist) => durations(setlist, (id) => songById.get(id)?.recording?.durationSec);
  const label = (setlist: Setlist) => {
    const d = durationOf(setlist);
    return { songs: songEntries(setlist).length, minutes: formatMinutes(d.totalSeconds / 60), unknown: d.unknown };
  };
  return { songById, eventsOf, durationOf, label, linked };
}
