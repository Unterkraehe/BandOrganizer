/** Feature registration (setlistsFeature): list, detail, editor, stage view and print routes. */
import { ListMusic } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { PrintPage } from './PrintPage';
import { SetlistDetailPage } from './SetlistDetailPage';
import { SetlistEditorPage } from './SetlistEditorPage';
import { SetlistsPage } from './SetlistsPage';
import { StagePage } from './StagePage';

export const setlistsFeature: FeatureRegistration = {
  id: 'setlists',
  labelKey: 'nav.setlists',
  icon: ListMusic,
  path: '/setlists',
  order: 5,
  placement: 'more',
  element: createElement(SetlistsPage),
  routes: [
    { path: '/setlists/:setlistId', element: createElement(SetlistDetailPage) },
    { path: '/setlists/:setlistId/edit', element: createElement(SetlistEditorPage) },
    { path: '/setlists/:setlistId/stage', element: createElement(StagePage) },
    { path: '/setlists/:setlistId/print', element: createElement(PrintPage) },
  ],
};
