import type { TFunction } from 'i18next';
import type { ItemRef } from '@/core/events';
import { formatDate, formatTime } from '@/core/i18n/format';
import type { Member } from '@/features/members/model';
import type { ChatMessage } from './model';

/** Text of a system info line, rendered at display time (R-I18N-02). */
export function systemText(msg: ChatMessage, t: TFunction, members: Member[]): string {
  const p = msg.params ?? {};
  const name = members.find((m) => m.id === p.actor)?.displayName ?? '?';
  const event = p.title || (p.type ? t(`calendar:types.${p.type}`) : '');
  const date = p.date ? (p.allDay === '1' ? formatDate(`${p.date}T12:00:00Z`) : `${formatDate(p.date)}, ${formatTime(p.date)}`) : '';
  return t(`chat:system.${msg.systemKey}`, { name, event, date, song: p.song ?? '', version: p.version ?? '' });
}

export const itemPath = (ref: ItemRef) =>
  ref.type === 'song' ? `/songs/${ref.id}` : ref.type === 'setlist' ? `/setlists/${ref.id}` : `/calendar/${ref.id}${ref.occurrence && ref.occurrence !== 'single' ? `/${ref.occurrence}` : ''}`;
