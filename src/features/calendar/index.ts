/** Feature registration (calendarFeature): navigation entry and all calendar routes. */
import { CalendarDays } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { CalendarPage } from './CalendarPage';
import { EventDetailPage } from './EventDetailPage';
import { EventFormPage } from './EventFormPage';
import { SubscriptionPage } from './SubscriptionPage';

export const calendarFeature: FeatureRegistration = {
  id: 'calendar',
  labelKey: 'nav.calendar',
  icon: CalendarDays,
  path: '/calendar',
  order: 3,
  placement: 'bottomBar',
  element: createElement(CalendarPage),
  routes: [
    { path: '/calendar/new', element: createElement(EventFormPage) },
    { path: '/calendar/subscribe', element: createElement(SubscriptionPage) },
    { path: '/calendar/:eventId', element: createElement(EventDetailPage) },
    { path: '/calendar/:eventId/edit', element: createElement(EventFormPage) },
    { path: '/calendar/:eventId/:occurrence', element: createElement(EventDetailPage) },
    { path: '/calendar/:eventId/:occurrence/edit', element: createElement(EventFormPage) },
  ],
};
