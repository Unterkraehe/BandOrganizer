import { useMemo } from 'react';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SessionProvider, useSession } from '@/core/session/BandSession';
import { ThemeProvider } from '@/core/theme/ThemeProvider';
import { features as registeredFeatures } from '@/features';
import { LibraryProvider } from '@/features/songs/LibraryProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { NotifyProvider } from './notify/NotifyProvider';
import { BandSetupScreen } from './gate/BandSetupScreen';
import { ProfileSelectScreen } from './gate/ProfileSelectScreen';
import { ConnectionErrorScreen, LoadingScreen } from './gate/StatusScreens';
import { WelcomeScreen } from './gate/WelcomeScreen';
import { buildRoutes } from './routes';
import { UpdateToast } from './UpdateToast';

interface AppProps {
  /** For tests: render at a given path without the browser URL. */
  initialPath?: string;
  /** For tests: don't try to finish a login / connect on start. */
  autoStart?: boolean;
}

export function App({ initialPath, autoStart = true }: AppProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NotifyProvider>
          <SessionProvider autoStart={autoStart}>
            <Gate initialPath={initialPath} />
          </SessionProvider>
        </NotifyProvider>
        <UpdateToast />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

/** Welcome → (band setup) → "Wer bist du?" → app shell (F1, F2 §3). */
function Gate({ initialPath }: { initialPath?: string }) {
  const { status } = useSession();
  switch (status.kind) {
    case 'loading':
      return <LoadingScreen />;
    case 'signedOut':
      return <WelcomeScreen loginError={status.loginError} />;
    case 'error':
      return <ConnectionErrorScreen message={status.message} />;
    case 'needsSetup':
      return <BandSetupScreen />;
    case 'selectMember':
      return <ProfileSelectScreen />;
    case 'ready':
      return (
        <LibraryProvider>
          <AppRouter initialPath={initialPath} />
        </LibraryProvider>
      );
  }
}

function AppRouter({ initialPath }: { initialPath?: string }) {
  const router = useMemo(() => {
    const routes = buildRoutes(registeredFeatures);
    if (initialPath) return createMemoryRouter(routes, { initialEntries: [initialPath] });
    // Served from /BandOrganizer/ on GitHub Pages (R-CODE-09)
    return createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });
  }, [initialPath]);
  return <RouterProvider router={router} />;
}
