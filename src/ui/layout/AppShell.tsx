import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, matchPath, NavLink, useLocation } from 'react-router-dom';
import type { FeatureRegistration } from '@/core/features/registry';
import styles from './AppShell.module.css';

interface AppShellProps {
  features: FeatureRegistration[];
  children: ReactNode;
}

/**
 * App frame (F3 §3): bottom bar on phones, navigation rail on tablets, sidebar on desktops.
 * One <nav>, restyled per breakpoint; phone-only "Mehr" collects the items placed in "more".
 */
export function AppShell({ features, children }: AppShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const moreFeatures = features.filter((feature) => feature.placement === 'more');
  const hasMore = moreFeatures.length > 0;
  // On phones, "Mehr" is highlighted while one of its screens is open.
  const moreActive =
    pathname === '/more' || moreFeatures.some((feature) => matchPath({ path: feature.path, end: false }, pathname));

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label={t('nav.main')}>
        <div className={styles.brand}>
          <span className={styles.brandName}>{t('app.name')}</span>
        </div>
        <ul className={styles.list}>
          {features.map((feature) => (
            <li key={feature.id} className={feature.placement === 'more' ? styles.moreOnly : undefined}>
              <NavLink to={feature.path} end={feature.path === '/'} className={styles.link}>
                <feature.icon className={styles.icon} size={24} strokeWidth={2} aria-hidden="true" />
                <span className={styles.label}>{t(feature.labelKey)}</span>
              </NavLink>
            </li>
          ))}
          {hasMore && (
            <li className={styles.moreLink}>
              <Link to="/more" className={styles.link} aria-current={moreActive ? 'page' : undefined}>
                <MoreHorizontal className={styles.icon} size={24} strokeWidth={2} aria-hidden="true" />
                <span className={styles.label}>{t('nav.more')}</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
