import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { songEntries } from './model';
import { useSetlists } from './SetlistProvider';

/** "In Setlists: …" on the song detail (F4 §4.2 footer). */
export function InSetlists({ songId, mergedIds }: { songId: string; mergedIds: string[] }) {
  const { t } = useTranslation('setlists');
  const { setlists } = useSetlists();
  const ids = new Set([songId, ...mergedIds]);
  const containing = setlists.filter((s) => songEntries(s).some((e) => ids.has(e.songId))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (containing.length === 0) return null;
  return (
    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
      {t('inSetlists')}:{' '}
      {containing.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ', '}
          <Link to={`/setlists/${s.id}`}>{s.name}</Link>
        </span>
      ))}
    </p>
  );
}
