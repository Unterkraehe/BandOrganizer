import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { useSession } from '@/core/session/BandSession';
import { ConflictError } from '@/core/storage';
import { Button, Page, TextField } from '@/ui';
import { useLibrary } from './LibraryProvider';
import type { DetailsChange } from './library';
import { cleanTitle, KEYS, TUNING_SUGGESTIONS, type Song } from './model';
import { TagDialog } from './TagDialog';
import styles from './SongDetail.module.css';

/** "Song bearbeiten" (F4 §4.4). All fields except the title are optional. */
export function SongEditPage() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const { songs } = useLibrary();
  const song = songs.find((s) => s.id === songId);
  if (!song) return <Page title={t('edit.title')}>{null}</Page>;
  return <SongEditForm song={song} />;
}

function splitKey(key: string | null): { note: string; minor: boolean } {
  if (!key) return { note: '', minor: false };
  const minor = key.endsWith('m');
  return { note: minor ? key.slice(0, -1) : key, minor };
}

function SongEditForm({ song }: { song: Song }) {
  const { t } = useTranslation('songs');
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, tags } = useLibrary();
  const { members } = useSession();
  const meta = store.getState().metas[song.id]?.value;
  const original: DetailsChange = {
    displayTitle: meta?.displayTitle ?? null,
    key: song.key,
    bpm: song.bpm,
    tuning: song.tuning,
    tagIds: song.tagIds,
  };
  const [title, setTitle] = useState(song.title);
  const initialKey = splitKey(song.key);
  const [keyNote, setKeyNote] = useState(initialKey.note);
  const [minor, setMinor] = useState(initialKey.minor);
  const [bpm, setBpm] = useState(song.bpm ? String(song.bpm) : '');
  const [tuning, setTuning] = useState(song.tuning ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const taps = useRef<number[]>([]);

  const bpmNumber = bpm.trim() ? Number(bpm) : null;
  const bpmInvalid = bpmNumber !== null && (!Number.isInteger(bpmNumber) || bpmNumber < 20 || bpmNumber > 300);
  const editor = members.find((m) => m.id === meta?.updatedBy);

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((x) => now - x < 3000), now].slice(-8);
    if (taps.current.length >= 3) {
      const intervals = taps.current.slice(1).map((x, i) => x - taps.current[i]!);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(String(Math.round(60_000 / avg)));
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || bpmInvalid) return;
    setBusy(true);
    setError(null);
    const originFile = song.recordings.find((r) => r.originSongId === song.id)?.fileName ?? song.recording.fileName;
    // Same as the automatic title from the file name → store nothing (follows the file)
    const displayTitle = title.trim() === cleanTitle(originFile) ? null : title.trim();
    try {
      await store.updateDetails(
        song.id,
        {
          displayTitle,
          key: keyNote ? `${keyNote}${minor ? 'm' : ''}` : null,
          bpm: bpmNumber,
          tuning: tuning.trim() || null,
          tagIds: song.tagIds,
        },
        original,
      );
      notify({ message: t('edit.saved') });
      navigate(-1);
    } catch (e) {
      setBusy(false);
      if (e instanceof ConflictError) {
        await store.reloadMeta();
        const latest = store.getState().metas[song.id]?.value;
        const name = members.find((m) => m.id === latest?.updatedBy)?.displayName;
        setError(name ? t('edit.conflict', { name }) : t('edit.conflictUnknown'));
      } else setError(t('failed'));
    }
  };

  return (
    <Page title={t('edit.title')}>
      <form className={styles.editForm} onSubmit={(event) => void save(event)} noValidate>
        <TextField label={t('edit.songTitle')} hint={t('edit.titleHint')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />

        <fieldset className={styles.fieldset}>
          <legend>{t('edit.key')}</legend>
          <div className={styles.keyRow}>
            <select aria-label={t('edit.key')} value={keyNote} onChange={(e) => setKeyNote(e.target.value)} className={styles.select}>
              <option value="">{t('edit.keyNone')}</option>
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} disabled={!keyNote} />
              {t('edit.minor')}
            </label>
          </div>
        </fieldset>

        <div className={styles.bpmRow}>
          <TextField
            label={t('edit.bpm')}
            inputMode="numeric"
            value={bpm}
            onChange={(e) => setBpm(e.target.value.replace(/[^0-9]/g, ''))}
            error={bpmInvalid ? t('edit.bpmInvalid') : undefined}
            maxLength={3}
          />
          <Button onClick={tap} aria-label={t('edit.tapHint')} title={t('edit.tapHint')}>
            {t('edit.tap')}
          </Button>
        </div>

        <TextField label={t('edit.tuning')} hint={t('edit.tuningHint')} value={tuning} onChange={(e) => setTuning(e.target.value)} list="tuning-suggestions" maxLength={40} />
        <datalist id="tuning-suggestions">
          {TUNING_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <div className={styles.fieldset}>
          <span className={styles.legend}>{t('edit.tags')}</span>
          <div className={styles.chips} style={{ marginTop: 0 }}>
            {song.tagIds
              .map((id) => tags.find((tag) => tag.id === id))
              .filter((tag) => tag !== undefined)
              .map((tag) => (
                <span key={tag.id} className={styles.tagChip}>
                  {tag.name}
                </span>
              ))}
            <Button onClick={() => setTagOpen(true)}>{t('actions.tags')}</Button>
          </div>
        </div>

        {error && (
          <p className={styles.message} role="alert">
            {error}
          </p>
        )}
        <div className={styles.noteFormActions} style={{ justifyContent: 'flex-start' }}>
          <Button type="submit" variant="primary" size="lg" disabled={busy || !title.trim() || bpmInvalid}>
            {t('edit.save')}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => navigate(-1)}>
            {t('common:actions.cancel')}
          </Button>
        </div>
        {editor && <p className={styles.hint}>{t('edit.lastEdited', { name: editor.displayName })}</p>}
      </form>
      {tagOpen && <TagDialog song={song} onClose={() => setTagOpen(false)} />}
    </Page>
  );
}
