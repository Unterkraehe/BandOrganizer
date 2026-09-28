import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesQuery } from '@/core/search/normalize';
import { Button, Dialog, TextField } from '@/ui';
import { useLibrary } from './LibraryProvider';
import type { Song } from './model';
import { TagNameTakenError } from './repository';
import styles from './Songs.module.css';

/** Assign band-wide tags to a song, create new ones on the fly (F4 §6.11). */
export function TagDialog({ song, onClose }: { song: Song | null; onClose: () => void }) {
  const { t } = useTranslation('songs');
  const { store, tags } = useLibrary();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!song) return null;

  const selected = new Set(song.tagIds);
  const visible = tags.filter((tag) => matchesQuery(tag.name, query));
  const exact = tags.some((tag) => tag.name.trim().toLocaleLowerCase('de') === query.trim().toLocaleLowerCase('de'));

  const toggle = async (tagId: string) => {
    const next = selected.has(tagId) ? song.tagIds.filter((id) => id !== tagId) : [...song.tagIds, tagId];
    setBusy(true);
    await store.setTags(song.id, next).catch(() => setError(t('failed')));
    setBusy(false);
  };

  const create = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const tag = await store.createTag(query);
      await store.setTags(song.id, [...song.tagIds, tag.id]);
      setQuery('');
    } catch (e) {
      setError(e instanceof TagNameTakenError ? t('tagsDialog.taken') : t('failed'));
    }
    setBusy(false);
  };

  return (
    <Dialog open title={t('tagsDialog.title', { title: song.title })} closeLabel={t('common:actions.close')} onClose={onClose}>
      <TextField
        label={t('tagsDialog.new')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !exact) {
            event.preventDefault();
            void create();
          }
        }}
        maxLength={40}
        error={error ?? undefined}
      />
      {query.trim() && !exact && (
        <Button icon={<Plus size={18} />} onClick={() => void create()} disabled={busy}>
          {t('tagsDialog.create', { name: query.trim() })}
        </Button>
      )}
      {tags.length === 0 && !query && <p className={styles.muted}>{t('tagsDialog.none')}</p>}
      <div className={styles.tagChoices}>
        {visible.map((tag) => (
          <label key={tag.id} className={styles.tagChoice}>
            <input type="checkbox" checked={selected.has(tag.id)} onChange={() => void toggle(tag.id)} disabled={busy} />
            {tag.name}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={onClose}>
          {t('tagsDialog.done')}
        </Button>
      </div>
    </Dialog>
  );
}
