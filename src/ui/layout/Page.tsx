import { ArrowLeft } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/Button';
import { useBack } from './navigation';
import { TopBarExtraContext } from './TopBarExtra';
import styles from './Page.module.css';

interface PageProps {
  title: string;
  /** Visually hide the title (e.g. start screen with its own header); it stays for screen readers. */
  hideTitle?: boolean;
  actions?: ReactNode;
  /** wider content column, e.g. two-column editors */
  wide?: boolean;
  /** false: no ← back even on a sub-screen (e.g. a form with its own Abbrechen) */
  back?: boolean;
  /** the title as a large heading below the top bar (may wrap) – for screens whose title is the main information (song page) */
  titleBelow?: boolean;
  children: ReactNode;
}

/** Standard screen frame: sticky top bar with the screen title (F3 §4.4) + content column. */
export function Page({ title, hideTitle, actions, wide, back = true, titleBelow, children }: PageProps) {
  const { t } = useTranslation();
  const extra = useContext(TopBarExtraContext);
  const nav = useBack();
  return (
    <div className={styles.page}>
      <header className={styles.topBar} data-hidden-title={hideTitle || undefined} data-no-print>
        <div className={styles.topBarInner}>
          {back && nav.show && <IconButton className={styles.back} label={t('actions.back')} icon={<ArrowLeft size={22} />} onClick={nav.goBack} />}
          {titleBelow ? <span className={styles.title} aria-hidden="true" /> : <h1 className={hideTitle ? 'visually-hidden' : styles.title}>{title}</h1>}
          {(actions || extra) && (
            <div className={styles.actions}>
              {actions}
              {extra}
            </div>
          )}
        </div>
      </header>
      <div className={wide ? `${styles.content} ${styles.wide}` : styles.content}>
        {titleBelow && <h1 className={styles.titleBelow}>{title}</h1>}
        {children}
      </div>
    </div>
  );
}
