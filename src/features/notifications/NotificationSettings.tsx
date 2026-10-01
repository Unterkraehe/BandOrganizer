import { Bell, BellOff, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { useSession } from '@/core/session/BandSession';
import { Button, Section } from '@/ui';
import { ReminderSettings } from './ReminderSettings';
import { disablePush, enablePush, pushSupport, PushNotConfiguredError, savePrefs, sendPush, thisDevice, type PushDevice, type PushKind } from './push';
import styles from './Notifications.module.css';

/** Einstellungen → Benachrichtigungen (F6 §4.5): per device, per member. */
export function NotificationSettings() {
  const { t } = useTranslation('notifications');
  const notify = useNotify();
  const { storage, appRoot, currentMember, mode } = useSession();
  const [device, setDevice] = useState<PushDevice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const support = pushSupport();
  const memberId = currentMember?.id ?? '';

  useEffect(() => {
    if (!storage || !appRoot || !memberId || support !== 'available') return setLoaded(true);
    void thisDevice(storage, appRoot, memberId)
      .then(setDevice)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [storage, appRoot, memberId, support]);

  if (!storage || !appRoot) return null;

  const explain = (error: unknown) =>
    setMessage(
      error instanceof PushNotConfiguredError ? t('notConfigured') : (error as Error)?.message === 'permission-denied' ? t('permissionDenied') : t('failed'),
    );

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setDevice(await enablePush(storage, appRoot, memberId, device?.prefs ?? { chat: true, events: true, reminders: true }));
    } catch (error) {
      explain(error);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush(storage, appRoot, device);
      setDevice(null);
    } catch (error) {
      explain(error);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (kind: PushKind, value: boolean) => {
    if (!device) return;
    const next = { ...device, prefs: { ...device.prefs, [kind]: value } };
    setDevice(next); // optimistic
    savePrefs(storage, appRoot, next).catch(() => {
      setDevice(device);
      notify({ message: t('failed') });
    });
  };

  const test = () =>
    void sendPush(storage, appRoot, memberId, 'chat', { title: t('testTitle'), body: t('testBody'), url: 'settings', tag: 'test' }, device ?? undefined)
      .then((n) => notify({ message: n > 0 ? t('testSent') : t('testFailed') }))
      .catch((error) => (error instanceof PushNotConfiguredError ? setMessage(t('notConfigured')) : notify({ message: t('testFailed') })));

  let content;
  if (mode === 'demo') content = <p className={styles.hint}>{t('demo')}</p>;
  else if (support === 'ios-install') content = <p className={styles.hint}>{t('iosInstall')}</p>;
  else if (support === 'unsupported') content = <p className={styles.hint}>{t('unsupported')}</p>;
  else if (support === 'denied') content = <p className={styles.hint}>{t('denied')}</p>;
  else if (!loaded) content = null;
  else if (!device) {
    content = (
      <div className={styles.row}>
        <span className={styles.hint}>{t('disabledText')}</span>
        <Button variant="primary" icon={<Bell size={18} />} disabled={busy} onClick={() => void turnOn()}>
          {t('enable')}
        </Button>
      </div>
    );
  } else {
    content = (
      <>
        <p className={styles.on}>{t('enabled')}</p>
        {(['chat', 'events', 'reminders'] as const).map((kind) => (
          <label key={kind} className={styles.check}>
            <input type="checkbox" checked={device.prefs[kind] !== false} onChange={(e) => toggle(kind, e.target.checked)} />
            {t(`devicePrefs.${kind}`)}
          </label>
        ))}
        <div className={styles.row}>
          <Button icon={<Send size={18} />} onClick={test}>
            {t('test')}
          </Button>
          <Button variant="ghost" icon={<BellOff size={18} />} disabled={busy} onClick={() => void turnOff()}>
            {t('disable')}
          </Button>
        </div>
        <p className={styles.hint}>{t('own')}</p>
      </>
    );
  }

  return (
    <Section title={t('title')}>
      <div className={styles.box}>
        <p className={styles.hint}>{t('intro')}</p>
        <strong>{t('thisDevice')}</strong>
        {content}
        {message && (
          <p className={styles.error} role="alert">
            {message}
          </p>
        )}
      </div>
      <ReminderSettings />
    </Section>
  );
}
