import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSession } from '@/core/session/BandSession';
import { Avatar, Page, Section } from '@/ui';
import type { Member } from './model';
import styles from './Members.module.css';

/** Members overview (F2 §4.4). */
export function MembersPage() {
  const { t } = useTranslation('members');
  const { members, currentMember } = useSession();
  const active = members.filter((m) => m.active);
  const former = members.filter((m) => !m.active);

  const row = (member: Member) => (
    <li key={member.id}>
      <Link to={`/members/${member.id}`} className={styles.row}>
        <Avatar name={member.displayName} color={member.color} />
        <span className={styles.text}>
          <span className={styles.name}>{member.displayName}</span>
          <span className={styles.meta}>
            {[member.role, member.id === currentMember?.id ? t('you') : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ChevronRight size={20} className={styles.chevron} aria-hidden="true" />
      </Link>
    </li>
  );

  return (
    <Page title={t('title')}>
      <ul className={styles.list}>{active.map(row)}</ul>
      {former.length > 0 && (
        <Section title={t('former')}>
          <ul className={styles.plainList}>{former.map(row)}</ul>
        </Section>
      )}
    </Page>
  );
}
