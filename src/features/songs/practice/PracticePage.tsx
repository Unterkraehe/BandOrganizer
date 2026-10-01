import { Loader2, NotebookText, Pause, Play, RotateCcw, RotateCw, X, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '@/core/audio/PlayerProvider';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDuration } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { IconButton, SeekBar } from '@/ui';
import { useIsWide } from '@/ui/useMediaQuery';
import { useLibrary } from '../LibraryProvider';
import { LyricsContentView } from '../lyrics/LyricsContentView';
import { useLyrics } from '../lyrics/useLyrics';
import { recordingName, type Recording, type Song } from '../model';
import type { NoteEntry } from '../repository';
import { usePlaySong } from '../usePlaySong';
import { useSongNotes } from '../useSongNotes';
import { PracticeControls } from './PracticeControls';
import { practiceSummary } from './summary';
import { SetlistModeBar } from '@/features/setlists/SetlistModeBar';
import styles from './Practice.module.css';

const SIZE_KEY = 'bandapp.practice.size';

/** Full-screen practice view (F4 §4.3): lyrics, notes, tempo, pitch, A–B loop. Screen stays on. */
export function PracticePage() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const navigate = useNavigate();
  const { songs } = useLibrary();
  const song = songs.find((s) => s.id === songId) ?? songs.find((s) => s.mergedSongIds.includes(songId ?? ''));
  useWakeLock();
  if (!song) return null;
  return <Practice song={song} onClose={() => navigate(-1)} t={t} />;
}

function Practice({ song, onClose, t }: { song: Song; onClose: () => void; t: ReturnType<typeof useTranslation>['t'] }) {
  const wide = useIsWide();
  const { play, engine } = usePlaySong();
  const { state } = usePlayer();
  const notes = useSongNotes(song);
  const { content, status } = useLyrics(song);
  const [size, setSize] = useState(() => Number(localStorage.getItem(SIZE_KEY)) || 1.2);
  const [notesOpen, setNotesOpen] = useState(false);
  const current = state.track?.songId === song.id;
  const recording: Recording | null = (current ? song.recordings.find((r) => r.id === state.track?.id) : null) ?? song.recording;
  const playing = current && state.status === 'playing';
  const loading = current && state.status === 'loading';
  const summary = current ? practiceSummary(state, t) : null;

  const markers = useMemo(
    () => notes.entries.filter((e) => e.note.positionSec !== null && (e.note.recordingId === recording?.id || !e.note.recordingId)).map((e) => e.note.positionSec!),
    [notes.entries, recording?.id],
  );

  const changeSize = (delta: number) => {
    const next = Math.min(2.4, Math.max(0.8, Math.round((size + delta) * 10) / 10));
    setSize(next);
    localStorage.setItem(SIZE_KEY, String(next));
  };

  const jump = (entry: NoteEntry) => {
    const target = song.recordings.find((r) => r.id === entry.note.recordingId && !r.missing) ?? recording;
    if (target) play(song, target, entry.note.positionSec ?? 0);
  };

  const notesContent = <PracticeNotes entries={notes.entries} position={current ? state.position : -1} onJump={jump} />;

  return (
    <div className={styles.page} role="dialog" aria-modal="true" aria-label={`${t('practice.title')}: ${song.title}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{song.title}</h1>
        {summary && <span className={styles.summary}>{summary}</span>}
        {!wide && <IconButton className={styles.notesButton} label={t('practice.notes')} icon={<NotebookText size={20} />} onClick={() => setNotesOpen(true)} />}
        <IconButton label={t('practice.smaller')} icon={<Minus size={18} />} onClick={() => changeSize(-0.1)} />
        <IconButton label={t('practice.textSize')} icon={<Plus size={18} />} onClick={() => changeSize(0.1)} />
        <IconButton label={t('practice.close')} icon={<X size={22} />} onClick={onClose} />
      </header>

      <div className={styles.body}>
        <div className={styles.lyricsPane}>
          {status === 'loading' && <p className={styles.hint}>{t('lyrics.loading')}</p>}
          {content && content.kind !== 'unsupported' ? <LyricsContentView content={content} size={size} /> : status !== 'loading' && <p className={styles.hint}>{t('practice.noLyrics')}</p>}
        </div>
        {wide && <aside className={styles.notesPane}>{notesContent}</aside>}
      </div>

      <div className={styles.dock}>
        <div className={styles.dockMain}>
          <SetlistModeBar songId={song.id} />
          {song.recordings.filter((r) => !r.missing).length > 1 && (
            <select
              aria-label={t('versions.select')}
              value={recording?.id ?? ''}
              onChange={(e) => {
                const next = song.recordings.find((r) => r.id === e.target.value);
                if (next) play(song, next);
              }}
              className={styles.versionSelect}
            >
              {song.recordings
                .filter((r) => !r.missing)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {recordingName(r)}
                    {r.id === song.recording?.id ? ` ★ ${t('versions.band')}` : ''}
                  </option>
                ))}
            </select>
          )}
          <SeekBar
            label={t('player.position')}
            position={current ? state.position : 0}
            duration={current ? state.duration : (recording?.durationSec ?? 0)}
            disabled={!current}
            onSeek={(s) => engine.seek(s)}
            markers={markers}
            loop={current ? state.loop : null}
          />
          <div className={styles.transport}>
            <IconButton label={t('player.back10')} icon={<RotateCcw size={24} />} onClick={() => engine.skip(-10)} disabled={!current} />
            <button
              type="button"
              className={styles.bigPlay}
              aria-label={playing ? t('player.pause') : t('player.play')}
              onClick={() => (current ? (engine.unlock(), engine.toggle()) : play(song, recording))}
              disabled={!recording}
            >
              {loading ? <Loader2 size={28} /> : playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: 3 }} />}
            </button>
            <IconButton label={t('player.forward10')} icon={<RotateCw size={24} />} onClick={() => engine.skip(10)} disabled={!current} />
          </div>
        </div>
        {current ? (
          <PracticeControls engine={engine} state={state} compact={!wide} />
        ) : (
          <p className={styles.hint} style={{ textAlign: 'center' }}>
            {recording ? t('player.play') : t('noRecording')}
          </p>
        )}
      </div>

      {!wide && notesOpen && (
        <div className={styles.sheet} role="dialog" aria-label={t('practice.notes')}>
          <div className={styles.sheetHead}>
            <strong>{t('practice.notes')}</strong>
            <IconButton label={t('common:actions.close')} icon={<X size={20} />} onClick={() => setNotesOpen(false)} />
          </div>
          {notesContent}
        </div>
      )}
    </div>
  );
}

/** Pinned first, then by position, then newest (F4 §4.3); highlights notes near the playhead. */
function PracticeNotes({ entries, position, onJump }: { entries: NoteEntry[]; position: number; onJump: (entry: NoteEntry) => void }) {
  const { t } = useTranslation('songs');
  const { members } = useSession();
  const sort = (list: NoteEntry[]) =>
    [...list].sort((a, b) => {
      if (a.note.pinned !== b.note.pinned) return a.note.pinned ? -1 : 1;
      const pa = a.note.positionSec;
      const pb = b.note.positionSec;
      if (pa !== null && pb !== null) return pa - pb;
      if (pa !== null) return -1;
      if (pb !== null) return 1;
      return b.note.createdAt.localeCompare(a.note.createdAt);
    });
  const section = (title: string, list: NoteEntry[]) => (
    <>
      <h2 className={styles.sectionLabel}>{title}</h2>
      {list.length === 0 ? (
        <p className={styles.hint}>{t('practice.noNotes')}</p>
      ) : (
        <ul className={styles.notesList}>
          {sort(list).map((entry) => {
            const p = entry.note.positionSec;
            const active = p !== null && position >= p && position < p + 6;
            const author = members.find((m) => m.id === entry.note.createdBy);
            return (
              <li key={entry.note.id} className={styles.note} data-pinned={entry.note.pinned || undefined} data-active={active || undefined}>
                {p !== null && (
                  <button type="button" className={styles.timeChip} onClick={() => onJump(entry)} aria-label={t('notes.jump', { time: formatDuration(p) })}>
                    ▶ {formatDuration(p)}
                  </button>
                )}
                <span className={styles.noteText}>{entry.note.text}</span>
                {entry.scope === 'public' && author && <span className={styles.noteMeta}>{author.displayName}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
  return (
    <div>
      {section(t('practice.forAll'), entries.filter((e) => e.scope === 'public'))}
      {section(t('practice.onlyMe'), entries.filter((e) => e.scope === 'private'))}
    </div>
  );
}

/** Keeps the screen on while practicing (Wake Lock API, where supported). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        // not supported / denied – nothing to do
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
