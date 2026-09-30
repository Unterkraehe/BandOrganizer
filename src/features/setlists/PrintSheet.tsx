import { useId, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Song } from '@/features/songs/model';
import { numbering, type Entry, type Setlist } from './model';
import styles from './Print.module.css';

/**
 * Printed setlist in the band's own layout (v0.12.1, modelled on "Playlist Beimerstetten"):
 * one block per page, table Song | Interpret | Info / Bemerkung, grey bars for songs played
 * as a group, red "DIREKT" arrows, red announcements, a box for the pause.
 */

interface PrintSheetProps {
  setlist: Setlist;
  songById: Map<string, Song>;
  personal: Record<string, string>;
  showPersonal: boolean;
  showArtists: boolean;
  /** "Beimerstetten - Stand: 17.05.26" */
  subtitle: string;
}

/**
 * Red U-turn arrow (like on the band's paper sheets), drawn as SVG so it prints sharply:
 * a thick bent shaft with a dark outline, a slight 3D gradient and a real arrow head.
 */
function DirektArrow() {
  const id = useId();
  const shaft = 'M5 7 H23 A11.5 11.5 0 0 1 23 30 H16';
  return (
    <svg className={styles.arrow} viewBox="0 0 42 42" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5a4f" />
          <stop offset="0.5" stopColor="#e30613" />
          <stop offset="1" stopColor="#a8000c" />
        </linearGradient>
      </defs>
      {/* outline, then the red body on top */}
      <path d={shaft} fill="none" stroke="#5c0006" strokeWidth="9" strokeLinejoin="round" />
      <path d="M17.5 20.5 L3 30 L17.5 39.5 Z" fill="#5c0006" stroke="#5c0006" strokeWidth="2.4" strokeLinejoin="round" />
      <path d={shaft} fill="none" stroke={`url(#${id}-g)`} strokeWidth="6" strokeLinejoin="round" />
      <path d="M16.5 22.6 L5.2 30 L16.5 37.4 Z" fill={`url(#${id}-g)`} />
      {/* small highlight for the 3D look */}
      <path d="M6 5.6 H23" stroke="#ff9a92" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/** Rows fill the page: few songs → big rows and titles, many songs → as big as still fits on A4. */
function sizing(rows: number, withPause: boolean) {
  const available = 1010 - 118 - (withPause ? 120 : 0);
  const row = Math.max(44, Math.min(64, Math.floor(available / Math.max(rows, 1))));
  // capped so that normal titles still fit on one line next to the arrow
  const title = Math.max(24, Math.min(32, Math.round(row * 0.52)));
  return { row, title };
}

/** Position of a song in its group of consecutive songs (between announcements) – for the grey bar. */
function groupPositions(entries: Entry[]): Map<string, 'single' | 'start' | 'middle' | 'end'> {
  const result = new Map<string, 'single' | 'start' | 'middle' | 'end'>();
  let run: string[] = [];
  const flush = () => {
    run.forEach((id, i) => result.set(id, run.length === 1 ? 'single' : i === 0 ? 'start' : i === run.length - 1 ? 'end' : 'middle'));
    run = [];
  };
  for (const e of entries) {
    if (e.type === 'song') run.push(e.id);
    else flush();
  }
  flush();
  return result;
}

export function PrintSheet({ setlist, songById, personal, showPersonal, showArtists, subtitle }: PrintSheetProps) {
  const { t } = useTranslation('setlists');
  const numbers = numbering(setlist);
  return (
    <div className={styles.sheet}>
      {setlist.blocks.map((block, bi) => {
        const groups = groupPositions(block.entries);
        const last = bi === setlist.blocks.length - 1;
        const hasPause = !last && Boolean(block.pauseNote || block.pauseAfterMin);
        const size = sizing(block.entries.length, hasPause);
        const vars = { '--row': `${size.row}px`, '--title': `${size.title}px` } as CSSProperties;
        return (
          <section key={block.id} className={styles.page}>
            <table className={styles.table} data-artists={showArtists || undefined} style={vars}>
              <colgroup>
                <col className={styles.colNr} />
                <col className={styles.colBar} />
                <col />
                {showArtists && <col className={styles.colArtist} />}
                <col className={styles.colInfo} />
              </colgroup>
              <thead>
                <tr className={styles.titleRow}>
                  <th colSpan={showArtists ? 5 : 4}>
                    <span className={styles.blockName}>{block.name}</span>
                    <span className={styles.subtitle}>{subtitle}</span>
                  </th>
                </tr>
                <tr className={styles.headRow}>
                  <th colSpan={3}>{t('print.song')}</th>
                  {showArtists && <th>{t('print.artist')}</th>}
                  <th>{t('print.info')}</th>
                </tr>
              </thead>
              <tbody>
                {block.entries.map((entry, ei) => {
                  const prev = block.entries[ei - 1];
                  // the arrow reaches into the next row as well: keep its title clear of it
                  const afterDirekt = prev?.type === 'song' && prev.segueToNext;
                  if (entry.type === 'interlude') {
                    return (
                      <tr key={entry.id} className={styles.interlude}>
                        <td className={styles.nr} />
                        <td className={styles.barCell} />
                        <td className={styles.announce}>
                          --- {entry.text || '…'} ---
                          {entry.durationMin ? <small> ({t('print.pauseMin', { min: entry.durationMin })})</small> : null}
                        </td>
                        {showArtists && <td />}
                        <td className={styles.info}>{entry.note}</td>
                      </tr>
                    );
                  }
                  const song = songById.get(entry.songId);
                  const mine = showPersonal ? personal[entry.id] : undefined;
                  return (
                    <tr key={entry.id}>
                      <td className={styles.nr}>{numbers.get(entry.id)}</td>
                      <td className={styles.barCell}>
                        {groups.get(entry.id) !== 'single' && <span className={styles.bar} data-pos={groups.get(entry.id)} />}
                      </td>
                      <td className={styles.song} data-direkt={entry.segueToNext || afterDirekt || undefined}>
                        <span className={styles.title}>{song?.title ?? '?'}</span>
                        {entry.segueToNext && (
                          <span className={styles.direkt} aria-label={t('segue')}>
                            <DirektArrow />
                            <span className={styles.direktText}>{t('print.direkt')}</span>
                          </span>
                        )}
                      </td>
                      {showArtists && <td className={styles.artist}>{song?.artist ?? ''}</td>}
                      <td className={styles.info}>
                        {entry.note}
                        {mine && <em className={styles.mine}>{entry.note ? ' · ' : ''}{mine}</em>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasPause && (
              <div className={styles.pauseBox}>
                {block.pauseNote || t('print.pause')}
                {block.pauseAfterMin ? <small> ({t('print.pauseMin', { min: block.pauseAfterMin })})</small> : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
