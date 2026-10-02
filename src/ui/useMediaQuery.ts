import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Tablet and desktop (design system breakpoints, R-UI-02) */
export const useIsWide = () => useMediaQuery('(min-width: 768px)');

/** Desktop (design system breakpoint, R-UI-02) */
export const useIsDesktop = () => useMediaQuery('(min-width: 1200px)');
