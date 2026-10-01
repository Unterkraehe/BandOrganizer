import { ListMusic, Plus, Unlink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { useCalendar } from '@/features/calendar/CalendarProvider';
import type { Occurrence } from '@/features/calendar/model';
import { Button, Dialog } from '@/ui';
import { NewSetlistDialog } from './NewSetlistDialog';
import { useStartSetlist } from './SetlistModeProvider';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

/** Setlist section on the event detail (F5 §4.2, F7 §5). */
export function EventSetlist({ occ, title }: { occ: Occurrence; title: string }) {
  const { t } = useTranslation('setlists');
  const navigate = useNavigate();
  const notify = useNotify();
  const { store: calendar } = useCalendar();
  const { setlists } = useSetlists();
  const { label } = useSetlistInfo();
  const startSetlist = useStartSetlist();
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const setlist = setlists.find((s) => s.id === occ.setlistId);
  const fail = () => notify({ message: t('editor.failed') });
  const link = (id: string | null) => calendar.setSetlist(occ, id).catch(fail);

  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{t('title')}</h2>
      {setlist ? (
        <>
          <p>
            <Link to={`/setlists/${setlist.id}`} style={{ fontWeight: 600 }}>
              {setlist.name}
            </Link>{' '}
            <span className={styles.meta}>
              · {t('songs', { count: label(setlist).songs })} · {label(setlist).minutes}
            </span>
          </p>
          <div className={styles.actions}>
            <Button
              variant="primary"
              icon={<ListMusic size={18} />}
              onClick={() => startSetlist(setlist.id)}
            >
              {t('actions.practice')}
            </Button>
            <Button onClick={() => navigate(`/setlists/${setlist.id}`)}>{t('actions.open')}</Button>
            <Button variant="ghost" onClick={() => setChoosing(true)}>
              {t('link.change')}
            </Button>
            <Button variant="ghost" icon={<Unlink size={18} />} onClick={() => void link(null).then(() => notify({ message: t('link.removed') }))}>
              {t('link.remove')}
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.actions}>
          {occ.setlistId && <p className={styles.hint}>{t('missingSong')}</p>}
          <Button icon={<ListMusic size={18} />} onClick={() => setChoosing(true)}>
            {t('link.choose')}
          </Button>
          <Button variant="ghost" onClick={() => setCreating(true)}>
            {t('link.newForEvent')}
          </Button>
        </div>
      )}
      <Dialog open={choosing} title={t('link.choose')} closeLabel={t('common:actions.close')} onClose={() => setChoosing(false)}>
        <Button
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => {
            setChoosing(false);
            setCreating(true);
          }}
        >
          {t('link.newForEvent')}
        </Button>
        {setlists.length === 0 && <p className={styles.hint}>{t('empty')}</p>}
        <ul className={styles.pickList} hidden={setlists.length === 0}>
          {[...setlists]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.rowLink}
                  style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => {
                    setChoosing(false);
                    void link(s.id);
                  }}
                >
                  <span className={styles.rowTitle}>{s.name}</span>
                  <span className={styles.meta}>
                    {t(`kind.${s.kind}`)} · {t('songs', { count: label(s).songs })}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </Dialog>
      {creating && (
        <NewSetlistDialog
          defaultName={title}
          defaultKind={occ.type === 'rehearsal' ? 'rehearsal' : 'gig'}
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            await link(id);
          }}
        />
      )}
    </section>
  );
}
