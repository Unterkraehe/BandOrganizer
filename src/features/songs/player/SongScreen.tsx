import { ArchiveRestore, ArrowLeft, ChevronUp, Info, ListMusic, ListPlus, Loader2, Music, Pause, Pencil, Play, Plus, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { usePlayer, usePlayerSelect } from '@/core/audio/PlayerProvider';
import { kindOf } from '@/core/uploads/validate';
import { Discussion } from '@/features/chat/Discussion';
import { rememberSong } from '@/features/search/recent';
import { useHighlightElement } from '@/features/search/useHighlightTarget';
import { InSetlists } from '@/features/setlists/InSetlists';
import { useSetlistMode } from '@/features/setlists/SetlistModeProvider';
import { SetlistList } from '@/features/setlists/SetlistList';
import { Button, Dialog, EmptyState, IconButton, Menu, Page, SegmentedControl, SeekBar } from '@/ui';
import { useBack } from '@/ui/layout/navigation';
import { useIsWide } from '@/ui/useMediaQuery';
import { useLibrary } from '../LibraryProvider';
import { LyricsTab } from '../lyrics/LyricsTab';
import { LyricsUploadDialog } from '../lyrics/LyricsUploadDialog';
import { recordingName, type Recording, type Song } from '../model';
import { NotesSection } from '../NotesSection';
import { PracticeControls } from '../practice/PracticeControls';
import { playbackProblem, practiceSummary } from '../practice/summary';
import type { NoteEntry } from '../repository';
import { TagDialog } from '../TagDialog';
import { AddRecordingDialog } from '../uploads/AddRecordingDialog';
import { AdoptSuggestionDialog } from '../uploads/AdoptSuggestionDialog';
import { usePlaySong } from '../usePlaySong';
import { useSongActions } from '../useSongActions';
import { useSongNotes } from '../useSongNotes';
import { VersionsSection } from '../VersionsSection';
import detail from '../SongDetail.module.css';
import styles from './SongScreen.module.css';

type View = 'practice' | 'lyrics';
type Panel = 'info' | 'setlist' | null;
type Scope = 'public' | 'private';
/** how long the closing animation runs before the screen below takes over */
const CLOSE_MS = 200;

/** `?view=` picks the tab; older links use `?tab=` (search results, notifications, bookmarks). */
function readLink(params: URLSearchParams): { view: View | null; panel: Panel; scope: Scope | null } {
  const view = params.get('view');
  const tab = params.get('tab');
  const panel = params.get('panel');
  return {
    view: view === 'lyrics' || view === 'practice' ? view : tab === 'lyrics' || params.get('find') ? 'lyrics' : tab === 'public' || tab === 'private' || tab === 'notes' ? 'practice' : null,
    panel: panel === 'setlist' || view === 'queue' ? 'setlist' : panel === 'info' || tab === 'versions' || tab === 'info' ? 'info' : null,
    scope: tab === 'public' || tab === 'private' ? tab : null,
  };
}

/**
 * The song screen (v1.1.0): the ONE screen of a song – song page and player in one (R-UX-09). Full
 * screen, with the playback controls always at the bottom.
 * - Tab "Üben" (first): tempo, pitch, A–B loop and the notes. Tab "Songtext": the lyrics.
 *   Tablets and desktops show both side by side.
 * - ⓘ opens the infos (key/BPM/tuning, tags, versions, setlists, discussion) as a panel.
 * - While a setlist plays, a line above the seek bar shows "Stadtfest · 3 / 12 · Nächster: …" and
 *   opens the setlist as a panel; ⏮ ⏭ step through it and the screen follows the playing song.
 * Opened from the song list, search, chat, setlists and the mini player – always this screen.
 */
export function SongScreen() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { goBack } = useBack();
  const { songs, state: library } = useLibrary();
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // A merged song id leads to its target (F4 §7.3)
  const song = songs.find((s) => s.id === songId) ?? songs.find((s) => s.mergedSongIds.includes(songId ?? ''));
  const link = readLink(params);
  const view: View = link.view ?? 'practice';
  const [panel, setPanel] = useState<Panel>(link.panel);
  const panelParam = link.panel;
  useEffect(() => {
    if (panelParam) setPanel(panelParam);
  }, [panelParam, params]);

  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    for (const key of ['tab', 'find', 'note', 'panel']) p.delete(key);
    p.set('view', next);
    setParams(p, { replace: true, preventScrollReset: true });
  };

  // The screen follows the music: when the song shown here was playing and the setlist moves on
  // (⏭, automatic advance, a tap in the setlist panel), the next song is shown – same tab.
  const playingSongId = usePlayerSelect((s) => s.track?.songId ?? null);
  const before = useRef(playingSongId);
  useEffect(() => {
    const previous = before.current;
    before.current = playingSongId;
    if (previous && playingSongId && previous !== playingSongId && previous === song?.id) {
      // an open panel (the setlist) stays open: the list just moves its highlight
      navigate(`/songs/${playingSongId}?view=${view}${panel ? `&panel=${panel}` : ''}`, { replace: true });
    }
  }, [playingSongId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!song) {
    if (library.status === 'scanning' && library.files.length === 0) return <Page title={t('title')}>{null}</Page>;
    return (
      <Page title={t('title')}>
        <EmptyState icon={<Music size={28} />} title={t('notFound')} text="" action={<Button onClick={() => navigate('/songs')}>{t('toList')}</Button>} />
      </Page>
    );
  }

  const close = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(goBack, CLOSE_MS);
  };

  return (
    <div className={styles.page} data-closing={closing || undefined} data-song-screen>
      <SongView key={song.id} song={song} view={view} setView={setView} initialScope={link.scope} panel={panel} setPanel={setPanel} close={close} />
    </div>
  );
}

/** `/player` (mini player of older versions, old links): the song that is playing, or a hint. */
export function PlayerRedirect() {
  const { t } = useTranslation('songs');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = useSetlistMode();
  const playing = usePlayerSelect((s) => s.track?.songId ?? null);
  const songId = params.get('song') ?? playing ?? mode.queue.find((q) => q.playable)?.song?.id;
  if (songId) {
    const view = params.get('view');
    const query = view === 'queue' ? '?panel=setlist' : view === 'lyrics' ? '?view=lyrics' : '';
    return <Navigate to={`/songs/${encodeURIComponent(songId)}${query}`} replace />;
  }
  return (
    <Page title={t('player.title')}>
      <EmptyState icon={null} title={t('player.empty')} text={t('player.emptyText')} action={<Button onClick={() => navigate('/songs', { replace: true })}>{t('player.toSongs')}</Button>} />
    </Page>
  );
}

/** Old address of the practice view (`/songs/:id/practice`, before v0.16.0) → the song screen. */
export function PracticeRedirect() {
  const { songId } = useParams();
  return <Navigate to={`/songs/${encodeURIComponent(songId ?? '')}`} replace />;
}

interface SongViewProps {
  song: Song;
  view: View;
  setView: (view: View) => void;
  initialScope: Scope | null;
  panel: Panel;
  setPanel: (panel: Panel) => void;
  close: () => void;
}

function SongView({ song, view, setView, initialScope, panel, setPanel, close }: SongViewProps) {
  const { t } = useTranslation('songs');
  const navigate = useNavigate();
  const notify = useNotify();
  const wide = useIsWide();
  const [params] = useSearchParams();
  const { store, tags } = useLibrary();
  const { play, state: player } = usePlaySong();
  const mode = useSetlistMode();
  const notes = useSongNotes(song);
  const [scope, setScope] = useState<Scope>(initialScope ?? 'public');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [addRecording, setAddRecording] = useState<{ file?: File } | null>(null);
  const [lyricsDrop, setLyricsDrop] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const menuFor = useSongActions(() => setTagOpen(true));

  const current = player.track?.songId === song.id;
  const playingHere = current ? song.recordings.find((r) => r.id === player.track?.id) : undefined;
  const recording: Recording | null = song.recordings.find((r) => r.id === chosenId) ?? playingHere ?? song.recording ?? null;
  const playing = current && player.status === 'playing';
  useWakeLock(playing);

  useEffect(() => rememberSong(song.id), [song.id]);
  useEffect(() => {
    if (initialScope) setScope(initialScope);
  }, [initialScope, params]);
  useHighlightElement(params.get('note') ? `note-${params.get('note')}` : null, notes.status === 'ready' && (wide || view === 'practice'));

  // "In die Songliste übernehmen" – also opened from the row menu via ?adopt=1
  const [adopting, setAdoptingState] = useState(false);
  const adoptParam = params.get('adopt') === '1';
  useEffect(() => {
    if (adoptParam && song.suggested) setAdoptingState(true);
  }, [adoptParam, song.suggested]);
  const setAdopting = (value: boolean) => {
    setAdoptingState(value);
    if (!value && adoptParam) navigate(`/songs/${song.id}`, { replace: true });
  };

  const jump = (entry: NoteEntry) => {
    const target = song.recordings.find((r) => r.id === entry.note.recordingId && !r.missing) ?? recording;
    if (!target) return;
    setChosenId(target.id);
    play(song, target, entry.note.positionSec ?? 0);
  };

  // Desktop drag & drop (F10 §3): audio → new version, documents → lyrics
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const kind = kindOf(file.name);
    if (kind === 'audio') setAddRecording({ file });
    else if (kind === 'lyrics') setLyricsDrop(file);
  };

  const songTags = song.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag) => tag !== undefined);
  const chips = [song.key, song.bpm ? t('details.bpmValue', { bpm: song.bpm }) : null, song.tuning].filter(Boolean);
  const publicCount = notes.entries.filter((e) => e.scope === 'public').length;
  const privateCount = notes.entries.length - publicCount;
  const markers = useMemo(
    () => notes.entries.filter((e) => e.note.positionSec !== null && (e.note.recordingId === recording?.id || !e.note.recordingId)).map((e) => e.note.positionSec!),
    [notes.entries, recording?.id],
  );

  const practicePane = (
    <div className={styles.pane} data-pane="practice">
      {chips.length > 0 && (
        <div className={styles.chips} aria-label={t('detail.info')}>
          {chips.map((chip) => (
            <span key={chip} className={detail.infoChip}>
              {chip}
            </span>
          ))}
        </div>
      )}
      <PracticePanel song={song} />
      <section className={styles.notes} aria-label={t('notes.tab')}>
        <div className={styles.notesHead}>
          <h2 className={styles.sectionTitle}>{t('notes.tab')}</h2>
          <SegmentedControl
            label={t('notes.tab')}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'public', label: publicCount ? `${t('notes.forAll')} (${publicCount})` : t('notes.forAll') },
              { value: 'private', label: privateCount ? `${t('notes.onlyMe')} (${privateCount})` : t('notes.onlyMe') },
            ]}
          />
        </div>
        <NotesSection scope={scope} song={song} recording={recording} notes={notes} onJump={jump} />
      </section>
    </div>
  );
  const lyricsPane = (
    <div className={styles.pane} data-pane="lyrics">
      <LyricsTab song={song} find={params.get('find')} />
    </div>
  );

  return (
    <div
      className={styles.frame}
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className={styles.header}>
        <IconButton label={t('common:actions.back')} icon={<ArrowLeft size={22} />} onClick={close} />
        <div className={styles.heading}>
          <h1 className={styles.title}>{song.title}</h1>
          {/* always one line of space: nothing below moves when practice settings appear (R-UI-11) */}
          <Subtitle song={song} recording={recording} />
        </div>
        <IconButton label={t('player.info')} icon={<Info size={22} />} onClick={() => setPanel('info')} />
        {wide && <IconButton label={t('actions.edit')} icon={<Pencil size={20} />} onClick={() => navigate(`/songs/${song.id}/edit`)} />}
        <Menu label={t('menu', { title: song.title })} items={menuFor(song, { withEdit: !wide })} />
      </header>

      {dragging && <div className={styles.dropHint}>{t('uploads:dropOnSong')}</div>}

      {(song.archived || song.suggested) && (
        <div className={styles.banners}>
          {song.archived && (
            <div className={styles.banner}>
              <span>{t('archive.banner')}</span>
              <Button
                icon={<ArchiveRestore size={18} />}
                onClick={() =>
                  void store
                    .setArchived(song.id, false)
                    .then(() => notify({ message: t('archive.restored', { title: song.title }) }))
                    .catch(() => notify({ message: t('failed') }))
                }
              >
                {t('actions.unarchive')}
              </Button>
            </div>
          )}
          {song.suggested && (
            <div className={styles.banner}>
              <span>
                <strong>{t('suggested.badge')}</strong> · {t('suggested.badgeHint')}
              </span>
              <Button icon={<ListPlus size={18} />} onClick={() => setAdopting(true)}>
                {t('suggested.adopt')}
              </Button>
            </div>
          )}
        </div>
      )}

      {!wide && (
        <div className={styles.tabs}>
          <SegmentedControl
            label={t('player.viewLabel')}
            options={[
              { value: 'practice', label: t('player.views.practice') },
              { value: 'lyrics', label: t('player.views.lyrics') },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
      )}

      <div className={styles.body} data-wide={wide || undefined}>
        {(wide || view === 'practice') && practicePane}
        {(wide || view === 'lyrics') && lyricsPane}
      </div>

      <Dock song={song} recording={recording} markers={markers} onChoose={setChosenId} onAddRecording={() => setAddRecording({})} onOpenSetlist={() => setPanel('setlist')} />

      <Dialog open={panel === 'info'} title={t('detail.info')} closeLabel={t('common:actions.close')} onClose={() => setPanel(null)} fullScreenOnPhone>
        <div className={styles.info}>
          {songTags.length > 0 && (
            <div className={styles.chips}>
              {songTags.map((tag) => (
                <Link key={tag.id} to={`/songs?tag=${tag.id}`} className={detail.tagChip}>
                  {tag.name}
                </Link>
              ))}
            </div>
          )}
          <div className={styles.infoActions}>
            <Button icon={<Pencil size={18} />} onClick={() => navigate(`/songs/${song.id}/edit`)}>
              {t('edit.title')}
            </Button>
          </div>
          <VersionsSection song={song} onSelect={(r) => setChosenId(r.id)} onAdd={() => setAddRecording({})} />
          <InSetlists songId={song.id} mergedIds={song.mergedSongIds} />
          <Discussion context={{ type: 'song', id: song.id }} />
        </div>
      </Dialog>
      <Dialog open={panel === 'setlist' && Boolean(mode.setlist)} title={t('player.views.queue')} closeLabel={t('common:actions.close')} onClose={() => setPanel(null)} fullScreenOnPhone>
        {mode.setlist && <SetlistList setlist={mode.setlist} nameLink />}
      </Dialog>

      {tagOpen && <TagDialog song={song} onClose={() => setTagOpen(false)} />}
      {adopting && song.suggested && <AdoptSuggestionDialog song={song} onClose={() => setAdopting(false)} />}
      {addRecording && <AddRecordingDialog song={song} initialFile={addRecording.file} onClose={() => setAddRecording(null)} />}
      {lyricsDrop && <LyricsUploadDialog song={song} initialFile={lyricsDrop} onClose={() => setLyricsDrop(null)} />}
    </div>
  );
}

/** "Band-Version · 80 % · −2 HT · Schleife" – only re-renders when one of these changes. */
function Subtitle({ song, recording }: { song: Song; recording: Recording | null }) {
  const { t } = useTranslation('songs');
  const settings = usePlayerSelect((s) => (s.track?.songId === song.id ? { tempo: s.tempo, semitones: s.semitones, loop: s.loop } : null));
  const text = [recording ? recordingName(recording) : '', settings ? practiceSummary(settings, t) : ''].filter(Boolean).join(' · ');
  return <p className={styles.subtitle}>{text || ' '}</p>;
}

/** Tempo / pitch / loop for this song; they act on the playing track, so they wait until the song plays. */
function PracticePanel({ song }: { song: Song }) {
  const { engine, state } = usePlayer();
  return <PracticeControls engine={engine} state={state} disabled={state.track?.songId !== song.id} />;
}

interface DockProps {
  song: Song;
  recording: Recording | null;
  markers: number[];
  onChoose: (recordingId: string) => void;
  onAddRecording: () => void;
  onOpenSetlist: () => void;
}

/** Always at the bottom: setlist line (while one plays), seek bar, transport, version choice. */
function Dock({ song, recording, markers, onChoose, onAddRecording, onOpenSetlist }: DockProps) {
  const { t } = useTranslation('songs');
  const { play, engine } = usePlaySong();
  const { state } = usePlayer();
  const mode = useSetlistMode();
  const current = state.track?.songId === song.id;
  const playing = current && state.status === 'playing';
  const loading = current && state.status === 'loading';
  const problem = current && !loading ? playbackProblem(state, t) : null;
  const playable = song.recordings.filter((r) => !r.missing);

  // setlist: position of this song in the queue (prefer the current one if a song is in it twice)
  const queueIndex = !mode.setlist ? -1 : mode.queue[mode.index]?.song?.id === song.id ? mode.index : mode.queue.findIndex((q) => q.song?.id === song.id);
  const inSetlist = queueIndex >= 0;
  const next = inSetlist ? mode.queue.slice(queueIndex + 1).find((q) => q.playable) : undefined;

  // messages (toasts) float above the controls, never on top of them (R-UI-11 rule 5)
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

  if (!recording) {
    return (
      <div ref={dockRef} className={styles.dock}>
        <div className={styles.noRecording}>
          <p className={styles.hint}>{t('noRecording')}</p>
          <Button variant="primary" icon={<Plus size={18} />} onClick={onAddRecording}>
            {t('uploads:addRecording')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={dockRef} className={styles.dock}>
      {inSetlist && (
        <button type="button" className={styles.setlistLine} onClick={onOpenSetlist} aria-label={t('player.setlistOpen', { name: mode.setlist!.name })}>
          <ListMusic size={18} aria-hidden="true" />
          <span className={styles.setlistText}>
            <strong>
              {mode.setlist!.name} · {t('setlists:mode.position', { n: queueIndex + 1, total: mode.queue.length })}
            </strong>
            {next?.song && (
              <span>
                {' · '}
                {t('setlists:mode.nextSong', { title: next.song.title })}
                {mode.queue[queueIndex]?.entry.segueToNext ? ` (${t('setlists:mode.segueNext')})` : ''}
              </span>
            )}
          </span>
          <ChevronUp size={18} aria-hidden="true" />
        </button>
      )}
      <SeekBar
        label={t('player.position')}
        position={current ? state.position : 0}
        duration={current ? state.duration : (recording.durationSec ?? 0)}
        disabled={!current}
        onSeek={(s) => engine.seek(s)}
        markers={markers}
        loop={current ? state.loop : null}
        loopStart={current ? state.loopStart : null}
      />
      <div className={styles.transport}>
        {/* setlist buttons keep their place when no setlist plays (hidden, not removed – R-UI-11) */}
        <IconButton label={t('setlists:mode.previous')} icon={<SkipBack size={22} />} onClick={mode.previous} disabled={!inSetlist || !mode.hasPrevious} style={{ visibility: inSetlist ? 'visible' : 'hidden' }} />
        <IconButton label={t('player.back10')} icon={<RotateCcw size={24} />} onClick={() => engine.skip(-10)} disabled={!current} />
        <button
          type="button"
          className={styles.bigPlay}
          aria-label={playing ? t('player.pause') : loading ? t('player.loading') : t('player.play')}
          onClick={() => (current ? (engine.unlock(), engine.toggle()) : play(song, recording))}
          disabled={recording.missing}
        >
          {loading ? <Loader2 size={28} className={styles.spin} /> : playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: 3 }} />}
        </button>
        <IconButton label={t('player.forward10')} icon={<RotateCw size={24} />} onClick={() => engine.skip(10)} disabled={!current} />
        <IconButton label={t('setlists:mode.next')} icon={<SkipForward size={22} />} onClick={mode.next} disabled={!inSetlist || !mode.hasNext} style={{ visibility: inSetlist ? 'visible' : 'hidden' }} />
      </div>
      {playable.length > 1 && (
        <select
          aria-label={t('versions.select')}
          value={recording.id}
          onChange={(e) => {
            const chosen = song.recordings.find((r) => r.id === e.target.value);
            if (!chosen) return;
            onChoose(chosen.id);
            // switching the version while this song plays continues with the new one; otherwise it is only chosen
            if (current) play(song, chosen);
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
      {/* below the buttons, so nothing moves under the finger (R-UI-11); never a silent failure (R-UX-10) */}
      {problem && (
        <p className={styles.problem} aria-hidden="true">
          {problem}
        </p>
      )}
      <span className="visually-hidden" role="status">
        {problem}
      </span>
    </div>
  );
}

/** Keeps the screen on while this song plays (Wake Lock API, where supported). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const next = (await navigator.wakeLock?.request('screen')) ?? null;
        if (cancelled) void next?.release().catch(() => undefined);
        else lock = next;
      } catch {
        // not supported / denied – nothing to do
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
