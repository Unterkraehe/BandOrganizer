import { AudioLines, Pause, Play, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePlayerEngine, usePlayerSelect } from '@/core/audio/PlayerProvider';
import { formatDuration, formatMinutes } from '@/core/i18n/format';
import { Button, IconButton } from '@/ui';
import { durations, numbering } from './model';
import { useSetlistMode } from './SetlistModeProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

/** Songs screen in setlist mode (F3 §5): banner + queue in setlist order. */
export function SetlistModeView() {
  const { t } = useTranslation('setlists');
  const navigate = useNavigate();
  const mode = useSetlistMode();
  const { songById } = useSetlistInfo();
  const engine = usePlayerEngine();
  const state = usePlayerSelect((s) => ({ track: s.track, status: s.status }));
  const setlist = mode.setlist;
  if (!setlist) return null;
  const numbers = numbering(setlist);
  const total = durations(setlist, (id) => songById.get(id)?.recording?.durationSec);
  const queueIndex = new Map(mode.queue.map((q, i) => [q.entry.id, i]));

  return (
    <section className={styles.banner} aria-label={t('mode.banner', { name: setlist.name })}>
      <div className={styles.bannerHead}>
        <strong>{t('mode.banner', { name: setlist.name })}</strong>
        <span className={styles.meta}>
          {t('mode.count', { count: mode.queue.length })} · {formatMinutes(total.totalSeconds / 60)}
        </span>
        <label className={styles.meta} style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input type="checkbox" checked={mode.autoAdvance} onChange={(e) => mode.setAutoAdvance(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
          {t('mode.autoAdvance')}
        </label>
        <Button
          variant="ghost"
          icon={<X size={18} />}
          onClick={() => {
            mode.end();
            navigate('/songs', { replace: true });
          }}
        >
          {t('mode.end')}
        </Button>
      </div>
      <ul className={styles.modeList}>
        {setlist.blocks.map((block, bi) => (
          <li key={block.id}>
            <div className={styles.modeBlock}>{block.name}</div>
            <ul className={styles.modeList}>
              {block.entries.map((entry) => {
                if (entry.type === 'interlude') return <li key={entry.id} className={styles.modeSep}>{entry.text}</li>;
                const qi = queueIndex.get(entry.id)!;
                const item = mode.queue[qi];
                const song = songById.get(entry.songId);
                const current = qi === mode.index && state.track?.songId === song?.id;
                const playing = current && (state.status === 'playing' || state.status === 'loading');
                return (
                  <li key={entry.id} className={styles.modeRow} data-current={current || undefined}>
                    <button type="button" className={styles.modeMain} onClick={() => (current ? engine.toggle() : mode.playAt(qi))} disabled={!item?.playable}>
                      <span className={styles.num} style={{ minWidth: '2em' }}>{numbers.get(entry.id)}</span>
                      {playing ? <Pause size={18} /> : current ? <AudioLines size={18} /> : <Play size={18} />}
                      <span style={{ display: 'grid', minWidth: 0 }}>
                        <strong style={{ overflowWrap: 'anywhere' }}>{song?.title ?? t('missingSong')}</strong>
                        <span className={styles.meta}>
                          {[song?.recording?.durationSec ? formatDuration(song.recording.durationSec) : null, !item?.playable ? t('noFile') : null, entry.note].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                    {song && <IconButton label={t('actions.open')} icon={<AudioLines size={18} />} onClick={() => navigate(`/songs/${song.id}`)} />}
                    {entry.segueToNext && <span className={styles.segueToggle} aria-label={t('segue')}>↓</span>}
                  </li>
                );
              })}
            </ul>
            {bi < setlist.blocks.length - 1 && block.pauseAfterMin ? <div className={styles.modeSep}>{t('pause', { min: block.pauseAfterMin })}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
