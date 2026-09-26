import { Outlet, type RouteObject } from 'react-router-dom';
import type { FeatureRegistration } from '@/core/features/registry';
import { MorePage } from '@/features/more/MorePage';
import { AppShell } from '@/ui/layout/AppShell';
import { NotFoundPage } from './NotFoundPage';

/** Routes are generated from the feature registry (F3 §6.1, §6.3). */
export function buildRoutes(features: FeatureRegistration[]): RouteObject[] {
  return [
    {
      element: (
        <AppShell features={features}>
          <Outlet />
        </AppShell>
      ),
      children: [
        ...features.flatMap((feature) => [
          { path: feature.path, element: feature.element },
          ...(feature.routes ?? []).map((route) => ({ path: route.path, element: route.element })),
        ]),
        { path: '/more', element: <MorePage features={features} /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

