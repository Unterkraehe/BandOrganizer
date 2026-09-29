import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { decodeText } from '@/core/lyrics/renderers';
import { dirname } from '@/core/storage';
import { Button, ConfirmDialog, Page, TextArea } from '@/ui';
import { useLibrary } from '../LibraryProvider';
import { FolderField } from '../uploads/FolderPicker';
import { useUploadActions } from '../uploads/useUploadActions';
import { useUploadContext } from '../uploads/useUploadContext';
import styles from './Lyrics.module.css';

const draftKey = (songId: string) => `bandapp.lyricsDraft.${songId}`;

/** Type or edit lyrics – every save is a NEW .txt file (F10 §5.7). */
export function LyricsEditorPage() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();
  const { songs, store } = useLibrary();
  const song = songs.find((s) => s.id === songId);
  const { pickerProps, defaultFolder } = useUploadContext();
  const actions = useUploadActions();
  const startPath = useRef(song?.lyrics?.path ?? null);
  const [text, setText] = useState(() => (location.state as { text?: string } | null)?.text ?? localStorage.getItem(draftKey(songId ?? '')) ?? '');
  const [loaded, setLoaded] = useState(Boolean((location.state as { text?: string } | null)?.text) || Boolean(text));
  const [folder, setFolder] = useState(() =>
    song?.lyrics && song.lyrics.ext === 'txt' ? dirname(song.lyrics.path) : defaultFolder('lyrics'),
  );
  const [confirm, setConfirm] = useState(false);

  // Load the current .txt as starting point
  useEffect(() => {
    if (loaded || !song?.lyrics || song.lyrics.ext !== 'txt' || song.lyrics.missing) {
      setLoaded(true);
      return;
    }
    void store.storage
      .readBlob(song.lyrics.path)
      .then(decodeText)
      .then((value) => setText(value))
      .finally(() => setLoaded(true));
  }, [loaded, song, store]);

  // Draft is kept on the device until saved or discarded
  useEffect(() => {
    if (!songId || !loaded) return;
    if (text) localStorage.setItem(draftKey(songId), text);
  }, [text, songId, loaded]);

  if (!song) return <Page title={t('lyrics.editorTitle')}>{null}</Page>;

  const save = (force = false) => {
    const current = store.song(song.id)?.lyrics?.path ?? null;
    if (!force && current !== startPath.current) {
      setConfirm(true);
      return;
    }
    localStorage.removeItem(draftKey(song.id));
    void actions
      .saveTypedLyrics(song.id, song.title, text, folder)
      .then(() => notify({ message: t('lyrics.saved') }))
      .catch(() => notify({ message: t('failed') }));
    navigate(-1);
  };

  return (
    <Page title={`${t('lyrics.editorTitle')}: ${song.title}`}>
      <div className={styles.editor}>
        <TextArea label={t('lyrics.editorTitle')} hideLabel value={text} onChange={(e) => setText(e.target.value)} rows={18} className={styles.editorArea} />
        <p className={styles.hint}>{t('lyrics.editorHint')}</p>
        <FolderField label={t('uploads:saveIn')} value={folder} onChange={setFolder} {...pickerProps} />
        <p className={styles.hint}>{t('lyrics.saveNote')}</p>
        <div className={styles.emptyActions}>
          <Button variant="primary" size="lg" onClick={() => save()} disabled={!text.trim()}>
            {t('lyrics.save')}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              localStorage.removeItem(draftKey(song.id));
              navigate(-1);
            }}
          >
            {t('common:actions.cancel')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('lyrics.changedTitle')}
        text={t('lyrics.changedText')}
        confirmLabel={t('lyrics.saveAnyway')}
        cancelLabel={t('common:actions.cancel')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          save(true);
        }}
      />
    </Page>
  );
}
