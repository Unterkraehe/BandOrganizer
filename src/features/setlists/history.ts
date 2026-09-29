import type { Occurrence } from '@/features/calendar/model';
import type { Song } from '@/features/songs/model';
import { songEntries, type Setlist } from './model';

/**
 * "Lange nicht gespielt" (F7 §6.6): a song was played if it was in a setlist linked to a
 * past, not cancelled gig or rehearsal. No extra tracking.
 */
export interface Played {
  date: string;
  occurrence: Occurrence;
}

export function lastPlayed(pastOccurrences: Occurrence[], setlists: Setlist[], songs: Song[]): Map<string, Played> {
  const byId = new Map(setlists.map((s) => [s.id, s]));
  // entries may reference songs that were grouped into another song later
  const owner = new Map<string, string>();
  for (const song of songs) {
    owner.set(song.id, song.id);
    for (const merged of song.mergedSongIds) owner.set(merged, song.id);
  }
  const result = new Map<string, Played>();
  for (const occ of pastOccurrences) {
    if (occ.cancelled || !occ.setlistId || (occ.type !== 'gig' && occ.type !== 'rehearsal')) continue;
    const setlist = byId.get(occ.setlistId);
    if (!setlist || setlist.deletedAt) continue;
    for (const entry of songEntries(setlist)) {
      const id = owner.get(entry.songId) ?? entry.songId;
      const prev = result.get(id);
      if (!prev || prev.date < occ.startDate) result.set(id, { date: occ.startDate, occurrence: occ });
    }
  }
  return result;
}

/** Active songs not in the setlist, never played first, then longest ago – no threshold (decided). */
export function suggestions(songs: Song[], played: Map<string, Played>, inSetlist: Set<string>): { song: Song; played: Played | null }[] {
  return songs
    .filter((s) => !s.archived && !s.hidden && s.recording && !inSetlist.has(s.id))
    .map((song) => ({ song, played: played.get(song.id) ?? null }))
    .sort((a, b) => (a.played?.date ?? '').localeCompare(b.played?.date ?? '') || a.song.title.localeCompare(b.song.title, 'de'));
}
