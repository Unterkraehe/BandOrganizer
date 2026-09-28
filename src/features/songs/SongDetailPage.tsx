import { ArchiveRestore, Music, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button, EmptyState, IconButton, Menu, Page } from '@/ui';
import { useLibrary } from './LibraryProvider';
import type { Recording } from './model';
import { NotesSection } from './NotesSection';
import { PlayerControls } from './PlayerControls';
import type { NoteEntry } from './repository';
import { TagDialog } from './TagDialog';
import { usePlaySong } from './usePlaySong';
import { useSongActions } from './useSongActions';
import { useSongNotes } from './useSongNotes';
import { VersionsSection } from './VersionsSection';
import styles from './SongDetail.module.css';

/** Song detail (F4 §4.2): player, versions, notes. Lyrics follow in M3b. */
export function SongDetailPage() {
  const { t } = useTranslation('songs');
  const { songId } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { songs, state, store, tags } = useLibrary();
  const { play, state: player } = usePlaySong();
  const [tagOpen, setTagOpen] = useState(false);
  const menuFor = useSongActions(() => setTagOpen(true));

  // A merged song id redirects to its target (F4 §7.3)
  const song = songs.find((s) => s.id === songId) ?? songs.find((s) => s.mergedSongIds.includes(songId ?? ''));
  const playingHere = player.track?.songId === song?.id ? song?.recordings.find((r) => r.id === player.track?.id) : undefined;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const recording: Recording | undefined = song?.recordings.find((r) => r.id === chosenId) ?? playingHere ?? song?.recording;
  const notes = useSongNotes(song);

  const markers = useMemo(
    () =>
      notes.entries
        .filter((e) => e.note.positionSec !== null && (e.note.recordingId === recording?.id || e.note.recordingId === null))
        .map((e) => e.note.positionSec!),
    [notes.entries, recording?.id],
  );

  if (!song || !recording) {
    if (state.status === 'scanning' && state.files.length === 0) return <Page title={t('title')}>{null}</Page>;
    return (
      <Page title={t('title')}>
        <EmptyState icon={<Music size={28} />} title={t('notFound')} text="" action={<Button onClick={() => navigate('/songs')}>{t('toList')}</Button>} />
      </Page>
    );
  }

  const songTags = song.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag) => tag !== undefined);
  const chips = [song.key, song.bpm ? t('details.bpmValue', { bpm: song.bpm }) : null, song.tuning].filter(Boolean);

  const jump = (entry: NoteEntry) => {
    const target = song.recordings.find((r) => r.id === entry.note.recordingId && !r.missing) ?? recording;
    setChosenId(target.id);
    play(song, target, entry.note.positionSec ?? 0);
  };

  return (
    <Page
      title={song.title}
      actions={
        <>
          <IconButton label={t('actions.edit')} icon={<Pencil size={20} />} onClick={() => navigate(`/songs/${song.id}/edit`)} />
          <Menu label={t('menu', { title: song.title })} items={menuFor(song)} />
        </>
      }
    >
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

      <PlayerControls song={song} recording={recording} onRecordingChange={(r) => setChosenId(r.id)} markers={markers} />
      <NotesSection song={song} recording={recording} notes={notes} onJump={jump} />
      <VersionsSection song={song} onSelect={(r) => setChosenId(r.id)} />
      {tagOpen && <TagDialog song={song} onClose={() => setTagOpen(false)} />}
    </Page>
  );
}
