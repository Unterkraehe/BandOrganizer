import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePwaUpdate } from '@/core/pwa/usePwa';
import { useTheme } from '@/core/theme/ThemeProvider';
import type { ThemePreference } from '@/core/theme/theme';
import { Button, Page, Section, SegmentedControl, SettingRow } from '@/ui';

/** Settings (F3 §4.3). Sections for profile, HiDrive and band are added in M1. */
export function SettingsPage() {
  const { t } = useTranslation('settings');
  const { preference, setPreference } = useTheme();
  const { checkForUpdate } = usePwaUpdate();
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'done' | 'unavailable'>('idle');

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
    </Page>
  );
}
