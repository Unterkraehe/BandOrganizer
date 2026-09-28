import { Music } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { MergePage } from './MergePage';
import { SongDetailPage } from './SongDetailPage';
import { SongEditPage } from './SongEditPage';
import { TagsSettingsPage } from './TagsSettingsPage';
import { SongsPage } from './SongsPage';

export const songsFeature: FeatureRegistration = {
  id: 'songs',
  labelKey: 'nav.songs',
  icon: Music,
  path: '/songs',
  order: 2,
  placement: 'bottomBar',
  element: createElement(SongsPage),
  routes: [
    { path: '/songs/:songId', element: createElement(SongDetailPage) },
    { path: '/songs/:songId/edit', element: createElement(SongEditPage) },
    { path: '/songs/:songId/merge', element: createElement(MergePage) },
    { path: '/settings/tags', element: createElement(TagsSettingsPage) },
  ],
};
