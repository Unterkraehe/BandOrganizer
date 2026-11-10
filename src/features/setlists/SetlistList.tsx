import { AudioLines, Music, Pause, Pencil, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { usePlayerEngine, usePlayerSelect } from '@/core/audio/PlayerProvider';
import { formatDuration, formatMinutes } from '@/core/i18n/format';
import { Button, Dialog, Menu, TextField } from '@/ui';
import { durations, NOTE_MAX, numbering, songEntries, type Setlist } from './model';
import { useSetlistMode } from './SetlistModeProvider';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

interface SetlistListProps {
  setlist: Setlist;
  /** show the setlist's name as a link to its page (the panel on the song screen) */
  nameLink?: boolean;
}

/**
 * The one playable setlist (v1.2.0): the same rows on the setlist page and in the song screen's panel.
 * A tap on a song plays the setlist from there; the playing song is highlighted. While this setlist
 * plays, a line above the list holds "Automatisch weiter" and "Beenden". ⋯ per row: open the song, own note.
 */
export function SetlistList({ setlist, nameLink }: SetlistListProps) {
  const { t } = useTranslation('setlists');
  const navigate = useNavigate();
  const notify = useNotify();
  const mode = useSetlistMode();
  const { store, state: lists } = useSetlists();
  const { songById } = useSetlistInfo();
  const engine = usePlayerEngine();
  const player = usePlayerSelect((s) => ({ songId: s.track?.songId, status: s.status }));
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const currentRow = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    void store.loadPersonal(setlist.id);
  }, [setlist.id, store]);

  const active = mode.setlist?.id === setlist.id;
  const index = active ? mode.index : -1;
  // keep the playing song in view when the setlist moves on
  useEffect(() => {
    if (index >= 0) currentRow.current?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);

  const personal = lists.personal[setlist.id]?.notes ?? {};
  const numbers = numbering(setlist);
  const d = durations(setlist, (id) => songById.get(id)?.recording?.durationSec);
  const order = new Map(songEntries(setlist).map((entry, i) => [entry.id, i]));

  return (
    <div className={styles.playList}>
      {(active || nameLink) && (
        <div className={styles.modeLine}>
          {nameLink ? (
            <Link to={`/setlists/${setlist.id}`} className={styles.modeName}>
              {t('mode.banner', { name: setlist.name })}
            </Link>
          ) : (
            <span className={styles.modeName}>{t('mode.playing', { n: index + 1, total: order.size })}</span>
          )}
          {active && (
            <>
              <label className={styles.modeCheck}>
                <input type="checkbox" checked={mode.autoAdvance} onChange={(e) => mode.setAutoAdvance(e.target.checked)} />
                {t('mode.autoAdvance')}
              </label>
              <Button variant="ghost" icon={<X size={18} />} onClick={mode.end}>
                {t('mode.end')}
              </Button>
            </>
          )}
        </div>
      )}
      {setlist.blocks.map((block, bi) => (
        <section key={block.id} className={styles.block}>
          <div className={styles.blockHead}>
            <span>{block.name}</span>
            <span>
              {formatMinutes((d.blocks[bi]?.seconds ?? 0) / 60)}
              {d.blocks[bi]?.unknown ? ' +?' : ''}
            </span>
          </div>
          <ul className={styles.modeList}>
            {block.entries.map((entry) => {
              if (entry.type === 'interlude') {
                return (
                  <li key={entry.id} className={styles.modeSep}>
                    {entry.text}
                    {entry.durationMin ? ` (${entry.durationMin} Min.)` : ''}
                  </li>
                );
              }
              const song = songById.get(entry.songId);
              const playable = Boolean(song?.recording && !song.recording.missing);
              const current = active && order.get(entry.id) === index && player.songId === song?.id;
              const playing = current && (player.status === 'playing' || player.status === 'loading');
              const mine = personal[entry.id];
              const title = song?.title ?? t('missingSong');
              const meta = [song?.recording?.durationSec ? formatDuration(song.recording.durationSec) : null, song?.archived ? t('archived') : null, song && !playable ? t('noFile') : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={entry.id} ref={current ? currentRow : undefined}>
                  <div className={styles.modeRow} data-current={current || undefined}>
                    <button
                      type="button"
                      className={styles.modeMain}
                      aria-current={current || undefined}
                      onClick={() => (current ? engine.toggle() : mode.startAndPlay(setlist.id, entry.id))}
                      disabled={!playable}
                    >
                      <span className={styles.num}>{numbers.get(entry.id)}</span>
                      <span className={styles.modeIcon} aria-hidden="true">
                        {playing ? <Pause size={18} /> : current ? <AudioLines size={18} /> : <Play size={18} />}
                      </span>
                      <span className={styles.modeText}>
                        <strong data-missing={!song || undefined}>{title}</strong>
                        {meta && <span className={styles.meta}>{meta}</span>}
                        {entry.note && <span className={styles.rowNote}>{entry.note}</span>}
                        {mine && <span className={styles.rowMine}>{mine}</span>}
                      </span>
                    </button>
                    <Menu
                      label={t('entryMenu', { title })}
                      items={[
                        { label: t('openSong'), icon: <Music size={18} />, hidden: !song, onSelect: () => navigate(`/songs/${encodeURIComponent(song!.id)}`) },
                        {
                          label: t('myNote'),
                          icon: <Pencil size={18} />,
                          onSelect: () => {
                            setText(mine ?? '');
                            setEditing(entry.id);
                          },
                        },
                      ]}
                    />
                  </div>
                  {entry.segueToNext && (
                    <div className={styles.segue} role="img" aria-label={t('segue')}>
                      <span aria-hidden="true">↓</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {bi < setlist.blocks.length - 1 && block.pauseAfterMin ? <div className={styles.pause}>{t('pause', { min: block.pauseAfterMin })}</div> : null}
        </section>
      ))}

      <Dialog open={editing !== null} title={t('myNote')} closeLabel={t('common:actions.close')} onClose={() => setEditing(null)}>
        <form
          style={{ display: 'grid', gap: 'var(--space-3)' }}
          onSubmit={(e) => {
            e.preventDefault();
            const id = editing!;
            setEditing(null);
            void store.savePersonal(setlist.id, { ...personal, [id]: text }).catch(() => notify({ message: t('editor.failed') }));
          }}
        >
          <TextField label={t('myNote')} placeholder={t('myNotePlaceholder')} hint={t('myNoteHint')} value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_MAX} autoFocus />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary">
              {t('common:actions.save')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
