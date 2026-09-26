import { Home } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { StartPage } from './StartPage';

export const startFeature: FeatureRegistration = {
  id: 'start',
  labelKey: 'nav.start',
  icon: Home,
  path: '/',
  order: 1,
  placement: 'bottomBar',
  element: createElement(StartPage),
};
