import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button, Dialog } from '@/ui';
import type { Song } from '../model';
import { FileInput, LYRICS_ACCEPT } from '../uploads/FileInput';
import { FolderField } from '../uploads/FolderPicker';
import { useCheckedFile } from '../uploads/useCheckedFile';
import { useUploadActions } from '../uploads/useUploadActions';
import { useUploadContext } from '../uploads/useUploadContext';

/** "Songtext hochladen" with "Speichern in" (F10 §4.1). */
export function LyricsUploadDialog({ song, initialFile, onClose }: { song: Song; initialFile?: File; onClose: () => void }) {
  const { t } = useTranslation('uploads');
  const notify = useNotify();
  const { pickerProps, defaultFolder } = useUploadContext();
  const actions = useUploadActions();
  const file = useCheckedFile('lyrics');
  const [folder, setFolder] = useState(() => defaultFolder('lyrics'));
  const choose = file.choose;
  useEffect(() => {
    if (initialFile) void choose(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  return (
    <Dialog open title={t('uploadLyrics')} closeLabel={t('close')} onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <FileInput label={t('lyrics')} accept={LYRICS_ACCEPT} file={file.file} onFile={(f) => void file.choose(f)} error={file.error} />
        <FolderField label={t('saveIn')} value={folder} onChange={setFolder} {...pickerProps} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!file.file}
            onClick={() => {
              if (!file.file) return;
              void actions.uploadLyricsFile(song.id, file.file, folder).catch(() => notify({ message: t('errors.failed') }));
              onClose();
            }}
          >
            {t('upload')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
