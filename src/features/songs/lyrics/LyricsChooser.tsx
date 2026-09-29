import { FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { matchesQuery } from '@/core/search/normalize';
import { dirname } from '@/core/storage';
import { Dialog } from '@/ui';
import { useLibrary } from '../LibraryProvider';
import { baseTitle, cleanTitle, relativeFolder, type Song } from '../model';
import styles from './Lyrics.module.css';

/** Pick an existing lyrics file from the HiDrive (F4 §6.3 manual linking). */
export function LyricsChooser({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useTranslation('songs');
  const notify = useNotify();
  const { store, state } = useLibrary();
  const [query, setQuery] = useState('');
  const base = baseTitle(song.title);
  const docs = useMemo(() => {
    const list = state.documents.filter((d) => matchesQuery(`${d.name} ${d.path}`, query));
    const similar = list.filter((d) => baseTitle(cleanTitle(d.name)).includes(base));
    return [...similar, ...list.filter((d) => !similar.includes(d))].slice(0, 200);
  }, [state.documents, query, base]);

  return (
    <Dialog open title={t('lyrics.chooserTitle')} closeLabel={t('common:actions.close')} onClose={onClose}>
      <label className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input type="search" placeholder={t('lyrics.searchFiles')} aria-label={t('lyrics.searchFiles')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      {docs.length === 0 ? (
        <p className={styles.hint}>{t('lyrics.chooserEmpty')}</p>
      ) : (
        <ul className={styles.docList}>
          {docs.map((doc) => (
            <li key={doc.path}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void store
                    .linkLyrics(song.id, doc.path, doc.id)
                    .then(() => notify({ message: t('lyrics.linked') }))
                    .catch(() => notify({ message: t('failed') }));
                }}
              >
                <FileText size={18} aria-hidden="true" />
                <span>
                  <strong>{doc.name}</strong>
                  <small>{relativeFolder(doc.path, store.home) || dirname(doc.path)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
