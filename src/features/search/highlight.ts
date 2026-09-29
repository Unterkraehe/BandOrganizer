import { normalizeText } from '@/core/search/normalize';

export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits text into segments with the query words (prefix) highlighted (F8 §3.3). */
export function highlight(text: string, query: string): Segment[] {
  const words = normalizeText(query).split(' ').filter((w) => w.length >= 2);
  if (!words.length) return [{ text, hit: false }];
  const out: Segment[] = [];
  for (const part of text.split(/([\p{L}\p{N}]+)/u)) {
    if (!part) continue;
    const norm = normalizeText(part);
    const hit = norm.length > 0 && words.some((w) => norm.startsWith(w) || (w.length >= 4 && norm.startsWith(w.slice(0, -1))));
    const last = out.at(-1);
    if (last && last.hit === hit) last.text += part;
    else out.push({ text: part, hit });
  }
  return out;
}

/** A window of ~max characters around the first hit. */
export function snippet(text: string, query: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const segs = highlight(flat, query);
  let pos = 0;
  for (const s of segs) {
    if (s.hit) break;
    pos += s.text.length;
  }
  if (pos >= flat.length) pos = 0;
  const start = Math.max(0, Math.min(pos - 30, flat.length - max));
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + max).trim()}${start + max < flat.length ? '…' : ''}`;
}
