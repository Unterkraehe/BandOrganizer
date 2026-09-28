/**
 * Shared text normalization for all searches (F8 §5, R-UX-06): case-insensitive,
 * umlaut-tolerant ("Grüße" = "Gruesse" = "Grusse"), accents and punctuation ignored.
 */
export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // ä → a, é → e, …
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True if every word of the query occurs in the text (any order). */
export function matchesQuery(text: string, query: string): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(text);
  return words.every((word) => haystack.includes(word));
}
