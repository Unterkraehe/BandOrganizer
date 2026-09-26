import { sortFeatures } from '@/core/features/registry';
import { settingsFeature } from './settings';
import { startFeature } from './start';

/**
 * All registered features. A feature appears in navigation and routing only when it is listed here
 * (roadmap principle: no half-finished screens).
 */
export const features = sortFeatures([startFeature, settingsFeature]);
