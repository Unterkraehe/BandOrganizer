import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePwaUpdate } from '@/core/pwa/usePwa';
import { Button, Toast } from '@/ui';

/** "Neue Version verfügbar" (F3 §6.4). Never reloads without the user's tap. */
export function UpdateToast() {
  const { t } = useTranslation('pwa');
  const { needRefresh, update, dismiss } = usePwaUpdate();
  const [updating, setUpdating] = useState(false);
  if (!needRefresh) return null;
  return (
    <Toast message={t('updateAvailable')}>
      <Button variant="ghost" onClick={dismiss} disabled={updating}>
        {t('later')}
      </Button>
      <Button
        variant="primary"
        disabled={updating}
        onClick={() => {
          setUpdating(true);
          void update();
        }}
      >
        {updating ? t('updating') : t('update')}
      </Button>
    </Toast>
  );
}
