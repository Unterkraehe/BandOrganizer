import { initials } from '@/features/members/model';
import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/** Initials on the member color (F2 §4.2, design system §3.5). Decorative: the name is always shown next to it. */
export function Avatar({ name, color, size = 'md' }: AvatarProps) {
  return (
    <span
      className={`${styles.avatar} ${styles[size]}`}
      style={{ background: `var(--member-${color})`, color: `var(--member-${color}-on)` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
