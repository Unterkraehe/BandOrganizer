import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Page } from '@/ui';
import { SearchPanel } from './SearchPanel';

/** Phone: full-screen search page, deep link /search?q=… (F8 §3.1). */
export function SearchPage() {
  const { t } = useTranslation('search');
  const [params] = useSearchParams();
  return (
    <Page title={t('placeholder').replace(' …', '')} hideTitle>
      <SearchPanel initialQuery={params.get('q') ?? ''} />
    </Page>
  );
}
