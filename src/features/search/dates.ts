import { normalizeText } from '@/core/search/normalize';
import { addDays, weekday } from '@/features/calendar/time';

/**
 * Date terms in the search (F8 §5): month names/abbreviations, weekdays, dd.mm. / dd.mm.yyyy,
 * "heute", "morgen", "übermorgen", "nächste Woche". Returns local date ranges + the remaining text.
 */

export interface DateQuery {
  ranges: { from: string; to: string }[];
  rest: string;
}

const MONTHS: [string, number][] = [
  ['januar', 1], ['jan', 1], ['februar', 2], ['feb', 2], ['marz', 3], ['mar', 3], ['april', 4], ['apr', 4], ['mai', 5],
  ['juni', 6], ['jun', 6], ['juli', 7], ['jul', 7], ['august', 8], ['aug', 8], ['september', 9], ['sep', 9], ['sept', 9],
  ['oktober', 10], ['okt', 10], ['november', 11], ['nov', 11], ['dezember', 12], ['dez', 12],
];
// full names only: two-letter abbreviations ("so", "do") are too common as normal words
const WEEKDAYS: [string, number][] = [
  ['montag', 0], ['dienstag', 1], ['mittwoch', 2], ['donnerstag', 3], ['freitag', 4], ['samstag', 5], ['sonntag', 6],
];
const monthOf = new Map(MONTHS);
const weekdayOf = new Map(WEEKDAYS);
const pad = (n: number) => String(n).padStart(2, '0');

function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parseDateQuery(query: string, today: string): DateQuery {
  const ranges: DateQuery['ranges'] = [];
  const rest: string[] = [];
  const [ty, tm] = today.split('-').map(Number) as [number, number];
  const tokens = query.trim().split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]!;
    const word = normalizeText(raw);
    const next = tokens[i + 1] ? normalizeText(tokens[i + 1]!) : '';

    // dd.mm. / dd.mm.yyyy
    const d = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?$/);
    if (d) {
      const day = Number(d[1]);
      const month = Number(d[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        let year = d[3] ? Number(d[3].length === 2 ? `20${d[3]}` : d[3]) : ty;
        // without a year: upcoming dates first (F8 §5)
        if (!d[3] && `${year}-${pad(month)}-${pad(day)}` < today) year += 1;
        const date = `${year}-${pad(month)}-${pad(day)}`;
        ranges.push({ from: date, to: date });
        continue;
      }
    }
    if (word === 'heute') {
      ranges.push({ from: today, to: today });
      continue;
    }
    if (word === 'morgen') {
      ranges.push({ from: addDays(today, 1), to: addDays(today, 1) });
      continue;
    }
    if (word === 'ubermorgen') {
      ranges.push({ from: addDays(today, 2), to: addDays(today, 2) });
      continue;
    }
    if ((word === 'nachste' || word === 'nachsten' || word === 'kommende') && next === 'woche') {
      const monday = addDays(today, 7 - weekday(today));
      ranges.push({ from: monday, to: addDays(monday, 6) });
      i++;
      continue;
    }
    if (word === 'diese' && next === 'woche') {
      const monday = addDays(today, -weekday(today));
      ranges.push({ from: today, to: addDays(monday, 6) });
      i++;
      continue;
    }
    const month = monthOf.get(word);
    if (month) {
      // a month without year: this year if it's not over, otherwise next year
      const year = month < tm ? ty + 1 : ty;
      ranges.push({ from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay(year, month))}` });
      continue;
    }
    const wd = weekdayOf.get(word);
    if (wd !== undefined) {
      // weekdays: the next 8 weeks (e.g. "samstag")
      const first = addDays(today, (wd - weekday(today) + 7) % 7);
      for (let w = 0; w < 8; w++) ranges.push({ from: addDays(first, 7 * w), to: addDays(first, 7 * w) });
      continue;
    }
    rest.push(raw);
  }
  return { ranges, rest: rest.join(' ') };
}

export const inRanges = (from: string, to: string, ranges: DateQuery['ranges']) => ranges.some((r) => from <= r.to && to >= r.from);
