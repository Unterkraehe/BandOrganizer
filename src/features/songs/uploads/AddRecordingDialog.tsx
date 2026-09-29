import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button, ConfirmDialog, Dialog, TextField } from '@/ui';
import { useLibrary } from '../LibraryProvider';
import { songIdFor, type Song } from '../model';
import { AUDIO_ACCEPT, FileInput } from './FileInput';
import { FolderField } from './FolderPicker';
import { useCheckedFile } from './useCheckedFile';
import { useUploadActions } from './useUploadActions';
import { useUploadContext } from './useUploadContext';

/** "+ Aufnahme hinzufügen" (F10 §5.3). */
export function AddRecordingDialog({ song, initialFile, onClose }: { song: Song; initialFile?: File; onClose: () => void }) {
  const { t } = useTranslation('uploads');
  const notify = useNotify();
  const { store } = useLibrary();
  const { pickerProps, defaultFolder } = useUploadContext();
  const actions = useUploadActions();
  const audio = useCheckedFile('audio');
  const [folder, setFolder] = useState(() => defaultFolder('audio', song));
  const [label, setLabel] = useState('');
  const [makeBand, setMakeBand] = useState(!song.recording);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const choose = audio.choose;
  useEffect(() => {
    if (initialFile) void choose(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  const onChoose = async (file: File | null) => {
    await audio.choose(file);
    const dup = file ? actions.findDuplicate(file, 'audio') : null;
    if (dup) setDuplicate(songIdFor(dup));
  };

  const upload = () => {
    if (!audio.file) return;
    void actions.uploadRecording(song.id, audio.file, folder, { label, makeBand }).catch(() => notify({ message: t('errors.failed') }));
    onClose();
  };

  return (
    <Dialog open title={t('addRecording')} closeLabel={t('close')} onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <FileInput label={t('recording')} accept={AUDIO_ACCEPT} file={audio.file} onFile={(f) => void onChoose(f)} error={audio.error} hint={audio.large ? t('large') : undefined} />
        <TextField label={t('label')} placeholder={t('labelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        <FolderField label={t('saveIn')} value={folder} onChange={setFolder} {...pickerProps} />
        {song.recording && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input type="checkbox" checked={makeBand} onChange={(e) => setMakeBand(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
            {t('makeBand')}
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onClick={upload} disabled={!audio.file}>
            {t('upload')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={duplicate !== null}
        title={t('duplicateTitle')}
        text={t('duplicateText', { name: audio.file?.name ?? '', folder: '' })}
        confirmLabel={t('useExisting')}
        cancelLabel={t('uploadAnyway')}
        onCancel={() => setDuplicate(null)}
        onConfirm={() => {
          const existing = duplicate;
          setDuplicate(null);
          if (existing && existing !== song.id) void store.mergeInto(existing, song.id).catch(() => notify({ message: t('errors.failed') }));
          onClose();
        }}
      />
    </Dialog>
  );
}
