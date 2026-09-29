import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Feature registry (R-CODE-02, F3 §6.1). The navigation and routes are built from it,
 * so a feature appears in the app only once it is registered – no half-finished screens.
 */
export interface FeatureRegistration {
  id: string;
  /** i18n key in the "common" namespace, e.g. "nav.songs" */
  labelKey: string;
  icon: LucideIcon;
  /** Route path, e.g. "/songs" */
  path: string;
  /** Fixed position in the menu (F3 §3) */
  order: number;
  /** Phone: bottom bar or "Mehr" */
  placement: 'bottomBar' | 'more';
  element: ReactNode;
  /** Hook returning a count for a badge in the navigation (e.g. unread chat messages) */
  useBadge?: () => number;
  /** Additional routes of this feature (details, sub-screens) */
  routes?: { path: string; element: ReactNode }[];
}

export function sortFeatures(features: FeatureRegistration[]): FeatureRegistration[] {
  return [...features].sort((a, b) => a.order - b.order);
}
