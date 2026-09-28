import { UserRoundPen } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDateWithYear } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Avatar, Button, ConfirmDialog, EmptyState, Page } from '@/ui';
import styles from './Members.module.css';

/** Member detail with deactivate/reactivate (F2 §4.4, §5.4). */
export function MemberDetailPage() {
  const { t } = useTranslation('members');
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { members, currentMember, setMemberActiveState } = useSession();
  const member = members.find((m) => m.id === memberId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!member) {
    return (
      <Page title={t('title')}>
        <EmptyState icon={null} title={t('notFound')} text="" />
      </Page>
    );
  }

  const isSelf = member.id === currentMember?.id;

  const change = async (active: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await setMemberActiveState(member.id, active);
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={member.displayName}>
      <div className={styles.detail}>
        <Avatar name={member.displayName} color={member.color} size="xl" />
        <div className={styles.detailText}>
          <p className={styles.detailName}>
            {member.displayName} {!member.active && <span className={styles.meta}>{t('formerSuffix')}</span>}
          </p>
          {member.role && <p className={styles.meta}>{member.role}</p>}
          <p className={styles.meta}>{t('memberSince', { date: formatDateWithYear(member.createdAt) })}</p>
          {isSelf && <p className={styles.meta}>{t('you')}</p>}
        </div>
      </div>

      {failed && (
        <p className={styles.failed} role="alert">
          {t('failed')}
        </p>
      )}

      <div className={styles.actions}>
        {isSelf && (
          <Button icon={<UserRoundPen size={18} />} onClick={() => navigate('/profile')}>
            {t('editOwn')}
          </Button>
        )}
        {member.active ? (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t('deactivate')}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void change(true)} disabled={busy}>
            {t('reactivate')}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={t('deactivateConfirmTitle', { name: member.displayName })}
        text={t('deactivateConfirm')}
        confirmLabel={t('deactivateAction')}
        cancelLabel={t('common:actions.cancel')}
        danger
        busy={busy}
        onConfirm={() => void change(false)}
        onCancel={() => setConfirming(false)}
      />
    </Page>
  );
}
