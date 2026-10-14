/**
 * A monthly price the office sets for one child on a standing-order link
 * (owner, 14.10.2026): one pupil, once a week on a course sold twice a week.
 * The server checks it again; this only catches a slip before the request.
 */

/** The server refuses more than this for a month, so an extra zero is caught here first. */
export const MAX_SPECIAL_PRICE = 5000;

/** The price typed, or null when the box is empty or holds no valid monthly price. */
export function specialPriceValue(raw: string): number | null {
  const text = raw.trim().replace(/[₪,\s]/g, '');
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 1 || n > MAX_SPECIAL_PRICE) return null;
  return Math.round(n * 100) / 100;
}
