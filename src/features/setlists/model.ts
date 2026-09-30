import type { RecordBase } from '@/core/data/record';

/** `_BandApp/setlists/<id>/setlist.json` (F7 §7). */

export interface SongEntry {
  id: string;
  type: 'song';
  songId: string;
  /** public, setlist-specific, max. 80 characters (F7 §6.3) */
  note: string | null;
  /** red arrow: played without a break into the next song (F7 §6.2) */
  segueToNext: boolean;
}

export interface InterludeEntry {
  id: string;
  type: 'interlude';
  text: string;
  durationMin: number | null;
  /** "Info / Bemerkung" column, e.g. which slide/video runs (v0.12.1) */
  note?: string | null;
}

export type Entry = SongEntry | InterludeEntry;

export interface Block {
  id: string;
  name: string;
  /** pause after this block (not after the last) */
  pauseAfterMin: number | null;
  /** text for the pause box on the printout, e.g. "Pausenmusik!!!" (v0.12.1) */
  pauseNote?: string | null;
  entries: Entry[];
}

export interface Setlist extends RecordBase {
  name: string;
  kind: 'gig' | 'rehearsal';
  blocks: Block[];
  copiedFrom: string | null;
}

/** `personal-notes/<memberId>.json` – only the author sees them (F7 §6.3). */
export interface PersonalNotes {
  schemaVersion: 1;
  notes: Record<string, string>;
  updatedAt: string;
}

export const NOTE_MAX = 80;

/** Numbering runs through all blocks (F7 §6.1, decided). */
export function numbering(setlist: Pick<Setlist, 'blocks'>): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const block of setlist.blocks) for (const e of block.entries) if (e.type === 'song') map.set(e.id, ++n);
  return map;
}

export const songEntries = (setlist: Pick<Setlist, 'blocks'>) => setlist.blocks.flatMap((b) => b.entries.filter((e): e is SongEntry => e.type === 'song'));

/** Arrows only between two songs in the same block; the last song of a block has none (F7 §6.2). */
export function normalizeSegues(setlist: Setlist): Setlist {
  return {
    ...setlist,
    blocks: setlist.blocks.map((block) => ({
      ...block,
      entries: block.entries.map((e, i) => (e.type === 'song' && e.segueToNext && block.entries[i + 1]?.type !== 'song' ? { ...e, segueToNext: false } : e)),
    })),
  };
}

export interface Durations {
  blocks: { seconds: number; unknown: number }[];
  totalSeconds: number;
  unknown: number;
}

/** Block durations = songs + interludes; pauses only count for the total (F7 §6.1). */
export function durations(setlist: Pick<Setlist, 'blocks'>, songSeconds: (songId: string) => number | undefined): Durations {
  let total = 0;
  let unknownTotal = 0;
  const blocks = setlist.blocks.map((block, i) => {
    let seconds = 0;
    let unknown = 0;
    for (const e of block.entries) {
      if (e.type === 'song') {
        const s = songSeconds(e.songId);
        if (s) seconds += s;
        else unknown++;
      } else if (e.durationMin) seconds += e.durationMin * 60;
    }
    total += seconds + (i < setlist.blocks.length - 1 && block.pauseAfterMin ? block.pauseAfterMin * 60 : 0);
    unknownTotal += unknown;
    return { seconds, unknown };
  });
  return { blocks, totalSeconds: total, unknown: unknownTotal };
}
