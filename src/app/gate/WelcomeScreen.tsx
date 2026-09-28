import { LogIn, PlayCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession, type SessionStatus } from '@/core/session/BandSession';
import { Button } from '@/ui';
import { GateLayout } from './GateLayout';
import styles from './Gate.module.css';

export function WelcomeScreen({ loginError }: { loginError?: Extract<SessionStatus, { kind: 'signedOut' }>['loginError'] }) {
  const { t } = useTranslation('auth');
  const { connect, startDemo, hiDriveConfigured } = useSession();

  return (
    <GateLayout title={t('common:app.name')} lead={t('welcome.lead')}>
      {loginError && (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          {t(`loginError.${loginError}`)}
        </p>
      )}
      <div className={styles.stack}>
        <p className={styles.note}>{hiDriveConfigured ? t('welcome.connectHint') : t('welcome.notConfigured')}</p>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" icon={<LogIn size={20} />} onClick={connect} disabled={!hiDriveConfigured}>
            {t('welcome.connect')}
          </Button>
          <Button variant="secondary" size="lg" icon={<PlayCircle size={20} />} onClick={() => void startDemo()}>
            {t('welcome.demo')}
          </Button>
        </div>
        <p className={styles.note}>{t('welcome.demoHint')}</p>
      </div>
      <div className={styles.divider} />
      <p className={styles.note} style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <ShieldCheck size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
        {t('welcome.safety')}
      </p>
    </GateLayout>
  );
}
