/** Full-screen loading and error screens shown while the session starts. */
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/core/session/BandSession';
import { Button, EmptyState } from '@/ui';
import { GateLayout } from './GateLayout';
import styles from './Gate.module.css';

export function LoadingScreen() {
  const { t } = useTranslation('auth');
  return (
    <div className={styles.center} role="status">
      <span className={styles.pulse}>{t('loading')}</span>
    </div>
  );
}

export function ConnectionErrorScreen({ message }: { message: 'network' | 'unknown' }) {
  const { t } = useTranslation('auth');
  const { retry, disconnect } = useSession();
  return (
    <GateLayout title={t('common:app.name')}>
      <EmptyState
        icon={<WifiOff size={28} />}
        title={t(`error.${message}`)}
        text=""
        action={
          <div className={styles.actions}>
            <Button variant="primary" onClick={retry}>
              {t('error.retry')}
            </Button>
            <Button variant="ghost" onClick={disconnect}>
              {t('error.disconnect')}
            </Button>
          </div>
        }
      />
    </GateLayout>
  );
}
