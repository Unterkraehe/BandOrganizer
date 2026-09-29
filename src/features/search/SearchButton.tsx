import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { IconButton } from '@/ui';
import { useSearch } from './SearchProvider';

/** Search icon in every top bar (F8 §3.1). */
export function SearchButton() {
  const { t } = useTranslation('search');
  const { open } = useSearch();
  const { pathname } = useLocation();
  if (pathname === '/search') return null;
  return <IconButton label={t('open')} title={`${t('open')} (${t('shortcut')})`} icon={<Search size={20} />} onClick={() => open()} />;
}
