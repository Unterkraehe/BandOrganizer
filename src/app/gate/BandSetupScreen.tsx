import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { config } from '@/config';
import { DEFAULT_BAND_COLOR } from '@/core/color/bandTheme';
import { applyBandTheme } from '@/core/color/bandTheme';
import { useSession } from '@/core/session/BandSession';
import { BandColorPicker, Button, TextField } from '@/ui';
import { GateLayout } from './GateLayout';
import styles from './Gate.module.css';

/** First-time band setup (F1 §3), only offered when no band exists yet. */
export function BandSetupScreen() {
  const { t } = useTranslation('band');
  const { completeSetup } = useSession();
  const [bandName, setBandName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_BAND_COLOR);
  const [uploadFolder, setUploadFolder] = useState<string>(config.defaultUploadFolderName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);

  const onColor = (hex: string) => {
    setColor(hex);
    applyBandTheme(hex); // live preview on the whole screen
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!bandName.trim()) {
      setNameError(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeSetup({ bandName, color, uploadFolderName: uploadFolder });
    } catch (e) {
      console.error(e);
      setError(t('setup.failed'));
      setBusy(false);
    }
  };

  return (
    <GateLayout title={t('setup.title')} lead={t('setup.lead')}>
      <form className={styles.stack} onSubmit={(event) => void onSubmit(event)} noValidate>
        <TextField
          label={t('setup.name')}
          value={bandName}
          onChange={(event) => {
            setBandName(event.target.value);
            setNameError(false);
          }}
          error={nameError ? t('setup.name') : undefined}
          maxLength={60}
          autoFocus
          required
        />
        <BandColorPicker value={color} onChange={onColor} hint={t('setup.colorHint')} />
        <TextField
          label={t('setup.uploadFolder')}
          hint={t('setup.uploadFolderHint')}
          value={uploadFolder}
          onChange={(event) => setUploadFolder(event.target.value)}
          maxLength={80}
        />
        {error && (
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            {busy ? t('setup.working') : t('setup.submit')}
          </Button>
        </div>
      </form>
    </GateLayout>
  );
}
