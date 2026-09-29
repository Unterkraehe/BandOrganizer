import { sortFeatures } from '@/core/features/registry';
import { calendarFeature } from './calendar';
import { membersFeature } from './members';
import { setlistsFeature } from './setlists';
import { settingsFeature } from './settings';
import { songsFeature } from './songs';
import { startFeature } from './start';

/**
 * All registered features. A feature appears in navigation and routing only when it is listed here
 * (roadmap principle: no half-finished screens).
 */
export const features = sortFeatures([startFeature, songsFeature, calendarFeature, setlistsFeature, membersFeature, settingsFeature]);
