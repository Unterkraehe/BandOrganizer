import { Archive, ArchiveRestore, Eye, EyeOff, Layers, ListPlus, Pencil, Tags } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import type { MenuItem } from '@/ui';
import { useLibrary } from './LibraryProvider';
import type { Song } from './model';

/** Shared song actions for the row menu and the detail menu (F4 §4.1). */
export function useSongActions(openTags: (song: Song) => void) {
  const { t } = useTranslation('songs');
  const navigate = useNavigate();
  const notify = useNotify();
  const { store } = useLibrary();

  const guard = (promise: Promise<unknown>) => promise.catch(() => notify({ message: t('failed') }));

  // stable identity: memoized list rows depend on it
  return useCallback((song: Song, options: { withEdit?: boolean } = {}): MenuItem[] => [
    { label: t('actions.edit'), icon: <Pencil size={18} />, onSelect: () => navigate(`/songs/${song.id}/edit`), hidden: !options.withEdit },
    {
      label: song.archived ? t('actions.unarchive') : t('actions.archive'),
      icon: song.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />,
      onSelect: () =>
        void guard(
          store.setArchived(song.id, !song.archived).then(() =>
            notify({
              message: song.archived ? t('archive.restored', { title: song.title }) : t('archive.done', { title: song.title }),
              actionLabel: t('undo'),
              onAction: () => void guard(store.setArchived(song.id, song.archived)),
            }),
          ),
        ),
      hidden: song.hidden,
    },
    { label: t('actions.tags'), icon: <Tags size={18} />, onSelect: () => openTags(song), hidden: song.hidden },
    { label: t('suggested.adopt'), icon: <ListPlus size={18} />, onSelect: () => navigate(`/songs/${song.id}?adopt=1`), hidden: !song.suggested || !song.recording },
    { label: t('actions.merge'), icon: <Layers size={18} />, onSelect: () => navigate(`/songs/${song.id}/merge`), hidden: song.hidden },
    {
      label: song.hidden ? t('actions.unhide') : t('actions.hide'),
      icon: song.hidden ? <Eye size={18} /> : <EyeOff size={18} />,
      onSelect: () =>
        void guard(
          store.setHidden(song.id, !song.hidden).then(() =>
            song.hidden
              ? undefined
              : notify({
                  message: t('hidden.done', { title: song.title }),
                  actionLabel: t('undo'),
                  onAction: () => void guard(store.setHidden(song.id, false)),
                }),
          ),
        ),
    },
  ], [t, navigate, notify, store, openTags]); // eslint-disable-line react-hooks/exhaustive-deps
}
