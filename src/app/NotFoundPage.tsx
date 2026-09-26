import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Page } from '@/ui';

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Page title={t('notFound.title')}>
      <EmptyState
        icon={<Compass size={28} />}
        title={t('notFound.title')}
        text={t('notFound.text')}
        action={
          <Button variant="primary" onClick={() => navigate('/')}>
            {t('actions.toStart')}
          </Button>
        }
      />
    </Page>
  );
}
