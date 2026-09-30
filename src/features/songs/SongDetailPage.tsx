import { ArchiveRestore, ListPlus, Maximize2, Music, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { rememberSong } from '@/features/search/recent';
import { useHighlightElement } from '@/features/search/useHighlightTarget';
import { useNotify } from '@/app/notify/NotifyProvider';
import { kindOf } from '@/core/uploads/validate';
import { Button, EmptyState, IconButton, Menu, Page, Tabs } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { LyricsTab } from './lyrics/LyricsTab';
import { LyricsUploadDialog } from './lyrics/LyricsUploadDialog';
import type { Recording } from './model';
import { NotesSection } from './NotesSection';
import { PlayerControls } from './PlayerControls';
import type { NoteEntry } from './repository';
import { TagDialog } from './TagDialog';
import { AddRecordingDialog } from './uploads/AddRecordingDialog';
import { AdoptSuggestionDialog } from './uploads/AdoptSuggestionDialog';
import { usePlaySong } from './usePlaySong';
import { useSongActions } from './useSongActions';
import { useSongNotes } from './useSongNotes';
import { VersionsSection } from './VersionsSection';
import { SetlistModeBar } from '@/features/setlists/SetlistModeBar';
import { InSetlists } from '@/features/setlists/InSetlists';
import { Discussion } from '@/features/chat/Discussion';
import styles from './SongDetail.module.css';

type Tab = 'lyrics' | 'public' | 'private';
const TAB_KEY = 'bandapp.songs.tab';

/** Song detail (F4 §4.2): player, Songtext / notes tabs, versions. */
export function SongDetailPage() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { songs, state, store, tags } = useLibrary();
  const { play, state: player } = usePlaySong();
  const [tagOpen, setTagOpen] = useState(false);
  const [addRecording, setAddRecording] = useState<{ file?: File } | null>(null);
  const [lyricsDrop, setLyricsDrop] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [params] = useSearchParams();
  const urlTab = params.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(() => urlTab ?? (localStorage.getItem(TAB_KEY) as Tab | null) ?? 'lyrics');
  useEffect(() => {
    if (urlTab) setTabState(urlTab);
  }, [urlTab, params]);
  const menuFor = useSongActions(() => setTagOpen(true));

  // A merged song id redirects to its target (F4 §7.3)
  const song = songs.find((s) => s.id === songId) ?? songs.find((s) => s.mergedSongIds.includes(songId ?? ''));
  const playingHere = player.track?.songId === song?.id ? song?.recordings.find((r) => r.id === player.track?.id) : undefined;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const recording: Recording | null = song?.recordings.find((r) => r.id === chosenId) ?? playingHere ?? song?.recording ?? null;
  const notes = useSongNotes(song);
  // "In die Songliste übernehmen" – also opened from the row menu via ?adopt=1
  const [adopting, setAdoptingState] = useState(false);
  const adoptParam = params.get('adopt') === '1';
  useEffect(() => {
    if (adoptParam && song?.suggested) setAdoptingState(true);
  }, [adoptParam, song?.suggested]);
  const setAdopting = (value: boolean) => {
    setAdoptingState(value);
    if (!value && adoptParam) navigate(`/songs/${song?.id ?? ''}`, { replace: true });
  };
  useHighlightElement(params.get('note') ? `note-${params.get('note')}` : null, notes.status === 'ready');
  useEffect(() => {
    if (song) rememberSong(song.id);
  }, [song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markers = useMemo(
    () =>
      notes.entries
        .filter((e) => e.note.positionSec !== null && (e.note.recordingId === recording?.id || e.note.recordingId === null))
        .map((e) => e.note.positionSec!),
    [notes.entries, recording?.id],
  );

  if (!song) {
    if (state.status === 'scanning' && state.files.length === 0) return <Page title={t('title')}>{null}</Page>;
    return (
      <Page title={t('title')}>
        <EmptyState icon={<Music size={28} />} title={t('notFound')} text="" action={<Button onClick={() => navigate('/songs')}>{t('toList')}</Button>} />
      </Page>
    );
  }

  const setTab = (value: Tab) => {
    setTabState(value);
    localStorage.setItem(TAB_KEY, value);
  };
  const songTags = song.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag) => tag !== undefined);
  const chips = [song.key, song.bpm ? t('details.bpmValue', { bpm: song.bpm }) : null, song.tuning].filter(Boolean);
  const publicCount = notes.entries.filter((e) => e.scope === 'public').length;

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

  return (
    <Page
      title={song.title}
      actions={
        <>
          <IconButton label={t('practice.open')} icon={<Maximize2 size={20} />} onClick={() => navigate(`/songs/${song.id}/practice`)} />
          <IconButton label={t('actions.edit')} icon={<Pencil size={20} />} onClick={() => navigate(`/songs/${song.id}/edit`)} />
          <Menu label={t('menu', { title: song.title })} items={menuFor(song)} />
        </>
      }
    >
      <div
        className={styles.dropArea}
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
        {dragging && <div className={styles.dropHint}>{t('uploads:dropOnSong')}</div>}

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

        {(chips.length > 0 || songTags.length > 0) && (
          <div className={styles.chips}>
            {chips.map((chip) => (
              <span key={chip} className={styles.infoChip}>
                {chip}
              </span>
            ))}
            {songTags.map((tag) => (
              <Link key={tag.id} to={`/songs?tag=${tag.id}`} className={styles.tagChip}>
                {tag.name}
              </Link>
            ))}
          </div>
        )}

        <SetlistModeBar songId={song.id} />
        {recording ? (
          <PlayerControls song={song} recording={recording} onRecordingChange={(r) => setChosenId(r.id)} markers={markers} />
        ) : (
          <div className={styles.player}>
            <p className={styles.hint} style={{ textAlign: 'center' }}>
              {t('noRecording')}
            </p>
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setAddRecording({})} style={{ justifySelf: 'center' }}>
              {t('uploads:addRecording')}
            </Button>
          </div>
        )}

        <Tabs
          label={t('lyrics.tab')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'lyrics', label: t('lyrics.tab') },
            { value: 'public', label: t('notes.public'), count: publicCount },
            { value: 'private', label: t('notes.private') },
          ]}
        />
        {tab === 'lyrics' ? (
          <LyricsTab song={song} find={params.get('find')} />
        ) : (
          <NotesSection scope={tab} song={song} recording={recording} notes={notes} onJump={jump} />
        )}
        <InSetlists songId={song.id} mergedIds={song.mergedSongIds} />
        <Discussion context={{ type: 'song', id: song.id }} />
        <VersionsSection song={song} onSelect={(r) => setChosenId(r.id)} onAdd={() => setAddRecording({})} />
      </div>
      {tagOpen && <TagDialog song={song} onClose={() => setTagOpen(false)} />}
      {adopting && song.suggested && <AdoptSuggestionDialog song={song} onClose={() => setAdopting(false)} />}
      {addRecording && <AddRecordingDialog song={song} initialFile={addRecording.file} onClose={() => setAddRecording(null)} />}
      {lyricsDrop && <LyricsUploadDialog song={song} initialFile={lyricsDrop} onClose={() => setLyricsDrop(null)} />}
    </Page>
  );
}
