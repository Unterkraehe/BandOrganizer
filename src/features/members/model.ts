import type { RecordBase } from '@/core/data/record';

/** `_BandApp/members/<memberId>.json` (F2 §6.1) */
export interface Member extends RecordBase {
  displayName: string;
  role: string | null;
  /** palette key c01…c12 (design system §3.5) */
  color: MemberColor;
  avatar: { type: 'initials' };
  /** reserved, always null in v1 (F2 §10) */
  pin: null;
  active: boolean;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
}

export const MEMBER_COLORS = ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12'] as const;
export type MemberColor = (typeof MEMBER_COLORS)[number];

export const MEMBER_SCHEMA_VERSION = 1;
export const NAME_MAX_LENGTH = 30;

export const ROLE_SUGGESTIONS = ['Gesang', 'Gitarre', 'Bass', 'Schlagzeug', 'Keyboard', 'Technik', 'Management'];

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!][0] ?? '';
  const second = words.length > 1 ? ([...words[words.length - 1]!][0] ?? '') : ([...words[0]!][1] ?? '');
  return (first + second).toLocaleUpperCase('de-DE');
}

export function firstFreeColor(members: Member[]): MemberColor {
  const used = new Set(members.filter((m) => m.active).map((m) => m.color));
  return MEMBER_COLORS.find((color) => !used.has(color)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length]!;
}

export function sameName(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'de', { sensitivity: 'accent' }) === 0;
}
