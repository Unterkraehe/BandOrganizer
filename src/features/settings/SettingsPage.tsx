import { Cloud, LogOut, Music, Palette, RefreshCw, UserRoundPen, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatRelativeDay, formatTime } from '@/core/i18n/format';
import { usePwaUpdate } from '@/core/pwa/usePwa';
import { useSession } from '@/core/session/BandSession';
import { useTheme } from '@/core/theme/ThemeProvider';
import type { ThemePreference } from '@/core/theme/theme';
import { basename } from '@/core/storage';
import { useLibrary } from '@/features/songs/LibraryProvider';
import { Avatar, BandMark, Button, ConfirmDialog, Page, Section, SegmentedControl, SettingRow } from '@/ui';
import styles from './Settings.module.css';

/** Settings (F3 §4.3). */
export function SettingsPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const { checkForUpdate } = usePwaUpdate();
  const { currentMember, band, mode, alias, switchProfile, disconnect } = useSession();
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'done' | 'unavailable'>('idle');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const onCheck = async () => {
    setUpdateState('checking');
    const result = await checkForUpdate().catch(() => 'unavailable' as const);
    setUpdateState(result === 'checked' ? 'done' : 'unavailable');
  };

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('appearance.system') },
    { value: 'light', label: t('appearance.light') },
    { value: 'dark', label: t('appearance.dark') },
  ];

  return (
    <Page title={t('title')}>
      {currentMember && (
        <Section title={t('profile:settings.title')}>
          <div className={styles.logoRow}>
            <div className={styles.profileRow}>
              <Avatar name={currentMember.displayName} color={currentMember.color} size="lg" />
              <div>
                <div style={{ fontWeight: 600 }}>{currentMember.displayName}</div>
                {currentMember.role && <div className={styles.note} style={{ margin: 0 }}>{currentMember.role}</div>}
              </div>
            </div>
            <div className={styles.actions}>
              <Button icon={<UserRoundPen size={18} />} onClick={() => navigate('/profile')}>
                {t('profile:settings.edit')}
              </Button>
              <Button icon={<Users size={18} />} onClick={switchProfile}>
                {t('profile:settings.switch')}
              </Button>
              <Button variant="ghost" icon={<LogOut size={18} />} onClick={switchProfile}>
                {t('profile:settings.logout')}
              </Button>
            </div>
          </div>
          <p className={styles.info}>{t('profile:settings.info')}</p>
        </Section>
      )}

      {band && (
        <Section title={t('band:settings.title')}>
          <SettingRow label={band.bandName} hint={`${t('band:setup.uploadFolder')}: ${basename(band.uploads.root)}`}>
            <Button icon={<Palette size={18} />} onClick={() => navigate('/settings/band')}>
              {t('band:settings.edit')}
            </Button>
          </SettingRow>
          <div className={styles.logoRow}>
            <BandMark />
          </div>
        </Section>
      )}

      <SongScanSection />

      <Section title={t('hidrive.title')}>
        <SettingRow
          label={mode === 'demo' ? t('hidrive.demo') : alias ? t('hidrive.connectedAs', { alias }) : t('hidrive.connected')}
          hint={mode === 'demo' ? t('hidrive.demoHint') : undefined}
        >
          <Button variant="ghost" icon={<Cloud size={18} />} onClick={() => (mode === 'demo' ? disconnect() : setConfirmDisconnect(true))}>
            {mode === 'demo' ? t('hidrive.demoEnd') : t('hidrive.disconnect')}
          </Button>
        </SettingRow>
      </Section>

      <Section title={t('appearance.title')}>
        <SettingRow label={t('appearance.theme')} hint={preference === 'system' ? t('appearance.systemHint') : undefined}>
          <SegmentedControl label={t('appearance.theme')} options={themeOptions} value={preference} onChange={setPreference} />
        </SettingRow>
      </Section>

      <Section title={t('about.title')}>
        <SettingRow label={t('common:app.name')} hint={`${t('about.version')} ${__APP_VERSION__}`}>
          <Button icon={<RefreshCw size={18} />} onClick={() => void onCheck()} disabled={updateState === 'checking'}>
            {updateState === 'checking' ? t('about.checking') : t('about.checkUpdates')}
          </Button>
        </SettingRow>
        {(updateState === 'done' || updateState === 'unavailable') && (
          <SettingRow label={updateState === 'done' ? t('about.upToDate') : t('about.offline')} />
        )}
      </Section>

      <ConfirmDialog
        open={confirmDisconnect}
        title={t('hidrive.disconnectConfirmTitle')}
        text={t('hidrive.disconnectConfirm')}
        confirmLabel={t('hidrive.disconnect')}
        cancelLabel={t('common:actions.cancel')}
        danger
        onConfirm={() => {
          setConfirmDisconnect(false);
          disconnect();
        }}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </Page>
  );
}

/** "Songs finden" (F3 §4.3): last scan and manual rescan. Excluded folders follow in M3. */
function SongScanSection() {
  const { t } = useTranslation('songs');
  const { store, state, songs } = useLibrary();
  const when = state.scannedAt ? `${formatRelativeDay(state.scannedAt)}, ${formatTime(state.scannedAt)}` : null;
  return (
    <Section title={t('settings.title')}>
      <SettingRow label={when ? t('settings.summary', { count: songs.length, when }) : t('settings.never')}>
        <Button icon={<Music size={18} />} onClick={() => void store.scan()} disabled={state.status === 'scanning'}>
          {state.status === 'scanning' ? t('scanning', { count: state.progress?.found ?? 0 }) : t('settings.rescan')}
        </Button>
      </SettingRow>
    </Section>
  );
}
