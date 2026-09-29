import { ListMusic, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { matchesQuery } from '@/core/search/normalize';
import { useSession } from '@/core/session/BandSession';
import { occurrenceTitle, occurrenceWhen } from '@/features/calendar/format';
import { todayLocal } from '@/features/calendar/time';
import { Button, Chip, EmptyState, Menu, Page } from '@/ui';
import type { Setlist } from './model';
import { NewSetlistDialog } from './NewSetlistDialog';
import { useSetlistMode } from './SetlistModeProvider';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

/** Setlist-Übersicht (F7 §4.1). */
export function SetlistsPage() {
  const { t } = useTranslation('setlists');
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, setlists, state } = useSetlists();
  const { eventsOf, label } = useSetlistInfo();
  const { members } = useSession();
  const mode = useSetlistMode();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'gig' | 'rehearsal'>('all');
  const [creating, setCreating] = useState(false);
  const today = todayLocal();

  const groups = useMemo(() => {
    const visible = setlists.filter((s) => (kind === 'all' || s.kind === kind) && matchesQuery(s.name, query));
    const upcoming: Setlist[] = [];
    const unlinked: Setlist[] = [];
    const past: Setlist[] = [];
    for (const s of visible) {
      const events = eventsOf(s.id);
      if (events.some((o) => o.endDate >= today)) upcoming.push(s);
      else if (events.length === 0) unlinked.push(s);
      else past.push(s);
    }
    const newest = (a: Setlist, b: Setlist) => b.updatedAt.localeCompare(a.updatedAt);
    return { upcoming: upcoming.sort(newest), unlinked: unlinked.sort(newest), past: past.sort(newest) };
  }, [setlists, kind, query, eventsOf, today]);

  const row = (s: Setlist) => {
    const info = label(s);
    const next = eventsOf(s.id).find((o) => o.endDate >= today) ?? eventsOf(s.id).at(-1);
    return (
      <li key={s.id} className={styles.row}>
        <Link to={`/setlists/${s.id}`} className={styles.rowLink}>
          <span className={styles.rowTitle}>{s.name}</span>
          <span className={styles.meta}>
            {t('songs', { count: info.songs })} · {info.minutes}
            {info.unknown ? ' +?' : ''} · {t(`kind.${s.kind}`)}
          </span>
          {next && (
            <span className={styles.meta}>
              {occurrenceTitle(next, t, members)} · {occurrenceWhen(next, t)}
            </span>
          )}
        </Link>
        <Menu
          label={t('actions.menu', { name: s.name })}
          items={[
            {
              label: t('actions.practice'),
              onSelect: () => {
                mode.start(s.id);
                navigate(`/songs?setlist=${s.id}`);
              },
            },
            { label: t('actions.stage'), onSelect: () => navigate(`/setlists/${s.id}/stage`) },
            { label: t('actions.print'), onSelect: () => navigate(`/setlists/${s.id}/print`) },
            {
              label: t('actions.duplicate'),
              onSelect: () =>
                void store
                  .duplicate(s.id, t('copyOf', { name: s.name }))
                  .then((c) => navigate(`/setlists/${c.id}/edit`))
                  .catch(() => notify({ message: t('editor.failed') })),
            },
            {
              label: t('actions.delete'),
              danger: true,
              onSelect: () =>
                void store
                  .remove(s.id)
                  .then(() => notify({ message: t('actions.deleted'), actionLabel: t('songs:undo'), onAction: () => void store.restore(s.id) }))
                  .catch(() => notify({ message: t('editor.failed') })),
            },
          ]}
        />
      </li>
    );
  };

  return (
    <Page
      title={t('title')}
      actions={
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreating(true)}>
          {t('new')}
        </Button>
      }
    >
      <div className={styles.tools}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Chip pressed={kind === 'gig'} onClick={() => setKind(kind === 'gig' ? 'all' : 'gig')}>
          {t('kind.gig')}
        </Chip>
        <Chip pressed={kind === 'rehearsal'} onClick={() => setKind(kind === 'rehearsal' ? 'all' : 'rehearsal')}>
          {t('kind.rehearsal')}
        </Chip>
      </div>
      {state.status !== 'loading' && setlists.length === 0 && (
        <EmptyState
          icon={<ListMusic size={28} />}
          title={t('empty')}
          text={t('emptyText')}
          action={
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreating(true)}>
              {t('new')}
            </Button>
          }
        />
      )}
      {(['upcoming', 'unlinked', 'past'] as const).map((g) =>
        groups[g].length ? (
          <section key={g} className={styles.group}>
            <h2 className={styles.groupTitle}>{t(`groups.${g}`)}</h2>
            <ul className={styles.list}>{groups[g].map(row)}</ul>
          </section>
        ) : null,
      )}
      {creating && <NewSetlistDialog onClose={() => setCreating(false)} />}
    </Page>
  );
}
