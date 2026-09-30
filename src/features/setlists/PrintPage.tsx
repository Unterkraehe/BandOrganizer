import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/ui';
import { songEntries } from './model';
import { PrintSheet } from './PrintSheet';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

const MY_NOTES_KEY = 'bandapp.print.myNotes';
const ARTISTS_KEY = 'bandapp.print.artists';
const standFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Berlin' });

/** Print view (F7 §4.5): always black on white, no page break inside a block, own notes optional. */
export function PrintPage() {
  const { t } = useTranslation('setlists');
  const { setlistId } = useParams();
  const navigate = useNavigate();
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

  if (!setlist) return null;
  // Interpret column: on by default as soon as at least one song has an artist
  const anyArtist = songEntries(setlist).some((e) => songById.get(e.songId)?.artist);
  const showArtists = artistsChoice ?? anyArtist;
  const subtitle = `${setlist.name} - ${t('print.stand', { date: standFormat.format(new Date(setlist.updatedAt)) })}`;

  return (
    <div className={styles.printWrap}>
      <div className={styles.printControls}>
        <Button variant="ghost" icon={<ArrowLeft size={18} />} onClick={() => navigate(-1)}>
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
      <article className={styles.printPage}>
        <PrintSheet setlist={setlist} songById={songById} personal={state.personal[setlist.id]?.notes ?? {}} showPersonal={myNotes} showArtists={showArtists} subtitle={subtitle} />
      </article>
    </div>
  );
}
