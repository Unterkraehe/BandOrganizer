import { CalendarSync, Copy, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatDateWithYear } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Button, ConfirmDialog, EmptyState, Page, Section } from '@/ui';
import { useCalendarSubscription } from './CalendarProvider';
import { createSubscription, endSubscription, webcalUrl } from './subscription';
import styles from './Calendar.module.css';

/** "Kalender abonnieren" (F5 §6.5b). */
export function SubscriptionPage() {
  const { t } = useTranslation('calendar');
  const notify = useNotify();
  const { storage, appRoot, currentMember, members } = useSession();
  const { subscription, loaded, setSubscription, currentIcs } = useCalendarSubscription();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'renew' | 'end' | null>(null);
  const me = currentMember?.id ?? 'unknown';

  if (!storage || !appRoot) return null;
  if (!storage.canShare) {
    return (
      <Page title={t('subscription.title')}>
        <EmptyState icon={<CalendarSync size={28} />} title={t('subscription.unsupported')} text="" />
      </Page>
    );
  }

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await action();
      notify({ message: done });
    } catch (error) {
      console.error('Subscription action failed', error);
      notify({ message: t('subscription.failed') });
    } finally {
      setBusy(false);
    }
  };
  const create = (renew: boolean) =>
    run(async () => setSubscription(await createSubscription(storage, appRoot, currentIcs(), me, subscription)), renew ? t('subscription.renewed') : t('subscription.created'));

  return (
    <Page title={t('subscription.title')}>
      <p>{t('subscription.intro')}</p>
      <p className={styles.hint}>{t('subscription.privacy')}</p>

      {loaded && !subscription?.url && (
        <div>
          <Button variant="primary" size="lg" icon={<CalendarSync size={20} />} disabled={busy} onClick={() => void create(false)}>
            {busy ? t('subscription.creating') : t('subscription.create')}
          </Button>
        </div>
      )}

      {subscription?.url && (
        <>
          <Section title={t('subscription.linkLabel')}>
            <div className={styles.section}>
              <input className={styles.select} readOnly value={subscription.url} aria-label={t('subscription.linkLabel')} onFocus={(e) => e.target.select()} style={{ width: '100%' }} />
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  icon={<Copy size={18} />}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(subscription.url!)
                      .then(() => notify({ message: t('subscription.copied') }))
                      .catch(() => notify({ message: t('subscription.failed') }))
                  }
                >
                  {t('subscription.copy')}
                </Button>
                <Button icon={<ExternalLink size={18} />} onClick={() => (window.location.href = webcalUrl(subscription.url!))}>
                  {t('subscription.openInApp')}
                </Button>
              </div>
              <p className={styles.hint}>
                {t('subscription.createdBy', { name: members.find((m) => m.id === subscription.createdBy)?.displayName ?? '?', date: formatDateWithYear(subscription.createdAt) })}
              </p>
              <p className={styles.hint}>{t('subscription.testHint')}</p>
            </div>
          </Section>

          <Section title={t('subscription.howTo')}>
            <div className={styles.section}>
              {(['iphone', 'android', 'outlook'] as const).map((k) => (
                <div key={k}>
                  <strong>{t(`subscription.${k}`)}</strong>
                  <p className={styles.hint}>{t(`subscription.${k}Steps`)}</p>
                </div>
              ))}
            </div>
          </Section>

          <div className={styles.actions}>
            <Button icon={<RefreshCw size={18} />} disabled={busy} onClick={() => setConfirm('renew')}>
              {t('subscription.renew')}
            </Button>
            <Button variant="danger" icon={<XCircle size={18} />} disabled={busy} onClick={() => setConfirm('end')}>
              {t('subscription.end')}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm === 'renew'}
        title={t('subscription.renewTitle')}
        text={t('subscription.renewText')}
        confirmLabel={t('subscription.renew')}
        cancelLabel={t('common:actions.cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void create(true);
        }}
      />
      <ConfirmDialog
        open={confirm === 'end'}
        title={t('subscription.endTitle')}
        text={t('subscription.endText')}
        confirmLabel={t('subscription.end')}
        cancelLabel={t('common:actions.cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          if (subscription) void run(async () => {
            await endSubscription(storage, appRoot, subscription, me);
            setSubscription(null);
          }, t('subscription.ended'));
        }}
      />
    </Page>
  );
}
