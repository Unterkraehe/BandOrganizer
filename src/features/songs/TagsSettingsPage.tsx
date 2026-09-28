import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { Button, ConfirmDialog, Dialog, EmptyState, IconButton, Page, TextField } from '@/ui';
import { useLibrary } from './LibraryProvider';
import type { Tag } from './model';
import { TagNameTakenError } from './repository';
import styles from './Songs.module.css';

/** Manage band-wide tags (F4 §6.11). */
export function TagsSettingsPage() {
  const { t } = useTranslation('songs');
  const notify = useNotify();
  const { tags, songs, store } = useLibrary();
  const [renaming, setRenaming] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const count = (tag: Tag) => songs.filter((s) => s.tagIds.includes(tag.id)).length;

  return (
    <Page title={t('tagsSettings.title')}>
      {tags.length === 0 ? (
        <EmptyState icon={null} title={t('tagsSettings.title')} text={t('tagsSettings.empty')} />
      ) : (
        <ul className={styles.list}>
          {tags.map((tag) => (
            <li key={tag.id} className={styles.row} style={{ paddingLeft: 'var(--space-4)' }}>
              <span className={styles.rowLink}>
                <span className={styles.rowTitle}>{tag.name}</span>
                <span className={styles.rowMeta}>{t('tagsSettings.count', { count: count(tag) })}</span>
              </span>
              <IconButton
                label={`${t('tagsSettings.rename')}: ${tag.name}`}
                icon={<Pencil size={18} />}
                onClick={() => {
                  setName(tag.name);
                  setError(null);
                  setRenaming(tag);
                }}
              />
              <IconButton label={`${t('tagsSettings.delete')}: ${tag.name}`} icon={<Trash2 size={18} />} onClick={() => setDeleting(tag)} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={renaming !== null} title={t('tagsSettings.rename')} closeLabel={t('common:actions.close')} onClose={() => setRenaming(null)}>
        <form
          style={{ display: 'grid', gap: 'var(--space-4)' }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!renaming) return;
            store
              .renameTag(renaming.id, name)
              .then(() => setRenaming(null))
              .catch((e) => setError(e instanceof TagNameTakenError ? t('tagsDialog.taken') : t('failed')));
          }}
        >
          <TextField label={t('tagsDialog.new')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} error={error ?? undefined} autoFocus />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              {t('common:actions.save')}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={t('tagsSettings.deleteConfirmTitle', { name: deleting?.name ?? '' })}
        text={t('tagsSettings.deleteConfirm', { count: deleting ? count(deleting) : 0 })}
        confirmLabel={t('tagsSettings.delete')}
        cancelLabel={t('common:actions.cancel')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const tag = deleting;
          setDeleting(null);
          if (tag) void store.deleteTag(tag.id).catch(() => notify({ message: t('failed') }));
        }}
      />
    </Page>
  );
}
