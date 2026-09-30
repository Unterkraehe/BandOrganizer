import type { TFunction } from 'i18next';
import type { Member } from '@/features/members/model';
import type { ChatMessage } from '@/features/chat/model';
import { itemPath, systemText } from '@/features/chat/items';
import { shorten, type PushKind, type PushPayload } from './push';

/**
 * What a notification says (decided: sender + message text; chat messages and event changes).
 * Other info lines (Band-Version, design) don't notify.
 */
export function pushPayloadFor(message: ChatMessage, t: TFunction, members: Member[], bandName: string): { kind: PushKind; payload: PushPayload } | null {
  if (message.deletedAt) return null;
  const sender = members.find((m) => m.id === message.createdBy)?.displayName ?? '?';
  if (message.type === 'system') {
    if (!message.systemKey?.startsWith('event.')) return null;
    return {
      kind: 'events',
      payload: {
        title: t(`notifications:${message.systemKey}`),
        body: shorten(systemText(message, t, members)),
        url: message.context ? itemPath(message.context).replace(/^\//, '') : 'calendar',
        tag: `event-${message.context?.id ?? message.id}`,
      },
    };
  }
  const shared = message.share ? `📎 ${t(`chat:context.${message.share.type}`)}` : '';
  const text = [message.text, shared].filter(Boolean).join(' · ');
  return {
    kind: 'chat',
    payload: {
      title: bandName ? `${sender} · ${bandName}` : sender,
      body: shorten(text || shared),
      url: `chat?message=${message.id}`,
      tag: `chat-${message.id}`,
    },
  };
}
