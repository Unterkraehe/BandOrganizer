import { Music } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { SongDetailPage } from './SongDetailPage';
import { SongsPage } from './SongsPage';

export const songsFeature: FeatureRegistration = {
  id: 'songs',
  labelKey: 'nav.songs',
  icon: Music,
  path: '/songs',
  order: 2,
  placement: 'bottomBar',
  element: createElement(SongsPage),
  routes: [{ path: '/songs/:songId', element: createElement(SongDetailPage) }],
};
