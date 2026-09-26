import { Settings } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { SettingsPage } from './SettingsPage';

export const settingsFeature: FeatureRegistration = {
  id: 'settings',
  labelKey: 'nav.settings',
  icon: Settings,
  path: '/settings',
  order: 7,
  placement: 'more',
  element: createElement(SettingsPage),
};
