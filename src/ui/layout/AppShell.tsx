import { MoreHorizontal } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, matchPath, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { FeatureRegistration } from '@/core/features/registry';
import { useSession } from '@/core/session/BandSession';
import { BandMark } from '../components/BandMark';
import styles from './AppShell.module.css';
import { useTouchGuards } from './useTouchGuards';
import { useSwipe } from '../swipe';
import { useMediaQuery } from '../useMediaQuery';

interface AppShellProps {
  features: FeatureRegistration[];
  /** Persistent bar above the navigation, e.g. the mini player (R-UX-08) */
  bottomSlot?: ReactNode;
  children: ReactNode;
}

/**
 * App frame (F3 §3): bottom bar on phones, navigation rail on tablets, sidebar on desktops.
 * One <nav>, restyled per breakpoint; phone-only "Mehr" collects the items placed in "more".
 */
export function AppShell({ features, bottomSlot, children }: AppShellProps) {
  const { t } = useTranslation();
  useTouchGuards();
  const navigate = useNavigate();
  const location = useLocation();
  const phone = useMediaQuery('(max-width: 767px)');
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const { mode, band, disconnect } = useSession();
  const moreFeatures = features.filter((feature) => feature.placement === 'more');
  const hasMore = moreFeatures.length > 0;
  // On phones, "Mehr" is highlighted while one of its screens is open.
  const moreActive =
    pathname === '/more' || moreFeatures.some((feature) => matchPath({ path: feature.path, end: false }, pathname));

  // Swiping left/right on a main screen moves through the bottom bar (Start, Songs, Kalender, Chat, Mehr)
  const tabs = [...features.filter((feature) => feature.placement !== 'more').map((feature) => feature.path), ...(hasMore ? ['/more'] : [])];
  const tabIndex = tabs.indexOf(pathname);
  useSwipe(
    mainRef,
    (direction) => {
      const next = tabs[tabIndex + (direction === 'left' ? 1 : -1)];
      if (next) navigate(next, { state: { swipe: direction } });
    },
    phone && tabIndex >= 0,
  );
  const swipe = (location.state as { swipe?: 'left' | 'right' } | null)?.swipe;

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label={t('nav.main')} data-no-print>
        <div className={styles.brand}>
          {band ? <BandMark /> : <span className={styles.brandName}>{t('app.name')}</span>}
        </div>
        <ul className={styles.list}>
          {features.map((feature) => (
            <li key={feature.id} className={feature.placement === 'more' ? styles.moreOnly : undefined}>
              <NavLink to={feature.path} end={feature.path === '/'} className={styles.link}>
                <feature.icon className={styles.icon} size={24} strokeWidth={2} aria-hidden="true" />
                <span className={styles.label}>{t(feature.labelKey)}</span>
                {feature.useBadge && <NavBadge use={feature.useBadge} />}
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
      <main ref={mainRef} className={styles.main}>
        {mode === 'demo' && (
          <div className={styles.demoBanner} role="note" data-no-print>
            <span>{t('auth:demoBanner')}</span>
            <button type="button" className={styles.demoEnd} onClick={disconnect}>
              {t('auth:demoEnd')}
            </button>
          </div>
        )}
        <div key={pathname} className={styles.screen} data-swipe={swipe}>
          {children}
        </div>
      </main>
      <div className={styles.bottomSlot} data-no-print>{bottomSlot}</div>
    </div>
  );
}

function NavBadge({ use }: { use: () => number }) {
  const count = use();
  if (!count) return null;
  return (
    <span className={styles.badge} aria-label={String(count)}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
