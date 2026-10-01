import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { sanitizeFolderName } from '@/core/band/band';
import { LogoFileError, type LogoVariant } from '@/core/band/logo';
import { DEFAULT_BAND_COLOR } from '@/core/color/bandTheme';
import { useSession } from '@/core/session/BandSession';
import { basename, dirname, joinPath, ConflictError } from '@/core/storage';
import { BandColorPicker, Button, Page, Section, TextField } from '@/ui';
import styles from './Settings.module.css';
import { useBack } from '@/ui/layout/navigation';

/** Band name, color, upload folder and logo (design system §8, F10 §4). Visible to all members. */
export function BandSettingsPage() {
  const { t } = useTranslation('band');
  const { goBack } = useBack();
  const { band, updateBandSettings } = useSession();
  const [name, setName] = useState(band?.bandName ?? '');
  const [color, setColor] = useState(band?.branding.color ?? DEFAULT_BAND_COLOR);
  const [folder, setFolder] = useState(band ? basename(band.uploads.root) : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!band) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const folderName = sanitizeFolderName(folder);
      const root = folderName ? joinPath(dirname(band.uploads.root), folderName) : band.uploads.root;
      await updateBandSettings({
        bandName: name.trim(),
        branding: { ...band.branding, color },
        uploads: { ...band.uploads, root },
      });
      goBack();
    } catch (error) {
      setMessage(error instanceof ConflictError ? t('settings.conflict') : t('settings.failed'));
      setBusy(false);
    }
  };

  return (
    <Page title={t('settings.edit')}>
      <form className={styles.form} onSubmit={(event) => void save(event)} noValidate>
        <TextField label={t('setup.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        <BandColorPicker value={color} onChange={setColor} />
        <TextField
          label={t('setup.uploadFolder')}
          hint={`${t('setup.uploadFolderHint')} ${t('settings.uploadFolderNote')}`}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          maxLength={80}
        />
        {message && (
          <p className={styles.error} role="alert">
            {message}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy}>
            {t('settings.save')}
          </Button>
          <Button variant="ghost" onClick={() => goBack()} disabled={busy}>
            {t('common:actions.cancel')}
          </Button>
        </div>
      </form>

      <Section title={t('settings.logo')}>
        <LogoRow variant="dark" />
        <LogoRow variant="light" />
      </Section>
      <p className={styles.note}>{t('settings.logoHint')}</p>
    </Page>
  );
}

function LogoRow({ variant }: { variant: LogoVariant }) {
  const { t } = useTranslation('band');
  const { band, logoUrls, uploadLogo, removeLogo } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = variant === 'dark' ? logoUrls.dark : logoUrls.light;
  const hasLogo = variant === 'dark' ? Boolean(band?.branding.logoDark) : Boolean(band?.branding.logoLight);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadLogo(variant, file);
    } catch (e) {
      setError(
        e instanceof LogoFileError
          ? e.reason === 'size'
            ? t('settings.logoTooLarge')
            : t('settings.logoInvalidType')
          : t('settings.logoFailed'),
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={styles.logoRow}>
      <div className={styles.logoText}>
        <span className={styles.logoLabel}>{variant === 'dark' ? t('settings.logoDark') : t('settings.logoLight')}</span>
        <div className={variant === 'dark' ? styles.logoPreviewDark : styles.logoPreviewLight}>
          {url ? <img src={url} alt="" /> : <span>{t('settings.logoNone')}</span>}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <input
          ref={input}
          type="file"
          accept=".svg,.png,image/svg+xml,image/png"
          hidden
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button icon={<ImageUp size={18} />} onClick={() => input.current?.click()} disabled={busy}>
          {hasLogo ? t('settings.logoReplace') : t('settings.logoUpload')}
        </Button>
        {hasLogo && (
          <Button variant="ghost" icon={<Trash2 size={18} />} onClick={() => void removeLogo(variant)} disabled={busy}>
            {t('settings.logoRemove')}
          </Button>
        )}
      </div>
    </div>
  );
}
