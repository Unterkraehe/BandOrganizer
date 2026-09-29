import { MessageCircle } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { ChatPage } from './ChatPage';
import { useUnreadCount } from './ChatProvider';

export const chatFeature: FeatureRegistration = {
  id: 'chat',
  labelKey: 'nav.chat',
  icon: MessageCircle,
  path: '/chat',
  order: 4,
  placement: 'bottomBar',
  element: createElement(ChatPage),
  useBadge: useUnreadCount,
};
