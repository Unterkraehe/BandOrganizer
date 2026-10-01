import { ChevronDown, Loader2, Minus, NotebookText, Pause, Play, Plus, RotateCcw, RotateCw, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePlayer } from '@/core/audio/PlayerProvider';
import { formatDuration } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Button, EmptyState, IconButton, Menu, SegmentedControl, SeekBar, type MenuItem } from '@/ui';
import { useBack } from '@/ui/layout/navigation';
import { useIsWide } from '@/ui/useMediaQuery';
import { useSetlistMode } from '@/features/setlists/SetlistModeProvider';
import { SetlistQueue } from '@/features/setlists/SetlistQueue';
import { useLibrary } from '../LibraryProvider';
import { LyricsContentView } from '../lyrics/LyricsContentView';
import { useLyrics } from '../lyrics/useLyrics';
import { recordingName, type Recording, type Song } from '../model';
import type { NoteEntry } from '../repository';
import { usePlaySong } from '../usePlaySong';
import { useSongNotes } from '../useSongNotes';
import { PracticeControls } from '../practice/PracticeControls';
import { practiceSummary } from '../practice/summary';
import styles from './Player.module.css';

const SIZE_KEY = 'bandapp.practice.size';
type View = 'lyrics' | 'practice' | 'queue';
const VIEWS: View[] = ['lyrics', 'practice', 'queue'];
/** how long the closing animation runs before the screen below takes over */
const CLOSE_MS = 200;

/**
 * The player (F9, v0.16.0): one full-screen view for listening and practising – it grows out of the
 * mini player and closes back into it. Songtext / Üben (tempo, pitch, A–B loop) / Setlist (queue while a
 * setlist plays). Replaces the old practice view; the song page is about the song, this is about playing.
 *
 * Which song: `?song=<id>` (opened from a song page), else the playing track, else the first song of
 * the playing setlist. `?view=lyrics|practice|queue` picks the tab.
 */
export function PlayerPage() {
  const { t } = useTranslation('songs');
  const [params, setParams] = useSearchParams();
  const { goBack } = useBack();
  const navigate = useNavigate();
  const { songs } = useLibrary();
  const { state } = usePlayer();
  const mode = useSetlistMode();
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  useWakeLock();
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const find = (id: string | null | undefined) => (id ? (songs.find((s) => s.id === id) ?? songs.find((s) => s.mergedSongIds.includes(id))) : undefined);
  const song = find(params.get('song')) ?? find(state.track?.songId) ?? mode.queue.find((q) => q.playable)?.song;
  const requested = params.get('view') as View | null;
  const view: View = requested && VIEWS.includes(requested) && (requested !== 'queue' || mode.setlist) ? requested : 'lyrics';
  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    p.set('view', next);
    setParams(p, { replace: true });
  };

  const close = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(goBack, CLOSE_MS);
  };

  return (
    <div className={styles.page} data-closing={closing || undefined} role="dialog" aria-modal="true" aria-label={song ? t('player.dialog', { title: song.title }) : t('player.title')}>
      {song ? (
        <Player song={song} view={view} setView={setView} close={close} />
      ) : (
        <>
          <header className={styles.header}>
            <IconButton label={t('player.close')} icon={<ChevronDown size={24} />} onClick={close} />
            <h1 className={styles.title}>{t('player.title')}</h1>
          </header>
          <EmptyState icon={null} title={t('player.empty')} text={t('player.emptyText')} action={<Button onClick={() => navigate('/songs', { replace: true })}>{t('player.toSongs')}</Button>} />
        </>
      )}
    </div>
  );
}

/** Old address of the practice view (`/songs/:id/practice`, before v0.16.0) → the player's "Üben" tab. */
export function PracticeRedirect() {
  const { songId } = useParams();
  return <Navigate to={`/player?song=${encodeURIComponent(songId ?? '')}&view=practice`} replace />;
}

function Player({ song, view, setView, close }: { song: Song; view: View; setView: (view: View) => void; close: () => void }) {
  const { t } = useTranslation('songs');
  const navigate = useNavigate();
  const wide = useIsWide();
  const { play, engine } = usePlaySong();
  const { state } = usePlayer();
  const mode = useSetlistMode();
  const notes = useSongNotes(song);
  const { content, status } = useLyrics(song);
  const [size, setSize] = useState(() => Number(localStorage.getItem(SIZE_KEY)) || 1.2);
  const [notesOpen, setNotesOpen] = useState(false);
  const current = state.track?.songId === song.id;
  const recording: Recording | null = (current ? song.recordings.find((r) => r.id === state.track?.id) : null) ?? song.recording;
  const playing = current && state.status === 'playing';
  const loading = current && state.status === 'loading';
  const summary = current ? practiceSummary(state, t) : '';

  // setlist: position of this song in the queue (prefer the current one if a song is in it twice)
  const queueIndex = !mode.setlist
    ? -1
    : mode.queue[mode.index]?.song?.id === song.id
      ? mode.index
      : mode.queue.findIndex((q) => q.song?.id === song.id);
  const inSetlist = queueIndex >= 0;
  const subtitle = [
    inSetlist ? `${mode.setlist!.name} · ${t('setlists:mode.position', { n: queueIndex + 1, total: mode.queue.length })}` : recording ? recordingName(recording) : '',
    summary,
  ]
    .filter(Boolean)
    .join(' · ');

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

  const notesContent = <PlayerNotes entries={notes.entries} position={current ? state.position : -1} onJump={jump} />;
  const menu: MenuItem[] = [
    { label: t('player.toSong'), onSelect: () => navigate(`/songs/${song.id}`) },
    ...(mode.setlist ? [{ label: t('player.toSetlist'), onSelect: () => navigate(`/setlists/${mode.setlist!.id}`) }] : []),
  ];
  const views = [
    { value: 'lyrics' as const, label: t('player.views.lyrics') },
    { value: 'practice' as const, label: t('player.views.practice') },
    ...(mode.setlist ? [{ value: 'queue' as const, label: t('player.views.queue') }] : []),
  ];
  const playable = song.recordings.filter((r) => !r.missing);

  // messages (toasts) float above the player's controls, never on top of them (R-UI-11 rule 5)
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const root = document.documentElement.style;
    const update = () => root.setProperty('--dock-h', `${dock.offsetHeight}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(dock);
    return () => {
      observer?.disconnect();
      root.removeProperty('--dock-h');
    };
  }, []);

  return (
    <>
      <header className={styles.header}>
        <IconButton label={t('player.close')} icon={<ChevronDown size={24} />} onClick={close} />
        <div className={styles.heading}>
          <h1 className={styles.title}>{song.title}</h1>
          {/* always one line of space: nothing below moves when practice settings appear (R-UI-11) */}
          <p className={styles.subtitle}>{subtitle || ' '}</p>
        </div>
        <Menu label={t('player.menu')} items={menu} />
      </header>

      <div className={styles.tabs}>
        <SegmentedControl label={t('player.viewLabel')} options={views} value={view} onChange={setView} />
      </div>

      <div className={styles.body}>
        {view === 'lyrics' && (
          <>
            <div className={styles.lyricsPane}>
              <div className={styles.lyricsTools}>
                {!wide && (
                  <Button variant="ghost" icon={<NotebookText size={18} />} onClick={() => setNotesOpen(true)}>
                    {t('practice.notes')}
                    {notes.entries.length ? ` (${notes.entries.length})` : ''}
                  </Button>
                )}
                <span className={styles.sizeButtons}>
                  <IconButton label={t('practice.smaller')} icon={<Minus size={18} />} onClick={() => changeSize(-0.1)} />
                  <IconButton label={t('practice.textSize')} icon={<Plus size={18} />} onClick={() => changeSize(0.1)} />
                </span>
              </div>
              {status === 'loading' && <p className={styles.hint}>{t('lyrics.loading')}</p>}
              {content && content.kind !== 'unsupported' ? <LyricsContentView content={content} size={size} /> : status !== 'loading' && <p className={styles.hint}>{t('practice.noLyrics')}</p>}
            </div>
            {wide && <aside className={styles.notesPane}>{notesContent}</aside>}
          </>
        )}
        {view === 'practice' && (
          <div className={styles.pane}>
            {current ? <PracticeControls engine={engine} state={state} /> : <p className={styles.hint}>{t('player.playToPractice')}</p>}
          </div>
        )}
        {view === 'queue' && (
          <div className={styles.pane}>
            <SetlistQueue />
          </div>
        )}
      </div>

      <div ref={dockRef} className={styles.dock}>
        {playable.length > 1 && (
          <select
            aria-label={t('versions.select')}
            value={recording?.id ?? ''}
            onChange={(e) => {
              const next = song.recordings.find((r) => r.id === e.target.value);
              if (next) play(song, next);
            }}
            className={styles.versionSelect}
          >
            {playable.map((r) => (
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
          {/* setlist buttons keep their place when no setlist plays (hidden, not removed – R-UI-11) */}
          <IconButton label={t('setlists:mode.previous')} icon={<SkipBack size={22} />} onClick={mode.previous} disabled={!inSetlist} style={{ visibility: inSetlist ? 'visible' : 'hidden' }} />
          <IconButton label={t('player.back10')} icon={<RotateCcw size={24} />} onClick={() => engine.skip(-10)} disabled={!current} />
          <button
            type="button"
            className={styles.bigPlay}
            aria-label={playing ? t('player.pause') : loading ? t('player.loading') : t('player.play')}
            onClick={() => (current ? (engine.unlock(), engine.toggle()) : play(song, recording))}
            disabled={!recording || recording.missing}
          >
            {loading ? <Loader2 size={28} className={styles.spin} /> : playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: 3 }} />}
          </button>
          <IconButton label={t('player.forward10')} icon={<RotateCw size={24} />} onClick={() => engine.skip(10)} disabled={!current} />
          <IconButton label={t('setlists:mode.next')} icon={<SkipForward size={22} />} onClick={mode.next} disabled={!inSetlist} style={{ visibility: inSetlist ? 'visible' : 'hidden' }} />
        </div>
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
    </>
  );
}

/** Pinned first, then by position, then newest (F4 §4.3); highlights notes near the playhead. */
function PlayerNotes({ entries, position, onJump }: { entries: NoteEntry[]; position: number; onJump: (entry: NoteEntry) => void }) {
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

/** Keeps the screen on while the player is open (Wake Lock API, where supported). */
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
