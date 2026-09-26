import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { FeatureRegistration } from '@/core/features/registry';
import { Page } from '@/ui';
import styles from './MorePage.module.css';

/** "Mehr" (phone only, F3 §4.2): the navigation items that don't fit in the bottom bar. */
export function MorePage({ features }: { features: FeatureRegistration[] }) {
  const { t } = useTranslation();
  const items = features.filter((feature) => feature.placement === 'more');

  return (
    <Page title={t('nav.more')}>
      <ul className={styles.list}>
        {items.map((feature) => (
          <li key={feature.id}>
            <Link to={feature.path} className={styles.item}>
              <feature.icon size={22} aria-hidden="true" />
              <span className={styles.label}>{t(feature.labelKey)}</span>
              <ChevronRight size={20} className={styles.chevron} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
