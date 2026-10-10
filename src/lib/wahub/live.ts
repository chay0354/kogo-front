import type { WahubBoxCounts, WahubContact, WahubContactDetail } from '@/types/wahub';

function time(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

/** The order of the conversations list: the last message first, like any messaging app. */
export function compareChats(a: WahubContact, b: WahubContact): number {
  const byTime = time(b.last_message_at) - time(a.last_message_at);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  return b.id - a.id;
}

export function sortChats(list: ReadonlyArray<WahubContact>): WahubContact[] {
  return [...list].sort(compareChats);
}

/** One row per contact; the later copy of a contact wins. */
export function dedupeContacts(list: ReadonlyArray<WahubContact>): WahubContact[] {
  const byId = new Map<number, WahubContact>();
  for (const contact of list) byId.set(contact.id, contact);
  return Array.from(byId.values());
}

export interface LiveMergeOptions {
  /** Does this contact belong in the list on screen (its box)? */
  accepts: (contact: WahubContact) => boolean;
  /**
   * Contacts that stay even when they no longer belong — the conversation that
   * is open must not vanish from the list under the hand that is answering it.
   */
  keepIds?: ReadonlySet<number>;
  /** False while a text search narrows the list: the screen cannot tell whether a new contact matches it. */
  insertUnknown?: boolean;
}

export interface LiveMergeResult {
  list: WahubContact[];
  /** A row left the list — the pages the server would send now have shifted. */
  removed: number;
  /** Contacts that changed and are not in the list, and could not be placed in it from here. */
  unplaced: number;
}

/**
 * Take the contacts of a live update into the conversations list.
 *
 * Each one replaces its own row (by id), a new one is added, and the list is
 * put back in order of the last message — so whoever just wrote rises to the
 * top. Rows that did not change keep their object identity, so nothing but the
 * rows that moved is drawn again.
 */
export function mergeLiveContacts(
  list: ReadonlyArray<WahubContact>,
  updates: ReadonlyArray<WahubContact>,
  options: LiveMergeOptions,
): LiveMergeResult {
  const insertUnknown = options.insertUnknown !== false;
  const byId = new Map<number, WahubContact>();
  for (const contact of list) byId.set(contact.id, contact);

  let removed = 0;
  let unplaced = 0;
  // The update lists the newest change first; a contact is listed once, but a
  // repeated id must still end as its latest state, so walk it oldest first.
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const contact = updates[index];
    const known = byId.has(contact.id);
    const belongs = options.accepts(contact) || options.keepIds?.has(contact.id) === true;
    if (known) {
      if (belongs) {
        byId.set(contact.id, contact);
      } else {
        byId.delete(contact.id);
        removed += 1;
      }
    } else if (belongs) {
      if (insertUnknown) byId.set(contact.id, contact);
      else unplaced += 1;
    }
  }

  return { list: sortChats(Array.from(byId.values())), removed, unplaced };
}

/**
 * Put a contact that just changed back where it already stands.
 *
 * The leads list is in the server's order and a mark never moves a card: the
 * card is swapped in place, and a contact that is not in the list is not added.
 */
export function replaceContactInPlace(
  list: ReadonlyArray<WahubContact>,
  contact: WahubContact,
): WahubContact[] {
  let found = false;
  const next = list.map((row) => {
    if (row.id !== contact.id) return row;
    found = true;
    return contact;
  });
  return found ? next : (list as WahubContact[]);
}

/** The same for a whole live update: only cards already on screen are refreshed. */
export function patchContactsInPlace(
  list: ReadonlyArray<WahubContact>,
  updates: ReadonlyArray<WahubContact>,
): WahubContact[] {
  if (!updates.length) return list as WahubContact[];
  const fresh = new Map<number, WahubContact>();
  for (let index = updates.length - 1; index >= 0; index -= 1) fresh.set(updates[index].id, updates[index]);
  let changed = false;
  const next = list.map((row) => {
    const update = fresh.get(row.id);
    if (!update) return row;
    changed = true;
    return update;
  });
  return changed ? next : (list as WahubContact[]);
}

/**
 * Add a further page under what is already shown. A contact that is already on
 * screen keeps its place (pages shift while people write), and only the ones
 * not seen yet are added, in the order the server sent them.
 */
export function appendPage(
  list: ReadonlyArray<WahubContact>,
  page: ReadonlyArray<WahubContact>,
): WahubContact[] {
  const seen = new Set(list.map((contact) => contact.id));
  const added: WahubContact[] = [];
  for (const contact of page) {
    if (seen.has(contact.id)) continue;
    seen.add(contact.id);
    added.push(contact);
  }
  return added.length ? [...list, ...added] : (list as WahubContact[]);
}

/**
 * A contact as the lists carry it, laid over the open conversation. The parts
 * only the single-contact request brings — the messages, the log and the
 * children found in Kogo — stay as they were.
 */
export function mergeContactIntoDetail(
  detail: WahubContactDetail,
  contact: WahubContact,
): WahubContactDetail {
  if (detail.id !== contact.id) return detail;
  return {
    ...detail,
    ...contact,
    kogo: { ...contact.kogo, children: contact.kogo.children ?? detail.kogo.children },
    messages: detail.messages,
    has_older: detail.has_older,
    events: detail.events,
  };
}

/** A newer copy of the open contact says a message came or went. */
export function messagesMoved(held: WahubContact, fresh: WahubContact): boolean {
  return held.messages_count !== fresh.messages_count || held.last_message_at !== fresh.last_message_at;
}

/**
 * A newer copy of the open contact differs in something that is written to its
 * log, or in what was found in Kogo — the parts the lists do not carry, so the
 * whole contact has to be read again to show them.
 */
export function logMoved(held: WahubContact, fresh: WahubContact): boolean {
  const tagIds = (contact: WahubContact) => (contact.tags ?? []).map((tag) => tag.id).sort().join(',');
  return (
    held.followup.status !== fresh.followup.status ||
    held.followup.due !== fresh.followup.due ||
    held.followup.note !== fresh.followup.note ||
    held.followup.at !== fresh.followup.at ||
    held.kogo.outcome !== fresh.kogo.outcome ||
    held.kogo.checked_at !== fresh.kogo.checked_at ||
    held.chat.handled_by !== fresh.chat.handled_by ||
    held.chat.needs_human !== fresh.chat.needs_human ||
    held.known.analyzed_at !== fresh.known.analyzed_at ||
    tagIds(held) !== tagIds(fresh)
  );
}

const BOX_KEYS: Array<keyof WahubBoxCounts> = ['all', 'waiting', 'needs_human', 'unread', 'human', 'bot'];

/** True when two sets of counts read the same, so an unchanged poll redraws nothing. */
export function sameBoxCounts(
  a: Partial<WahubBoxCounts> | null | undefined,
  b: Partial<WahubBoxCounts> | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return BOX_KEYS.every((key) => (a[key] ?? null) === (b[key] ?? null));
}

/** The update endpoint sends at most this many; a full batch may have left some out. */
export const LIVE_BATCH_LIMIT = 100;

export function isBatchTruncated(contacts: ReadonlyArray<unknown>): boolean {
  return contacts.length >= LIVE_BATCH_LIMIT;
}

/**
 * The people who have gone longest without an answer, longest first.
 * Works from whatever contacts it is given; who to give it is the caller's concern.
 */
export function longestWaiting(contacts: ReadonlyArray<WahubContact>, limit = 10): WahubContact[] {
  return dedupeContacts(contacts)
    .filter((contact) => Boolean(contact.chat.waiting_since))
    .sort((a, b) => time(a.chat.waiting_since) - time(b.chat.waiting_since) || a.id - b.id)
    .slice(0, limit);
}
