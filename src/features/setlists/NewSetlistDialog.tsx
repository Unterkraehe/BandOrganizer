import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { newId } from '@/core/data/ids';
import { Button, Dialog, SegmentedControl, TextField } from '@/ui';
import { useSetlists } from './SetlistProvider';
import styles from './Setlists.module.css';

/** "Neue Setlist": empty or from a previous setlist (F7 §4.1, §6.5). Optional: link to an event right away. */
export function NewSetlistDialog({ onClose, defaultName, defaultKind, onCreated }: { onClose: () => void; defaultName?: string; defaultKind?: 'gig' | 'rehearsal'; onCreated?: (id: string) => Promise<void> | void }) {
  const { t } = useTranslation('setlists');
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, setlists } = useSetlists();
  const [mode, setMode] = useState<'empty' | 'copy'>('empty');
  const [name, setName] = useState(defaultName ?? t('newDefaultName'));
  const [kind, setKind] = useState<'gig' | 'rehearsal'>(defaultKind ?? 'gig');
  const [source, setSource] = useState<string>(() => [...setlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (mode === 'empty') {
      // optimistic: open the editor right away, saving runs in the background
      const id = newId('s');
      store.create(name.trim() || t('newDefaultName'), kind, undefined, null, id).catch(() => notify({ message: t('editor.failed') }));
      void Promise.resolve(onCreated?.(id)).catch(() => undefined);
      onClose();
      navigate(`/setlists/${id}/edit`, { state: { created: true } });
      return;
    }
    setBusy(true);
    try {
      const created = await store.duplicate(source, name.trim() || t('copyOf', { name: setlists.find((s) => s.id === source)?.name ?? '' }));
      await onCreated?.(created.id);
      onClose();
      navigate(`/setlists/${created.id}/edit`, { state: { created: true } });
    } catch {
      setBusy(false);
      notify({ message: t('editor.failed') });
    }
  };

  return (
    <Dialog open title={t('new')} closeLabel={t('common:actions.close')} onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <SegmentedControl
          label={t('new')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'empty', label: t('newEmpty') },
            { value: 'copy', label: t('newFromPrevious') },
          ]}
        />
        {mode === 'copy' && (
          <label style={{ display: 'grid', gap: 'var(--space-1)', fontWeight: 600 }}>
            {t('chooseSource')}
            <select className={styles.select} value={source} onChange={(e) => setSource(e.target.value)}>
              {[...setlists]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <TextField label={t('newName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        {mode === 'empty' && (
          <SegmentedControl
            label={t('kind.label')}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'gig', label: t('kind.gig') },
              { value: 'rehearsal', label: t('kind.rehearsal') },
            ]}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy || (mode === 'copy' && !source)}>
            {t('new')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
