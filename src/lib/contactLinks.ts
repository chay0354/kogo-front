/**
 * Turning a stored phone number into a link someone can tap.
 *
 * Numbers are stored exactly as they were typed — 052-123-4567, +972 52 123
 * 4567, and everything in between — so this is the one place that decides what
 * each of those means. It used to live privately inside the register screen,
 * with a second copy in the customers page; a third caller was the moment to
 * make it one.
 */

/** The form wa.me expects: country code, no plus, no separators. */
export function whatsappNumber(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/** Opens the conversation. It never sends anything — the person writes and sends. */
export function whatsappHref(raw: string): string {
  return `https://wa.me/${whatsappNumber(raw)}`;
}

/** Hands the number to the phone's dialler, keeping a leading +. */
export function telHref(raw: string): string {
  return `tel:${(raw || '').replace(/[^\d+]/g, '')}`;
}
