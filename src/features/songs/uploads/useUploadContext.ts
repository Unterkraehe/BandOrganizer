import { useSession } from '@/core/session/BandSession';
import { dirname } from '@/core/storage';
import type { UploadKind } from '@/core/uploads/validate';
import { useLibrary } from '../LibraryProvider';
import type { Song } from '../model';
import { lastFolder } from './useUploadActions';

/** Everything the folder field/picker needs + the pre-selected folders (F10 §4.1). */
export function useUploadContext() {
  const { band, home, appRoot } = useSession();
  const { store } = useLibrary();
  const standard = band?.uploads.root ?? store.home;
  const pickerProps = {
    storage: store.storage,
    home: home ?? store.home,
    appRoot: appRoot ?? store.appRoot,
    excluded: band?.scan.excludedPaths ?? [],
  };
  const defaultFolder = (kind: UploadKind, song?: Song | null): string => {
    if (kind === 'audio' && song?.recording) return dirname(song.recording.path);
    return lastFolder(kind) ?? standard;
  };
  return { pickerProps, defaultFolder };
}
