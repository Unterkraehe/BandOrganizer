import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/core/session/BandSession';
import type { Member } from '@/features/members/model';
import { ProfileForm } from '@/features/profile/ProfileForm';
import { Avatar, Button } from '@/ui';
import { GateLayout } from './GateLayout';
import styles from './ProfileSelect.module.css';

/** "Wer bist du?" (F2 §4.1). With no members yet, the profile form opens directly (F2 §3). */
export function ProfileSelectScreen() {
  const { t } = useTranslation('profile');
  const { members, selectMember, createProfile, setMemberActiveState } = useSession();
  const active = members.filter((m) => m.active);
  const former = members.filter((m) => !m.active);
  const [creating, setCreating] = useState(false);
  const [showFormer, setShowFormer] = useState(false);

  if (creating || active.length === 0) {
    const first = active.length === 0;
    return (
      <GateLayout title={t('form.createTitle')} lead={first ? t('form.createFirstLead') : t('form.createLead')}>
        <ProfileForm
          mode="create"
          members={members}
          submitLabel={t('form.submitCreate')}
          onSubmit={async (input) => {
            const member = await createProfile(input);
            selectMember(member.id);
          }}
          onCancel={first ? undefined : () => setCreating(false)}
          onPickExisting={(member) => selectMember(member.id)}
        />
      </GateLayout>
    );
  }

  const card = (member: Member, formerMember = false) => (
    <li key={member.id}>
      {formerMember ? (
        <div className={`${styles.card} ${styles.former}`}>
          <Avatar name={member.displayName} color={member.color} size="lg" />
          <span className={styles.name}>{member.displayName}</span>
          <Button variant="ghost" onClick={() => void setMemberActiveState(member.id, true).catch(() => undefined)}>
            {t('select.reactivate')}
          </Button>
        </div>
      ) : (
        <button type="button" className={styles.card} onClick={() => selectMember(member.id)}>
          <Avatar name={member.displayName} color={member.color} size="lg" />
          <span className={styles.name}>{member.displayName}</span>
          {member.role && <span className={styles.role}>{member.role}</span>}
        </button>
      )}
    </li>
  );

  return (
    <GateLayout title={t('select.title')} lead={t('select.subtitle')} wide>
      <ul className={styles.grid}>
        {active.map((member) => card(member))}
        <li>
          <button type="button" className={`${styles.card} ${styles.newCard}`} onClick={() => setCreating(true)}>
            <span className={styles.plus} aria-hidden="true">
              <Plus size={28} />
            </span>
            <span className={styles.name}>{t('select.new')}</span>
          </button>
        </li>
      </ul>
      {former.length > 0 && (
        <div className={styles.formerBlock}>
          <Button variant="ghost" onClick={() => setShowFormer((v) => !v)} aria-expanded={showFormer}>
            {showFormer ? t('select.hideFormer') : t('select.showFormer', { count: former.length })}
          </Button>
          {showFormer && <ul className={styles.grid}>{former.map((member) => card(member, true))}</ul>}
        </div>
      )}
    </GateLayout>
  );
}
