import { Settings } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { BandSettingsPage } from './BandSettingsPage';
import { SettingsPage } from './SettingsPage';

export const settingsFeature: FeatureRegistration = {
  id: 'settings',
  labelKey: 'nav.settings',
  icon: Settings,
  path: '/settings',
  order: 7,
  placement: 'more',
  element: createElement(SettingsPage),
  routes: [
    { path: '/settings/band', element: createElement(BandSettingsPage) },
    { path: '/profile', element: createElement(ProfilePage) },
  ],
};
