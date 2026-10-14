/**
 * Finding one lesson among a few hundred in the card-link dialog (owner,
 * 14.10.2026: "איך אני אמצא את זה"). Every word typed must appear somewhere in
 * the lesson's line — course, day, time, instructor, branch — in any order.
 */

/** Hebrew geresh/gershayim and their keyboard look-alikes count as the same mark. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[׳'`’‘]/g, "'")
    .replace(/[״"”“]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lessonMatches(haystack: string, query: string): boolean {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const hay = normalizeSearchText(haystack);
  return words.every((word) => hay.includes(word));
}
