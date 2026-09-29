import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMinutes } from '@/core/i18n/format';
import type { Song } from '@/features/songs/model';
import { durations, numbering, type Setlist } from './model';
import styles from './Setlists.module.css';

interface SetlistSheetProps {
  setlist: Setlist;
  songById: Map<string, Song>;
  personal: Record<string, string>;
  showPersonal?: boolean;
  currentEntryId?: string | null;
  onEntryClick?: (entryId: string) => void;
  onEditPersonal?: (entryId: string) => void;
  /** print: "Set 1 (Fortsetzung)" is handled by the browser; blocks avoid page breaks */
  fontScale?: number;
}

/** Read-only rendering used by detail, stage view and print (F7 §4.2, §4.4, §4.5). */
export function SetlistSheet({ setlist, songById, personal, showPersonal = true, currentEntryId, onEntryClick, onEditPersonal, fontScale = 1 }: SetlistSheetProps) {
  const { t } = useTranslation('setlists');
  const numbers = numbering(setlist);
  const d = durations(setlist, (id) => songById.get(id)?.recording?.durationSec);
  return (
    <div className={styles.sheet} style={{ fontSize: `${fontScale}em` }}>
      {setlist.blocks.map((block, bi) => (
        <div key={block.id} className={styles.block}>
          <div className={styles.blockHead}>
            <span>{block.name}</span>
            <span>
              {formatMinutes((d.blocks[bi]?.seconds ?? 0) / 60)}
              {d.blocks[bi]?.unknown ? ' +?' : ''}
            </span>
          </div>
          <ul className={styles.entries}>
            {block.entries.map((entry) => {
              if (entry.type === 'interlude') {
                return (
                  <li key={entry.id} className={styles.interlude}>
                    {entry.text}
                    {entry.durationMin ? ` (${entry.durationMin} Min.)` : ''}
                  </li>
                );
              }
              const song = songById.get(entry.songId);
              const mine = personal[entry.id];
              return (
                <li key={entry.id}>
                  <div
                    className={styles.song}
                    data-current={currentEntryId === entry.id || undefined}
                    onClick={onEntryClick ? () => onEntryClick(entry.id) : undefined}
                  >
                    <span className={styles.num}>{numbers.get(entry.id)}</span>
                    <span className={styles.songTitle} data-missing={!song || undefined}>
                      {song?.title ?? t('missingSong')}
                      {song?.archived && <small> · {t('archived')}</small>}
                    </span>
                    {entry.note && <span className={styles.notes}>{entry.note}</span>}
                    {showPersonal && mine && <span className={styles.myNote}>{mine}</span>}
                    {onEditPersonal && (
                      <button type="button" className={styles.editNote} onClick={() => onEditPersonal(entry.id)} aria-label={`${t('myNote')}: ${song?.title ?? ''}`}>
                        <Pencil size={12} aria-hidden="true" /> {mine ? t('myNote') : `+ ${t('myNote')}`}
                      </button>
                    )}
                  </div>
                  {entry.segueToNext && (
                    <div className={styles.segue} role="img" aria-label={t('segue')}>
                      {/* a text arrow: stays visible in black-and-white prints (F7 §4.5) */}
                      <span aria-hidden="true">↓</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {bi < setlist.blocks.length - 1 && block.pauseAfterMin ? <div className={styles.pause}>{t('pause', { min: block.pauseAfterMin })}</div> : null}
        </div>
      ))}
    </div>
  );
}
