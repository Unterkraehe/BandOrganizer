import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadQueue } from '@/core/uploads/queue';
import { IconButton } from '@/ui';
import styles from './Uploads.module.css';

const QueueContext = createContext<UploadQueue | null>(null);

/** Upload queue for the ready app + indicator + "Uploads laufen noch" warning (F10 §3.2). */
export function UploadsProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new UploadQueue());
  const items = useSyncExternalStore(queue.subscribe, queue.getItems);
  const active = items.some((i) => i.status === 'waiting' || i.status === 'uploading');

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  return (
    <QueueContext.Provider value={queue}>
      {children}
      <UploadIndicator queue={queue} />
    </QueueContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUploadQueue(): UploadQueue {
  const queue = useContext(QueueContext);
  if (!queue) throw new Error('useUploadQueue must be used inside UploadsProvider');
  return queue;
}

function UploadIndicator({ queue }: { queue: UploadQueue }) {
  const { t } = useTranslation('uploads');
  const items = useSyncExternalStore(queue.subscribe, queue.getItems);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const running = items.filter((i) => i.status === 'waiting' || i.status === 'uploading');
  const failed = items.filter((i) => i.status === 'failed');
  const total = running.reduce((sum, i) => sum + i.total, 0);
  const loaded = running.reduce((sum, i) => sum + i.loaded, 0);
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const label = running.length
    ? t('indicator', { count: running.length, percent })
    : failed.length
      ? t('failedCount', { count: failed.length })
      : t('allDone');

  return (
    <div className={styles.indicatorWrap} data-no-print>
      <button
        type="button"
        className={styles.indicator}
        data-failed={failed.length > 0 && !running.length ? '' : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {running.length ? <Loader2 size={16} className={styles.spin} /> : failed.length ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
        {label}
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label={t('title')}>
          <div className={styles.panelHead}>
            <strong>{t('title')}</strong>
            <IconButton
              label={t('close')}
              icon={<X size={18} />}
              onClick={() => {
                setOpen(false);
                if (!running.length) queue.dismissFinished();
              }}
            />
          </div>
          <ul className={styles.items}>
            {items.map((item) => (
              <li key={item.id} className={styles.item}>
                <Upload size={16} aria-hidden="true" />
                <span className={styles.itemName}>{item.name}</span>
                <span className={styles.itemStatus}>
                  {item.status === 'uploading' && `${Math.round((item.loaded / Math.max(1, item.total)) * 100)} %`}
                  {item.status === 'waiting' && t('waiting')}
                  {item.status === 'done' && t('done')}
                  {item.status === 'failed' && (
                    <button type="button" className={styles.retry} onClick={() => item.retry?.()}>
                      <RotateCcw size={14} aria-hidden="true" /> {t('retry')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
