import { useTranslation } from 'react-i18next';
import type { ItemRef } from '@/core/events';
import { useSession } from '@/core/session/BandSession';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import { occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { useSetlists } from '@/features/setlists/SetlistProvider';
import { useLibrary } from '@/features/songs/LibraryProvider';

/** Resolves a context/share reference to something displayable (F6 §3.1). */
export function useItemResolver() {
  const { t } = useTranslation();
  const { songs } = useLibrary();
  const { store: calendar, state: calState } = useCalendar();
  const { setlists } = useSetlists();
  const { members } = useSession();
  void calState;
  return (ref: ItemRef) => {
    if (ref.type === 'song') {
      const song = songs.find((s) => s.id === ref.id || s.mergedSongIds.includes(ref.id));
      return song ? { kind: 'song' as const, title: song.title, sub: song.recording?.folder ?? '', song } : null;
    }
    if (ref.type === 'setlist') {
      const setlist = setlists.find((s) => s.id === ref.id);
      return setlist ? { kind: 'setlist' as const, title: setlist.name, sub: '', setlist } : null;
    }
    const occ = calendar.occurrence(ref.id, ref.occurrence ?? 'single');
    return occ ? { kind: 'event' as const, title: occurrenceTitle(occ, t, members), sub: occurrenceWhen(occ, t), occ } : null;
  };
}
