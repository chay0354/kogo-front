/**
 * "לכרטיס הלקוח" — the way from the WhatsApp section to the customer's card in
 * the customers section (owner, 13.10.2026: "בלחיצת כפתור אני יכול לעבור
 * לכרטיס הלקוח").
 *
 * The card of that section is a child's card: it holds the family, the phones
 * and the siblings, and its address is /customers?child=<id>. The server's own
 * link is the same one (kogo-back apps/wahub/leads.py, `_in_system`): the first
 * child, the one whose state says most.
 *
 * Nobody identified, or a family with no child to open: there is no address —
 * and then no button is drawn at all, rather than one that leads to the whole
 * list of customers.
 */

/** The words of the button, wherever it stands. */
export const CUSTOMER_CARD_LABEL = 'לכרטיס הלקוח';

/** What a reader of the screen and a pointer resting on it are told. */
export const CUSTOMER_CARD_HINT = 'כרטיס הלקוח במדור לקוחות';

interface Identified {
  family_id?: number | string | null;
  child_ids?: ReadonlyArray<number | string | null> | null;
}

function childPath(id: unknown): string | null {
  const text = typeof id === 'number' && Number.isFinite(id) ? String(id) : typeof id === 'string' ? id.trim() : '';
  return text ? `/customers?child=${encodeURIComponent(text)}` : null;
}

/** The card of a contact Kogo knows (`kogo.family_id` with a child of the family); null when there is none to open. */
export function customerCardHref(kogo: Identified | null | undefined): string | null {
  if (!kogo || kogo.family_id == null || String(kogo.family_id).trim() === '') return null;
  for (const id of kogo.child_ids ?? []) {
    const path = childPath(id);
    if (path) return path;
  }
  return null;
}

/**
 * The same, from a path the server sent ready (a lead's `details.in_system`, a row of the waiting list): kept only
 * when it names a card. "/customers" alone — a family with no child — is the whole list, and is no card.
 */
export function customerCardPath(path: string | null | undefined): string | null {
  const clean = (path ?? '').trim();
  return /^\/customers\?(?:[^#]*&)?child=[^&#]+/.test(clean) ? clean : null;
}

/**
 * Whatever the server says of the customer on a row: a ready path (`customer_link`, `link`), an `in_system` block,
 * or the bare ids. The first that names a card wins; null when none does.
 */
export function customerCardOf(raw: unknown): string | null {
  if (typeof raw === 'string') return customerCardPath(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  for (const key of ['customer_link', 'customer_card', 'link', 'url', 'path', 'href']) {
    const value = data[key];
    const path = typeof value === 'string' ? customerCardPath(value) : null;
    if (path) return path;
  }
  const ids = Array.isArray(data.child_ids) ? (data.child_ids as Array<number | string | null>) : null;
  return customerCardHref({ family_id: data.family_id as number | string | null | undefined, child_ids: ids });
}
