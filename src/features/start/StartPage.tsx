import { Download, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLongDate, localHour } from '@/core/i18n/format';
import { useInstallHint } from '@/core/pwa/usePwa';
import { useSession } from '@/core/session/BandSession';
import { EventsWidget } from '@/features/calendar/EventsWidget';
import { BandMark, Button, IconButton, Page } from '@/ui';
import styles from './StartPage.module.css';

const WHATS_NEW_KEY = 'bandapp.whatsNewSeen';

function greetingKey(hour: number) {
  if (hour < 5) return 'greeting.night';
  if (hour < 11) return 'greeting.morning';
  if (hour < 18) return 'greeting.day';
  return 'greeting.evening';
}

/** Start screen (F3 §4.1). Dashboard widgets are added by later features. */
export function StartPage() {
  const { t } = useTranslation('start');
  const { currentMember } = useSession();
  const now = new Date();
  const greeting = t(greetingKey(localHour(now)));

  return (
    <Page title={t('common:nav.start')} hideTitle>
      <header className={styles.hero}>
        <div className={styles.band}>
          <BandMark size="lg" />
        </div>
        <p className={styles.date}>{formatLongDate(now)}</p>
        <p className={styles.greeting}>
          {currentMember ? t('greetingName', { greeting, name: currentMember.displayName }) : greeting}
        </p>
      </header>

      <WhatsNew />
      <InstallHint />

      <EventsWidget />
    </Page>
  );
}

function WhatsNew() {
  const { t } = useTranslation(['start', 'whatsNew']);
  const version = __APP_VERSION__;
  const items = t(version, { ns: 'whatsNew', returnObjects: true, defaultValue: [] }) as string[];
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(WHATS_NEW_KEY) === version;
    } catch {
      return false;
    }
  });

  if (seen || !Array.isArray(items) || items.length === 0) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(WHATS_NEW_KEY, version);
    } catch {
      // ignore
    }
    setSeen(true);
  };

  return (
    <section className={styles.card} aria-labelledby="whats-new-title">
      <div className={styles.cardHead}>
        <h2 id="whats-new-title" className={styles.cardTitle}>
          {t('whatsNew.title', { version })}
        </h2>
        <IconButton label={t('whatsNew.dismiss')} icon={<X size={20} />} onClick={dismiss} />
      </div>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function InstallHint() {
  const { t } = useTranslation('start');
  const { mode, install, dismiss } = useInstallHint();
  if (!mode) return null;

  return (
    <section className={styles.card} aria-labelledby="install-title">
      <div className={styles.cardHead}>
        <h2 id="install-title" className={styles.cardTitle}>
          {t('install.title')}
        </h2>
      </div>
      <p className={styles.cardText}>{mode === 'ios' ? t('install.ios') : t('install.text')}</p>
      <div className={styles.cardActions}>
        {mode === 'prompt' && (
          <Button variant="primary" icon={<Download size={18} />} onClick={() => void install()}>
            {t('install.action')}
          </Button>
        )}
        <Button variant="ghost" onClick={dismiss}>
          {t('install.dismiss')}
        </Button>
      </div>
    </section>
  );
}
