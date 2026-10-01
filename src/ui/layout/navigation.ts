import { createContext, useCallback, useContext } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';

/**
 * What `Page` needs to know about the app's screens for the ← back button (F3 §4.4, R-UX-09):
 * the tab roots (no back button) and every route with its optional explicit parent.
 * Filled from the feature registry in `app/routes.tsx` (ui must not import features).
 */
export interface NavigationInfo {
  roots: string[];
  routes: { path: string; parent?: string }[];
}

export const NavigationContext = createContext<NavigationInfo>({ roots: ['/'], routes: [] });

/** The screen "above" `pathname`: an explicit parent, else the path without its last part that is a known screen. */
export function parentOf(pathname: string, info: NavigationInfo): string {
  const own = info.routes.find((r) => r.parent && matchPath({ path: r.path, end: true }, pathname));
  if (own?.parent) {
    // parent may use the same params, e.g. "/songs/:songId"
    const match = matchPath({ path: own.path, end: true }, pathname)!;
    return own.parent.replace(/:(\w+)/g, (_, name: string) => match.params[name] ?? '');
  }
  const parts = pathname.split('/').filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const candidate = `/${parts.join('/')}`;
    if (info.roots.includes(candidate) || info.routes.some((r) => matchPath({ path: r.path, end: true }, candidate))) return candidate;
  }
  return info.roots.includes(`/${parts[0]}`) ? `/${parts[0]}` : '/';
}

/** Back button state for the current screen: hidden on tab roots; goes back in the app's history or up to the parent. */
export function useBack(): { show: boolean; goBack: () => void } {
  const info = useContext(NavigationContext);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const show = !info.roots.includes(pathname);
  const goBack = useCallback(() => {
    // React Router keeps the position in its own history in history.state.idx (0 = first screen of this visit)
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(parentOf(pathname, info), { replace: true });
  }, [info, navigate, pathname]);
  return { show, goBack };
}
