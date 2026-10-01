import { Loader2, Mic, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerEngine } from '@/core/audio/PlayerProvider';
import { formatDuration } from '@/core/i18n/format';
import { useLibrary } from './LibraryProvider';
import { noteAudioPath, type NoteEntry } from './repository';
import { localNoteAudio } from './useSongNotes';
import styles from './SongDetail.module.css';

/** 0.0 s of silence: started inside the tap so iPhones allow the real sound once it has loaded. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
/** one voice note at a time */
let playing: HTMLAudioElement | null = null;

/**
 * Plays a voice note (F4 §6.4a, v0.19.0). Loads the file only on the first tap; pauses the song player
 * meanwhile – never two sounds at once.
 */
export function AudioNote({ entry }: { entry: NoteEntry }) {
  const { t } = useTranslation('songs');
  const { store } = useLibrary();
  const engine = usePlayerEngine();
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const loading = useRef(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [position, setPosition] = useState(0);
  const duration = entry.note.audio?.durationSec ?? 0;

  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  const element = () => {
    if (audio.current) return audio.current;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('play', () => !loading.current && setStatus('playing'));
    a.addEventListener('pause', () => !loading.current && setStatus((s) => (s === 'playing' ? 'paused' : s)));
    a.addEventListener('ended', () => {
      if (loading.current) return;
      setStatus('idle');
      setPosition(0);
    });
    a.addEventListener('timeupdate', () => !loading.current && setPosition(a.currentTime));
    audio.current = a;
    return a;
  };

  const toggle = async () => {
    const a = element();
    if (status === 'playing') return a.pause();
    if (playing && playing !== a) playing.pause();
    playing = a;
    if (engine.getState().status === 'playing') engine.pause();
    if (!url.current) {
      loading.current = true;
      setStatus('loading');
      a.src = SILENCE;
      void a.play().catch(() => undefined); // inside the tap (iOS)
      try {
        const path = noteAudioPath(store.appRoot, entry);
        const blob = localNoteAudio.get(entry.note.id) ?? (path ? await store.storage.readBlob(path) : null);
        if (!blob) throw new Error('no audio');
        url.current = URL.createObjectURL(blob);
        a.src = url.current;
      } catch {
        loading.current = false;
        setStatus('error');
        return;
      }
      loading.current = false;
    }
    a.play().catch(() => setStatus('paused'));
  };

  const isPlaying = status === 'playing';
  return (
    <div className={styles.audioNote}>
      <button type="button" className={styles.audioPlay} onClick={() => void toggle()} aria-label={isPlaying ? t('notes.audio.pause') : t('notes.audio.play')}>
        {status === 'loading' ? <Loader2 size={18} className={styles.spin} /> : isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <span className={styles.audioLabel}>
        <Mic size={14} aria-hidden="true" />
        {t('notes.audio.label')}
      </span>
      <span className={styles.audioTime}>
        {status === 'idle' ? formatDuration(duration) : `${formatDuration(position)} / ${formatDuration(duration)}`}
      </span>
      <span className={styles.audioBar} aria-hidden="true">
        <span style={{ width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }} />
      </span>
      {status === 'error' && (
        <span className={styles.audioError} role="alert">
          {t('notes.audio.loadError')}
        </span>
      )}
    </div>
  );
}
