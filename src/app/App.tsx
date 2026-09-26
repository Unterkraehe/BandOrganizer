import { useMemo } from 'react';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@/core/theme/ThemeProvider';
import { features as registeredFeatures } from '@/features';
import { ErrorBoundary } from './ErrorBoundary';
import { buildRoutes } from './routes';
import { UpdateToast } from './UpdateToast';

interface AppProps {
  /** For tests: render at a given path without the browser URL. */
  initialPath?: string;
}

export function App({ initialPath }: AppProps) {
  const router = useMemo(() => {
    const routes = buildRoutes(registeredFeatures);
    if (initialPath) return createMemoryRouter(routes, { initialEntries: [initialPath] });
    // Served from /BandOrganizer/ on GitHub Pages (R-CODE-09)
    return createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });
  }, [initialPath]);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <RouterProvider router={router} />
        <UpdateToast />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
