import { Outlet, ScrollRestoration, type RouteObject } from 'react-router-dom';
import type { FeatureRegistration } from '@/core/features/registry';
import { MorePage } from '@/features/more/MorePage';
import { MiniPlayer } from '@/features/songs/MiniPlayer';
import { NotificationNavigator } from '@/features/notifications/NotificationNavigator';
import { SearchButton } from '@/features/search/SearchButton';
import { SearchOverlay } from '@/features/search/SearchOverlay';
import { SearchPage } from '@/features/search/SearchPage';
import { SearchProvider } from '@/features/search/SearchProvider';
import { AppShell } from '@/ui/layout/AppShell';
import { NavigationContext, type NavigationInfo } from '@/ui/layout/navigation';
import { TopBarExtraContext } from '@/ui/layout/TopBarExtra';
import { NotFoundPage } from './NotFoundPage';

/** Routes are generated from the feature registry (F3 §6.1, §6.3). */
export function buildRoutes(features: FeatureRegistration[]): RouteObject[] {
  // Tab roots have no ← back; every other screen does (F3 §4.4, R-UX-09)
  const navigation: NavigationInfo = {
    roots: [...features.map((f) => f.path), '/more'],
    routes: [...features.flatMap((f) => f.routes ?? []).map(({ path, parent }) => ({ path, parent })), { path: '/search' }],
  };
  return [
    {
      element: (
        <NavigationContext.Provider value={navigation}>
          <SearchProvider>
            <TopBarExtraContext.Provider value={<SearchButton />}>
              <AppShell features={features} bottomSlot={<MiniPlayer />}>
                <Outlet />
                {/* New screens start at the top; going back restores the list position (F3 §6.3) */}
                <ScrollRestoration />
              </AppShell>
            </TopBarExtraContext.Provider>
            <SearchOverlay />
            <NotificationNavigator />
          </SearchProvider>
        </NavigationContext.Provider>
      ),
      children: [
        ...features.flatMap((feature) => [
          { path: feature.path, element: feature.element },
          ...(feature.routes ?? []).map((route) => ({ path: route.path, element: route.element })),
        ]),
        { path: '/more', element: <MorePage features={features} /> },
        { path: '/search', element: <SearchPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

