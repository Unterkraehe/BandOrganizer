import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { IconButton } from '@/ui';
import { songEntries } from './model';
import { SetlistSheet } from './SetlistSheet';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';

const SIZE_KEY = 'bandapp.stage.size';

/** Bühnenansicht (F7 §4.4): always dark, large, screen stays on. */
export function StagePage() {
  const { t } = useTranslation('setlists');
  const { setlistId } = useParams();
  const navigate = useNavigate();
  const { store, setlists, state } = useSetlists();
  const { songById } = useSetlistInfo();
  const setlist = setlists.find((s) => s.id === setlistId);
  const [size, setSize] = useState(() => Number(localStorage.getItem(SIZE_KEY)) || 1.6);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (setlistId) void store.loadPersonal(setlistId);
  }, [setlistId, store]);

  // keep the screen on (Wake Lock API, where supported)
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () => void navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // arrow keys / space move the highlight
  const entries = setlist ? songEntries(setlist) : [];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return navigate(-1);
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir || !entries.length) return;
      e.preventDefault();
      const i = entries.findIndex((x) => x.id === current);
      const next = entries[Math.min(entries.length - 1, Math.max(0, i + dir))];
      if (next) {
        setCurrent(next.id);
        document.getElementById(`stage-${next.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const changeSize = (delta: number) => {
    const next = Math.min(3, Math.max(1, Math.round((size + delta) * 10) / 10));
    setSize(next);
    localStorage.setItem(SIZE_KEY, String(next));
  };

  return (
    <div className={styles.stage} role="dialog" aria-label={setlist?.name ?? t('actions.stage')}>
      <div className={styles.stageBar}>
        <span className={styles.stageTitle}>{setlist?.name}</span>
        <IconButton label={t('stage.smaller')} icon={<Minus size={20} />} onClick={() => changeSize(-0.2)} />
        <IconButton label={t('stage.bigger')} icon={<Plus size={20} />} onClick={() => changeSize(0.2)} />
        <IconButton label={t('stage.close')} icon={<X size={22} />} onClick={() => navigate(-1)} />
      </div>
      <div className={styles.stageBody}>
        {setlist && (
          <div
            onClick={(e) => {
              const el = (e.target as HTMLElement).closest('[data-entry]');
              if (el) setCurrent(el.getAttribute('data-entry'));
            }}
          >
            <SetlistSheet
              setlist={setlist}
              songById={songById}
              personal={state.personal[setlist.id]?.notes ?? {}}
              currentEntryId={current}
              onEntryClick={(id) => setCurrent(id)}
              fontScale={size}
            />
          </div>
        )}
      </div>
    </div>
  );
}
