import { CircleStop, Mic, Pin, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayer, usePlayerEngine } from '@/core/audio/PlayerProvider';
import { recordingSupported, useRecorder } from '@/core/audio/recorder';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatAgo, formatDuration } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Avatar, Button, Menu, TextArea } from '@/ui';
import { AudioNote } from './AudioNote';
import { NOTE_AUDIO_MAX_SEC, NOTE_MAX_LENGTH, recordingName, type Recording, type Song } from './model';
import type { NoteEntry, NoteScope } from './repository';
import type { useSongNotes } from './useSongNotes';
import styles from './SongDetail.module.css';

interface NotesSectionProps {
  scope: NoteScope;
  song: Song;
  recording: Recording | null;
  notes: ReturnType<typeof useSongNotes>;
  onJump: (entry: NoteEntry) => void;
}

/** Public and private notes with pins and time markers (F4 §4.2 tabs, §6.4). */
export function NotesSection({ scope, song, recording, notes, onJump }: NotesSectionProps) {
  const { t } = useTranslation('songs');
  const visible = sortNotes(notes.entries.filter((e) => e.scope === scope));

  return (
    <section className={styles.notes}>
      {scope === 'private' && <p className={styles.hint}>{t('notes.privateHint')}</p>}
      <NoteForm key={scope} song={song} recording={recording} scope={scope} onSave={notes.add} />
      {notes.status === 'error' && <p className={styles.hint}>{t('notes.loadError')}</p>}
      {notes.status === 'ready' && visible.length === 0 && (
        <p className={styles.hint}>{scope === 'public' ? t('notes.empty') : t('notes.emptyPrivate')}</p>
      )}
      <ul className={styles.noteList}>
        {visible.map((entry) => (
          <NoteItem key={entry.note.id} entry={entry} song={song} recording={recording} notes={notes} onJump={onJump} />
        ))}
      </ul>
    </section>
  );
}

/** Pinned first, then time-marked by position, then newest first (F4 §6.4). */
function sortNotes(entries: NoteEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.note.pinned !== b.note.pinned) return a.note.pinned ? -1 : 1;
    const pa = a.note.positionSec;
    const pb = b.note.positionSec;
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return b.note.createdAt.localeCompare(a.note.createdAt);
  });
}

function NoteForm({ song, recording, scope, onSave }: { song: Song; recording: Recording | null; scope: NoteScope; onSave: ReturnType<typeof useSongNotes>['add'] }) {
  const { t } = useTranslation('songs');
  const { state } = usePlayer();
  const engine = usePlayerEngine();
  // voice note: the song pauses while you speak (the microphone would pick it up)
  const recorder = useRecorder(NOTE_AUDIO_MAX_SEC, () => engine.getState().status === 'playing' && engine.pause());
  const rec = recorder.state;
  const [text, setText] = useState('');
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = Boolean(recording) && state.track?.songId === song.id && state.track.id === recording?.id;

  const audio = rec.kind === 'done' ? { blob: rec.blob, durationSec: rec.durationSec, mime: rec.mime } : null;
  const canSave = Boolean(text.trim() || audio) && rec.kind !== 'recording' && rec.kind !== 'starting';

  const save = async () => {
    if (!canSave) return;
    if (text.trim().length > NOTE_MAX_LENGTH) {
      setError(t('notes.tooLong'));
      return;
    }
    setError(null);
    // The note appears at once (optimistic); if saving fails the text comes back into the field.
    const sentText = text;
    const sentPosition = position;
    setText('');
    setPosition(null);
    recorder.reset();
    try {
      await onSave(scope, sentText, sentPosition, sentPosition !== null ? (recording?.id ?? null) : null, audio);
    } catch {
      setText(sentText);
      setPosition(sentPosition);
      setError(t('failed'));
    }
  };

  return (
    <div className={styles.noteForm}>
      <TextArea
        label={scope === 'public' ? t('notes.placeholderPublic') : t('notes.placeholderPrivate')}
        hideLabel
        placeholder={audio ? t('notes.audio.optionalText') : scope === 'public' ? t('notes.placeholderPublic') : t('notes.placeholderPrivate')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        error={error ?? undefined}
      />
      {/* voice note: record → listen → save with the note (or discard) */}
      {rec.kind === 'recording' && (
        <div className={styles.recording} role="status">
          <span className={styles.recDot} aria-hidden="true" />
          {t('notes.audio.recording', { time: formatDuration(rec.seconds), max: formatDuration(NOTE_AUDIO_MAX_SEC) })}
          <Button icon={<CircleStop size={18} />} onClick={recorder.stop}>
            {t('notes.audio.stop')}
          </Button>
        </div>
      )}
      {rec.kind === 'done' && (
        <div className={styles.recording}>
          <audio controls src={rec.url} className={styles.preview} aria-label={t('notes.audio.preview')} />
          <Button variant="ghost" icon={<Trash2 size={16} />} onClick={recorder.discard}>
            {t('notes.audio.discard')}
          </Button>
        </div>
      )}
      {rec.kind === 'error' && (
        <p className={styles.recError} role="alert">
          {t(`notes.audio.${rec.reason}`)}
        </p>
      )}
      <div className={styles.noteFormActions}>
        {recordingSupported() && (rec.kind === 'idle' || rec.kind === 'error' || rec.kind === 'starting') && (
          <Button variant="ghost" icon={<Mic size={18} />} onClick={() => void recorder.start()} disabled={rec.kind === 'starting'}>
            {t('notes.audio.record')}
          </Button>
        )}
        {loaded && (
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={position !== null}
              onChange={(event) => setPosition(event.target.checked ? Math.floor(state.position) : null)}
            />
            {t('notes.usePosition', { time: formatDuration(position ?? state.position) })}
          </label>
        )}
        <Button variant="primary" onClick={() => void save()} disabled={!canSave}>
          {t('notes.save')}
        </Button>
      </div>
    </div>
  );
}

function NoteItem({ entry, song, recording, notes, onJump }: { entry: NoteEntry; song: Song; recording: Recording | null; notes: ReturnType<typeof useSongNotes>; onJump: (entry: NoteEntry) => void }) {
  const { t } = useTranslation('songs');
  const notify = useNotify();
  const { members } = useSession();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.note.text);
  const { note } = entry;
  const author = members.find((m) => m.id === note.createdBy);
  const own = note.createdBy === notes.memberId;
  const noteRecording = song.recordings.find((r) => r.id === note.recordingId);
  const otherVersion = note.positionSec !== null && noteRecording && noteRecording.id !== recording?.id;

  const run = (change: 'pin' | 'unpin' | 'delete') =>
    void notes
      .change(entry, change)
      .then((saved) => {
        if (change === 'delete')
          notify({ message: t('notes.deleted'), actionLabel: t('undo'), onAction: () => void notes.change(saved, 'restore') });
      })
      .catch(() => notify({ message: t('failed') }));

  return (
    <li className={styles.note} data-pinned={note.pinned || undefined} id={`note-${note.id}`}>
      <div className={styles.noteHead}>
        {entry.scope === 'public' && author && <Avatar name={author.displayName} color={author.color} size="sm" />}
        <span className={styles.noteMeta}>
          {entry.scope === 'public' && <strong>{author?.displayName ?? '?'}</strong>}
          <span>{formatAgo(note.createdAt)}</span>
          {note.pinned && (
            <span className={styles.pinned}>
              <Pin size={14} aria-hidden="true" />
              {t('notes.pinned')}
            </span>
          )}
        </span>
        <Menu
          label={t('notes.menu')}
          items={[
            {
              label: note.pinned ? t('notes.unpin') : t('notes.pin'),
              onSelect: () => run(note.pinned ? 'unpin' : 'pin'),
              hidden: entry.scope === 'private' && !own,
            },
            { label: t('notes.edit'), onSelect: () => setEditing(true), hidden: !own },
            { label: t('notes.delete'), onSelect: () => run('delete'), danger: true, hidden: !own },
          ]}
        />
      </div>
      {note.positionSec !== null && (
        <button type="button" className={styles.timeChip} onClick={() => onJump(entry)} aria-label={t('notes.jump', { time: formatDuration(note.positionSec) })}>
          <Play size={12} fill="currentColor" aria-hidden="true" />
          {otherVersion
            ? t('notes.otherVersion', { time: formatDuration(note.positionSec), version: recordingName(noteRecording) })
            : formatDuration(note.positionSec)}
        </button>
      )}
      {editing ? (
        <div className={styles.noteForm}>
          <TextArea label={t('notes.edit')} hideLabel value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_MAX_LENGTH} rows={3} />
          <div className={styles.noteFormActions}>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t('notes.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!text.trim() && !note.audio}
              onClick={() =>
                void notes
                  .change(entry, 'edit', text)
                  .then(() => setEditing(false))
                  .catch(() => notify({ message: t('failed') }))
              }
            >
              {t('notes.saveEdit')}
            </Button>
          </div>
        </div>
      ) : (
        note.text && <p className={styles.noteText}>{note.text}</p>
      )}
      {note.audio && <AudioNote entry={entry} />}
    </li>
  );
}
