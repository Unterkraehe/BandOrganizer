import type { ItemRef } from '@/core/events';
import type { RecordBase } from '@/core/data/record';

/** `_BandApp/chat/messages/<YYYY-MM>/<createdAtMs>_<id>.json` (F6 §5). */
export interface ChatMessage extends RecordBase {
  type: 'text' | 'system';
  text: string;
  systemKey?: string;
  params?: Record<string, string>;
  context: ItemRef | null;
  share: ItemRef | null;
  replyTo: { id: string; author: string; snippet: string } | null;
  editedAt: string | null;
}

export const REACTIONS = ['👍', '✅', '❓', '😂'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const MESSAGE_MAX = 2000;

export const monthOf = (iso: string) => iso.slice(0, 7);

export const sameRef = (a: ItemRef | null | undefined, b: ItemRef) => Boolean(a && a.type === b.type && a.id === b.id && (b.occurrence === undefined || a.occurrence === b.occurrence));
