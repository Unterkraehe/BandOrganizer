import { useSession } from '@/core/session/BandSession';
import { useTheme } from '@/core/theme/ThemeProvider';
import styles from './BandMark.module.css';

/**
 * Band logo for the current theme, or the band name in the display font (design system §8).
 * If only one logo variant exists, it is used only where it is readable.
 */
export function BandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { band, logoUrls } = useSession();
  const { resolved } = useTheme();
  if (!band) return null;
  const url = resolved === 'dark' ? logoUrls.dark : logoUrls.light;
  if (url) return <img className={`${styles.logo} ${styles[size]}`} src={url} alt={band.bandName} />;
  return <span className={`${styles.name} ${styles[size]}`}>{band.bandName}</span>;
}
