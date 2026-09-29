import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button, ConfirmDialog, Page, SegmentedControl, TextArea, TextField } from '@/ui';
import { useLibrary } from '../LibraryProvider';
import { cleanTitle, KEYS, songIdFor, TUNING_SUGGESTIONS } from '../model';
import { AUDIO_ACCEPT, FileInput, LYRICS_ACCEPT } from './FileInput';
import { FolderField } from './FolderPicker';
import { useCheckedFile } from './useCheckedFile';
import { useUploadActions } from './useUploadActions';
import { useUploadContext } from './useUploadContext';
import styles from '../SongDetail.module.css';

type LyricsMode = 'none' | 'file' | 'type';

/** "Neuer Song" (F10 §3.1): title, optional recording and lyrics, each with "Speichern in". */
export function NewSongPage() {
  const { t } = useTranslation('uploads');
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, songs } = useLibrary();
  const { pickerProps, defaultFolder } = useUploadContext();
  const actions = useUploadActions();
  const audio = useCheckedFile('audio');
  const lyricsFile = useCheckedFile('lyrics');
  const [title, setTitle] = useState('');
  const [titleFromFile, setTitleFromFile] = useState(false);
  const [audioFolder, setAudioFolder] = useState(() => defaultFolder('audio'));
  const [lyricsMode, setLyricsMode] = useState<LyricsMode>('none');
  const [lyricsFolder, setLyricsFolder] = useState(() => defaultFolder('lyrics'));
  const [lyricsText, setLyricsText] = useState('');
  const [keyNote, setKeyNote] = useState('');
  const [minor, setMinor] = useState(false);
  const [bpm, setBpm] = useState('');
  const [tuning, setTuning] = useState('');
  const [busy, setBusy] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const location = useLocation();
  const dropped = (location.state as { file?: File } | null)?.file;
  useEffect(() => {
    if (dropped) void onAudio(dropped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped]);

  const taken = title.trim() && songs.some((s) => s.title.toLocaleLowerCase('de') === title.trim().toLocaleLowerCase('de'));
  const bpmNumber = bpm ? Number(bpm) : null;
  const bpmInvalid = bpmNumber !== null && (bpmNumber < 20 || bpmNumber > 300);

  const onAudio = async (file: File | null) => {
    await audio.choose(file);
    if (file && (!title.trim() || titleFromFile)) {
      setTitle(cleanTitle(file.name));
      setTitleFromFile(true);
    }
    if (file) {
      const dup = actions.findDuplicate(file, 'audio');
      if (dup) setDuplicateOf(songIdFor(dup));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || bpmInvalid) return;
    setBusy(true);
    try {
      const songId = await store.createAppSong({
        title,
        key: keyNote ? `${keyNote}${minor ? 'm' : ''}` : null,
        bpm: bpmNumber,
        tuning: tuning.trim() || null,
        tagIds: [],
      });
      const fail = () => notify({ message: t('errors.failed') });
      if (audio.file) void actions.uploadRecording(songId, audio.file, audioFolder).catch(fail);
      if (lyricsMode === 'file' && lyricsFile.file) void actions.uploadLyricsFile(songId, lyricsFile.file, lyricsFolder).catch(fail);
      if (lyricsMode === 'type' && lyricsText.trim()) void actions.saveTypedLyrics(songId, title.trim(), lyricsText, lyricsFolder).catch(fail);
      navigate(`/songs/${songId}`, { replace: true });
    } catch {
      setBusy(false);
      notify({ message: t('errors.failed') });
    }
  };

  return (
    <Page title={t('newSong')}>
      <form className={styles.editForm} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          label={t('songs:edit.songTitle')}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleFromFile(false);
          }}
          hint={titleFromFile ? t('titleFromFile') : taken ? t('songTitleTaken') : undefined}
          maxLength={120}
          required
          autoFocus
        />

        <fieldset className={styles.fieldset}>
          <legend>{t('recording')}</legend>
          <FileInput
            label={t('chooseFile')}
            accept={AUDIO_ACCEPT}
            file={audio.file}
            onFile={(f) => void onAudio(f)}
            error={audio.error}
            hint={audio.large ? t('large') : t('recordingOptional')}
          />
          {audio.file && <FolderField label={t('saveIn')} value={audioFolder} onChange={setAudioFolder} {...pickerProps} />}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>{t('lyrics')}</legend>
          <SegmentedControl
            label={t('lyrics')}
            value={lyricsMode}
            onChange={setLyricsMode}
            options={[
              { value: 'none', label: t('lyricsNone') },
              { value: 'file', label: t('lyricsFile') },
              { value: 'type', label: t('lyricsType') },
            ]}
          />
          {lyricsMode === 'file' && (
            <FileInput label={t('chooseFile')} accept={LYRICS_ACCEPT} file={lyricsFile.file} onFile={(f) => void lyricsFile.choose(f)} error={lyricsFile.error} />
          )}
          {lyricsMode === 'type' && (
            <TextArea label={t('lyrics')} hideLabel value={lyricsText} onChange={(e) => setLyricsText(e.target.value)} rows={8} placeholder={t('lyrics')} />
          )}
          {lyricsMode !== 'none' && <FolderField label={t('saveIn')} value={lyricsFolder} onChange={setLyricsFolder} {...pickerProps} />}
        </fieldset>

        <details className={styles.fieldset}>
          <summary className={styles.legend} style={{ cursor: 'pointer' }}>
            {t('moreDetails')}
          </summary>
          <div className={styles.editForm} style={{ marginTop: 'var(--space-4)' }}>
            <div className={styles.keyRow}>
              <select aria-label={t('songs:edit.key')} value={keyNote} onChange={(e) => setKeyNote(e.target.value)} className={styles.select}>
                <option value="">{t('songs:edit.keyNone')}</option>
                {KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} disabled={!keyNote} />
                {t('songs:edit.minor')}
              </label>
            </div>
            <TextField
              label={t('songs:edit.bpm')}
              inputMode="numeric"
              value={bpm}
              onChange={(e) => setBpm(e.target.value.replace(/[^0-9]/g, ''))}
              error={bpmInvalid ? t('songs:edit.bpmInvalid') : undefined}
              maxLength={3}
            />
            <TextField label={t('songs:edit.tuning')} value={tuning} onChange={(e) => setTuning(e.target.value)} list="new-tuning" maxLength={40} />
            <datalist id="new-tuning">
              {TUNING_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </details>

        <div className={styles.noteFormActions} style={{ justifyContent: 'flex-start' }}>
          <Button type="submit" variant="primary" size="lg" disabled={busy || !title.trim() || bpmInvalid || (lyricsMode === 'file' && !lyricsFile.file)}>
            {t('create_song')}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => navigate(-1)}>
            {t('common:actions.cancel')}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={duplicateOf !== null}
        title={t('duplicateTitle')}
        text={t('duplicateText', { name: audio.file?.name ?? '', folder: '' })}
        confirmLabel={t('useExisting')}
        cancelLabel={t('uploadAnyway')}
        onCancel={() => setDuplicateOf(null)}
        onConfirm={() => {
          const target = store.getState().songs.find((s) => s.id === duplicateOf || s.mergedSongIds.includes(duplicateOf ?? ''));
          setDuplicateOf(null);
          if (target) navigate(`/songs/${target.id}`, { replace: true });
        }}
      />
    </Page>
  );
}
