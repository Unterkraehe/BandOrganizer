import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '@/ui';
import type { EditScope } from './store';

/** "Nur diesen Termin / Diesen und alle folgenden / Alle Termine der Serie" (F5 §4.3). */
export function ScopeDialog({ open, onChoose, onClose }: { open: boolean; onChoose: (scope: EditScope) => void; onClose: () => void }) {
  const { t } = useTranslation('calendar');
  return (
    <Dialog open={open} title={t('scope.title')} closeLabel={t('common:actions.close')} onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {(['this', 'following', 'all'] as const).map((scope) => (
          <Button key={scope} variant={scope === 'this' ? 'primary' : 'secondary'} onClick={() => onChoose(scope)}>
            {t(`scope.${scope}`)}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
