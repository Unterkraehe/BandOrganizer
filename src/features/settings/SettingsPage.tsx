import { CalendarSync, Cloud, LogOut, Music, Palette, RefreshCw, Tags, UserRoundPen, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readTextSize, writeTextSize, type TextSize } from '@/core/theme/textSize';
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
  const [textSize, setTextSize] = useState<TextSize>(readTextSize);
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

      <Section title={t('calendar:title')}>
        <SettingRow label={t('calendar:subscription.title')} hint={t('calendar:subscription.privacy')}>
          <Button icon={<CalendarSync size={18} />} onClick={() => navigate('/calendar/subscribe')}>
            {t('calendar:subscription.menu')}
          </Button>
        </SettingRow>
      </Section>

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
        <SettingRow label={t('appearance.textSize')} hint={t('appearance.textSizeHint')}>
          <SegmentedControl
            label={t('appearance.textSize')}
            options={[
              { value: 'normal', label: t('appearance.textNormal') },
              { value: 'large', label: t('appearance.textLarge') },
              { value: 'xlarge', label: t('appearance.textXLarge') },
            ]}
            value={textSize}
            onChange={(v) => {
              setTextSize(v);
              writeTextSize(v);
            }}
          />
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
  const navigate = useNavigate();
  const { store, state, songs, tags } = useLibrary();
  const when = state.scannedAt ? `${formatRelativeDay(state.scannedAt)}, ${formatTime(state.scannedAt)}` : null;
  return (
    <Section title={t('settings.title')}>
      <SettingRow label={when ? t('settings.summary', { count: songs.length, when }) : t('settings.never')}>
        <Button icon={<Music size={18} />} onClick={() => void store.scan()} disabled={state.status === 'scanning'}>
          {state.status === 'scanning' ? t('scanning', { count: state.progress?.found ?? 0 }) : t('settings.rescan')}
        </Button>
      </SettingRow>
      {state.report && (
        <div className={styles.info} style={{ paddingTop: 'var(--space-2)' }}>
          <p>{t('settings.folders', { count: state.report.folders })}</p>
          {state.report.failedFolders.length > 0 && (
            <>
              <p style={{ color: 'var(--warning)', fontWeight: 600 }}>{t('settings.failed', { count: state.report.failedFolders.length })}</p>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', overflowWrap: 'anywhere' }}>
                {state.report.failedFolders.slice(0, 20).map((folder) => (
                  <li key={folder}>{folder}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <SettingRow label={t('tagsSettings.title')} hint={t('tagsSettings.summary', { count: tags.length })}>
        <Button icon={<Tags size={18} />} onClick={() => navigate('/settings/tags')}>
          {t('tagsSettings.manage')}
        </Button>
      </SettingRow>
    </Section>
  );
}
