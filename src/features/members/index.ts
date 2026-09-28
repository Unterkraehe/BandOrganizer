import { Users } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { MemberDetailPage } from './MemberDetailPage';
import { MembersPage } from './MembersPage';

export const membersFeature: FeatureRegistration = {
  id: 'members',
  labelKey: 'nav.members',
  icon: Users,
  path: '/members',
  order: 6,
  placement: 'more',
  element: createElement(MembersPage),
  routes: [{ path: '/members/:memberId', element: createElement(MemberDetailPage) }],
};
