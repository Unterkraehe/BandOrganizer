import { ListPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { joinPath } from '@/core/storage';
import { uniqueName } from '@/core/uploads/names';
import { Button, Dialog } from '@/ui';
import { useLibrary } from '../LibraryProvider';
import { isSuggestionFolder, type Song } from '../model';
import { FolderField } from './FolderPicker';
import { useUploadContext } from './useUploadContext';

/**
 * "In die Songliste übernehmen" (v0.13.3): copies the Band-Version file of a suggested song into a
 * folder the member chooses and makes the copy the new Band-Version – the song then has a file
 * outside "Vorschläge" and is a normal song. The original file stays untouched (create-only, R-DATA-03).
 */
export function AdoptSuggestionDialog({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useTranslation('songs');
  const notify = useNotify();
  const { store } = useLibrary();
  const { pickerProps, defaultFolder } = useUploadContext();
  const home = pickerProps.home;
  const relative = (folder: string) => (folder === home ? '' : folder.startsWith(`${home}/`) ? folder.slice(home.length + 1) : folder);
  const inSuggestions = (folder: string) => isSuggestionFolder(relative(folder), store.suggestionFolders);
  const [folder, setFolder] = useState(() => {
    const preferred = defaultFolder('audio');
    return inSuggestions(preferred) ? home : preferred;
  });
  const [busy, setBusy] = useState(false);
  const recording = song.recording;
  const invalid = inSuggestions(folder);

  const adopt = async () => {
    if (!recording || invalid) return;
    setBusy(true);
    try {
      const name = await uniqueName(store.storage, folder, recording.fileName);
      const copy = await store.storage.copyFile(recording.path, joinPath(folder, name));
      await store.attachRecording(song.id, copy, { makeBand: true });
      notify({ message: t('suggested.adopted', { title: song.title }) });
      onClose();
    } catch (error) {
      console.error('Adopting suggestion failed', error);
      setBusy(false);
      notify({ message: t('failed') });
    }
  };

  return (
    <Dialog open title={t('suggested.adoptTitle')} closeLabel={t('common:actions.close')} onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <p>{t('suggested.adoptText', { file: recording?.fileName ?? '' })}</p>
        <FolderField label={t('suggested.adoptFolder')} value={folder} onChange={setFolder} {...pickerProps} />
        {invalid && (
          <p role="alert" style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
            {t('suggested.adoptInvalid')}
          </p>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{t('suggested.adoptKeep')}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" icon={<ListPlus size={18} />} disabled={busy || invalid || !recording} onClick={() => void adopt()}>
            {busy ? t('suggested.adopting') : t('suggested.adoptConfirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
