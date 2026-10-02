import { Cloud, ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { sanitizeFolderName } from '@/core/band/band';
import { LogoFileError, type LogoVariant } from '@/core/band/logo';
import { DEFAULT_BAND_COLOR } from '@/core/color/bandTheme';
import { useSession } from '@/core/session/BandSession';
import { basename, dirname, joinPath, ConflictError } from '@/core/storage';
import { BandColorPicker, Button, Page, Section, TextField } from '@/ui';
import { LogoFilePicker } from './LogoFilePicker';
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
  const { band, storage, home, appRoot, logoUrls, uploadLogo, pickLogo, removeLogo } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const url = variant === 'dark' ? logoUrls.dark : logoUrls.light;
  const hasLogo = variant === 'dark' ? Boolean(band?.branding.logoDark) : Boolean(band?.branding.logoLight);

  const run = async (action: () => Promise<void>, failed: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      console.warn('Changing the band logo failed', e);
      setError(
        e instanceof LogoFileError
          ? e.reason === 'size'
            ? t('settings.logoTooLarge')
            : t('settings.logoInvalidType')
          : failed,
      );
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (file) await run(() => uploadLogo(variant, file), t('settings.logoFailed'));
  };

  const onPick = (path: string) => {
    setPicking(false);
    void run(() => pickLogo(variant, path), t('settings.logoPickFailed'));
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
          {t('settings.logoUpload')}
        </Button>
        {storage && home && appRoot && (
          <Button icon={<Cloud size={18} />} onClick={() => setPicking(true)} disabled={busy}>
            {t('settings.logoFromHiDrive')}
          </Button>
        )}
        {hasLogo && (
          <Button variant="ghost" icon={<Trash2 size={18} />} onClick={() => void run(() => removeLogo(variant), t('settings.failed'))} disabled={busy}>
            {t('settings.logoRemove')}
          </Button>
        )}
      </div>
      {picking && storage && home && appRoot && (
        <LogoFilePicker storage={storage} home={home} appRoot={appRoot} variant={variant} onSelect={onPick} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
