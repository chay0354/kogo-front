import type { WahubBox, WahubBoxCounts, WahubChatState, WahubContact, WahubOverdueRow } from '@/types/wahub';
import { dayKey, daysBetween, formatClock, formatShortDate, israelToday, waitingLabel } from './format';

/**
 * A conversation that has waited for a person more than three hours of the
 * office's own hours (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.2). The owner,
 * 13.10.2026: "מי שלא ענו לו מעל 3 שעות — לא נחשב אם הם היו בלילה וחיכו
 * לנציג — זה מצמיד אותו ללמעלה של השיחות, והסימן של כמות השעות מהבהב כזה עדין".
 *
 * Who waits, since when, and how many of the office's minutes that is — all of
 * it is the server's: it knows the hours of the office and its special days.
 * This file only reads what it sent, keeps the list in the server's own order
 * while it changes on the screen, and words the small mark. A server built
 * before it sends none of it, and then nothing is pinned and nothing pulses.
 */

/** The quiet line over the conversations that are pinned to the head of the list. */
export const OVERDUE_HEAD = 'מחכים יותר מ-3 שעות';

/** `updates/` sends at most this many; a full list may have left some out, and nobody is un-marked by it. */
export const OVERDUE_LIMIT = 50;

/** The server marks `chat.overdue` on every conversation — and so it knows the whole of ט.2. */
export function knowsOverdue(holder: { chat?: { overdue?: unknown } | null } | null | undefined): boolean {
  return typeof holder?.chat?.overdue === 'boolean';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function moment(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function minutes(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * `overdue` of GET contacts/updates/. Undefined when the server sent no list at all — it does not know ט, and
 * nothing on the screen is touched; an empty list is an answer: nobody is past the line right now.
 */
export function readOverdueRows(raw: unknown): WahubOverdueRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: WahubOverdueRow[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    const data = record(entry);
    const id = Number(data?.id);
    if (!data || !Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      waited_office_minutes: minutes(data.waited_office_minutes),
      waiting_label: str(data.waiting_label),
      waiting_from: moment(data.waiting_from),
    });
  }
  return rows;
}

/** True when two lists read the same, so a poll that changed nothing redraws nothing. */
export function sameOverdueRows(a: ReadonlyArray<WahubOverdueRow> | null | undefined, b: ReadonlyArray<WahubOverdueRow> | null | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return row.id === other.id && row.waiting_label === other.waiting_label && row.waiting_from === other.waiting_from && row.waited_office_minutes === other.waited_office_minutes;
  });
}

// ---------------------------------------------------------------------------
// The order of the list
// ---------------------------------------------------------------------------

function time(iso: string | null | undefined, missing: number): number {
  if (!iso) return missing;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? missing : value;
}

export function isOverdue(contact: Pick<WahubContact, 'chat'> | null | undefined): boolean {
  return contact?.chat?.overdue === true;
}

/**
 * The server's own order (ט.2.4), kept while the screen holds the list and takes changes into it: whoever is
 * past the line first — the longest wait at the head (the smallest `waiting_from`; a tie by the larger id) —
 * and after them the last message first, as always.
 */
export function comparePinned(a: WahubContact, b: WahubContact): number {
  const late = Number(isOverdue(b)) - Number(isOverdue(a));
  if (late !== 0) return late;
  if (isOverdue(a)) {
    const byWait = time(a.chat.waiting_from, Number.POSITIVE_INFINITY) - time(b.chat.waiting_from, Number.POSITIVE_INFINITY);
    if (byWait !== 0 && !Number.isNaN(byWait)) return byWait;
    return b.id - a.id;
  }
  const byTime = time(b.last_message_at, Number.NEGATIVE_INFINITY) - time(a.last_message_at, Number.NEGATIVE_INFINITY);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  return b.id - a.id;
}

/** How many conversations stand pinned at the head of a list that is in the pinned order. */
export function pinnedCount(list: ReadonlyArray<Pick<WahubContact, 'chat'>>): number {
  let count = 0;
  while (count < list.length && isOverdue(list[count])) count += 1;
  return count;
}

/**
 * The number the quiet line says. It is the conversations under it — unless more of them are still a "load
 * more" away, in a box that holds every one of them ("פתוחות", "הכול"): then the server's own count.
 */
export function overdueHeadCount(pinned: number, box: WahubBox, counts: Partial<WahubBoxCounts> | null | undefined, hasMore: boolean): number {
  const all = typeof counts?.overdue === 'number' ? counts.overdue : null;
  if (hasMore && all !== null && all > pinned && (box === 'open' || box === 'all')) return all;
  return pinned;
}

export interface OverdueOptions {
  /** A contact whose save is on its way is left alone; the poll that follows the save puts it right. */
  skip?: (id: number) => boolean;
}

/**
 * Lay what the poll said over the conversations on screen (ט.2.5): everybody it names is past the line now,
 * with the fresh words of its mark; somebody who was, and is no longer named, is not — whatever stopped the
 * clock touched them, and their own row arrives in the same poll.
 *
 * Rows that did not change keep their identity, and a list nothing changed in is handed back as it was — so
 * nothing but the rows that moved is drawn again. Only conversations on screen are touched: one the list has
 * not read is counted by the server (`boxes.overdue`), not fetched.
 */
export function applyOverdue<T extends WahubContact>(list: ReadonlyArray<T>, rows: ReadonlyArray<WahubOverdueRow>, options: OverdueOptions = {}): T[] {
  const named = new Map<number, WahubOverdueRow>();
  for (const row of rows) named.set(row.id, row);
  // A full answer may have left some out: nobody is un-marked on its word.
  const whole = rows.length < OVERDUE_LIMIT;
  let changed = false;
  const next = list.map((contact) => {
    // Only a server that marks `chat.overdue` is read here; a contact without it is from before all of this.
    if (!knowsOverdue(contact) || options.skip?.(contact.id)) return contact;
    const row = named.get(contact.id);
    const chat = contact.chat;
    if (row) {
      const label = row.waiting_label || chat.waiting_label || '';
      const from = row.waiting_from ?? chat.waiting_from ?? null;
      const waited = row.waited_office_minutes ?? chat.waited_office_minutes ?? null;
      if (chat.overdue === true && chat.waiting_label === label && (chat.waiting_from ?? null) === from && (chat.waited_office_minutes ?? null) === waited) {
        return contact;
      }
      changed = true;
      return { ...contact, chat: { ...chat, overdue: true, waiting_label: label, waiting_from: from, waited_office_minutes: waited } };
    }
    if (chat.overdue === true && whole) {
      changed = true;
      return { ...contact, chat: { ...chat, overdue: false } };
    }
    return contact;
  });
  return changed ? next : (list as T[]);
}

// ---------------------------------------------------------------------------
// The mark: how long they wait
// ---------------------------------------------------------------------------

export interface WaitTag {
  /** "מחכה 3:20 שע׳" — the server's words; or the screen's own "מחכה 12 דק׳" where the server gave none. */
  label: string;
  /** Past three hours of the office's own hours: the mark pulses, softly. */
  overdue: boolean;
  /** For whoever hovers: "מאז יום ג׳ 16:00 · נספרות שעות המשרד בלבד". Empty when there is nothing to add. */
  title: string;
}

const WEEKDAY = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'short' });

/** "מאז 16:00" today, "מאז אתמול 16:00", "מאז יום ג׳ 16:00" within the week, "מאז 2.10 16:00" before it. */
export function sinceWords(from: string | null | undefined, now: Date): string {
  if (!from) return '';
  const key = dayKey(from);
  const clock = formatClock(from);
  if (!key || !clock) return '';
  const days = daysBetween(key, israelToday(now));
  if (days <= 0) return `מאז ${clock}`;
  if (days === 1) return `מאז אתמול ${clock}`;
  if (days < 7) return `מאז ${WEEKDAY.format(new Date(from))} ${clock}`;
  return `מאז ${formatShortDate(from, now)} ${clock}`;
}

const OFFICE_HOURS_ONLY = 'נספרות שעות המשרד בלבד';

function tagOf(label: string, overdue: boolean, from: string | null | undefined, now: Date): WaitTag {
  const since = sinceWords(from, now);
  return { label, overdue, title: [since, overdue || since ? OFFICE_HOURS_ONLY : ''].filter(Boolean).join(' · ') };
}

/**
 * The mark of a conversation: how long the customer waits.
 *
 * On a server that knows ט.2 the words are its own (`waiting_label`) — the office's hours only — whenever the
 * conversation waits for a person; one that does not wait for a person carries no such words, and the mark is
 * then the screen's ordinary one (from `waiting_since`, by the clock on the wall), which never pulses. On a
 * server built before it the mark is exactly the one it always was.
 */
export function chatWaitTag(
  chat: Pick<WahubChatState, 'waiting_since' | 'overdue' | 'waiting_label' | 'waiting_from'> | null | undefined,
  now: Date,
): WaitTag | null {
  if (!chat) return null;
  if (typeof chat.overdue === 'boolean') {
    const label = str(chat.waiting_label);
    if (label) return tagOf(label, chat.overdue, chat.waiting_from, now);
    // Marked late with no words to it (they are on their way with the next poll): the mark still stands out.
    if (chat.overdue) return tagOf(waitingLabel(chat.waiting_from ?? chat.waiting_since, now) || 'מחכה יותר מ-3 שעות', true, chat.waiting_from, now);
  }
  const plain = waitingLabel(chat.waiting_since, now);
  return plain ? { label: plain, overdue: false, title: '' } : null;
}

/**
 * The mark at the head of an open conversation: only where the server itself says the conversation waits for
 * a person. A conversation the bot handles, and every conversation of a server built before ט.2, has none
 * there — the head of a conversation never carried the screen's own count, and still does not.
 */
export function personWaitTag(
  chat: Pick<WahubChatState, 'waiting_since' | 'overdue' | 'waiting_label' | 'waiting_from'> | null | undefined,
  now: Date,
): WaitTag | null {
  if (!chat || typeof chat.overdue !== 'boolean') return null;
  if (!chat.overdue && !str(chat.waiting_label)) return null;
  return chatWaitTag(chat, now);
}

/**
 * The same mark for a row of the leads (ט.2.3: the four fields stand on the row itself). Null where the server
 * said nothing — the row is then exactly what it was, with "how long ago" in its corner.
 */
export function leadWaitTag(
  lead: { overdue?: unknown; waiting_label?: unknown; waiting_from?: unknown } | null | undefined,
  now: Date,
): WaitTag | null {
  if (!lead || typeof lead.overdue !== 'boolean') return null;
  const label = str(lead.waiting_label);
  if (!label) return null;
  return tagOf(label, lead.overdue, moment(lead.waiting_from), now);
}
