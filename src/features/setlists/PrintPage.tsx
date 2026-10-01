import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button } from '@/ui';
import { songEntries } from './model';
import { PrintSheet } from './PrintSheet';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';
import { useBack } from '@/ui/layout/navigation';

const MY_NOTES_KEY = 'bandapp.print.myNotes';
const ARTISTS_KEY = 'bandapp.print.artists';
/** A4 at 96 dpi: the preview uses the paper's real width and is scaled to the screen */
const PAPER_WIDTH = 794;
const standFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Berlin' });

/** Print view (F7 §4.5): always black on white, no page break inside a block, own notes optional. */
export function PrintPage() {
  const { t } = useTranslation('setlists');
  const { setlistId } = useParams();
  const { goBack } = useBack();
  const { store, setlists, state } = useSetlists();
  const { songById } = useSetlistInfo();
  const setlist = setlists.find((s) => s.id === setlistId);
  const [myNotes, setMyNotes] = useState(() => localStorage.getItem(MY_NOTES_KEY) !== '0');

  useEffect(() => {
    if (setlistId) void store.loadPersonal(setlistId);
  }, [setlistId, store]);

  const [artistsChoice, setArtistsChoice] = useState<boolean | null>(() => {
    const v = localStorage.getItem(ARTISTS_KEY);
    return v === null ? null : v === '1';
  });

  const frame = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [paperHeight, setPaperHeight] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      if (!frame.current || !paper.current) return;
      setScale(Math.min(1, frame.current.clientWidth / PAPER_WIDTH));
      setPaperHeight(paper.current.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    if (frame.current) observer.observe(frame.current);
    if (paper.current) observer.observe(paper.current);
    return () => observer.disconnect();
  });

  if (!setlist) return null;
  // Interpret column: on by default as soon as at least one song has an artist
  const anyArtist = songEntries(setlist).some((e) => songById.get(e.songId)?.artist);
  const showArtists = artistsChoice ?? anyArtist;
  const subtitle = `${setlist.name} - ${t('print.stand', { date: standFormat.format(new Date(setlist.updatedAt)) })}`;

  return (
    <div className={styles.printWrap}>
      <div className={styles.printControls}>
        <Button variant="ghost" icon={<ArrowLeft size={18} />} onClick={() => goBack()}>
          {t('print.back')}
        </Button>
        <label style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={myNotes}
            onChange={(e) => {
              setMyNotes(e.target.checked);
              localStorage.setItem(MY_NOTES_KEY, e.target.checked ? '1' : '0');
            }}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
          />
          {t('print.myNotes')}
        </label>
        <label style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={showArtists}
            onChange={(e) => {
              setArtistsChoice(e.target.checked);
              localStorage.setItem(ARTISTS_KEY, e.target.checked ? '1' : '0');
            }}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
          />
          {t('print.showArtists')}
        </label>
        <Button variant="primary" icon={<Printer size={18} />} onClick={() => window.print()}>
          {t('print.button')}
        </Button>
      </div>
      <p className={styles.hint} data-no-print>
        {t('print.hint')}
      </p>
      {/* The preview is laid out exactly like the A4 paper and scaled down to fit the screen (phones). */}
      <div ref={frame} className={styles.previewFrame} style={{ height: paperHeight ? paperHeight * scale : undefined }}>
        <article ref={paper} className={styles.printPage} style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}>
          <PrintSheet setlist={setlist} songById={songById} personal={state.personal[setlist.id]?.notes ?? {}} showPersonal={myNotes} showArtists={showArtists} subtitle={subtitle} />
        </article>
      </div>
    </div>
  );
}
