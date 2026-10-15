import type { WahubCustomerRef, WahubFoundBy, WahubSearchContact, WahubSearchCustomer, WahubSearchExtras } from '@/types/wahubSearch';
import { customerCardPath } from './customerCard';

/**
 * A search that is easy (owner, 13.10.2026: "כשאני מחפש מספר טלפון — שיציג
 * באמת את כל מספרי הטלפון שקיימים, או לפי שם; שיהיה קל מאוד לחפש").
 *
 * The matching is the server's (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1): a
 * phone in any spelling and any part of it, a name in any order, the family in
 * Kogo as well. What is here is the screen's side of it: reading what a search
 * brings beside its rows, marking on a row the letters and the digits that
 * matched, and saying — when nothing was found — what was looked through.
 *
 * Nothing here talks to the server, and nothing here decides who matches.
 */

type Raw = Record<string, unknown>;

function record(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function contactId(value: unknown): number | null {
  const id = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** `customer` (ח.2). Null for anything that names no family. */
export function readCustomerRef(raw: unknown): WahubCustomerRef | null {
  const data = record(raw);
  const family = text(data?.family_id);
  if (!data || !family) return null;
  const child = text(data.child_id) || null;
  // The server's own path when it names a card; otherwise the card of the child it names.
  const link = customerCardPath(text(data.link)) ?? (child ? `/customers?child=${encodeURIComponent(child)}` : null);
  return { family_id: family, child_id: child, link };
}

/** `found_by` (ח.1.1). Null: found by what the row already shows — or nothing was said. */
export function readFoundBy(raw: unknown): WahubFoundBy | null {
  const data = record(raw);
  const kind = text(data?.kind);
  if (!data || !kind) return null;
  return { kind, label: text(data.label), value: text(data.value) };
}

function readCustomer(raw: unknown): WahubSearchCustomer | null {
  const data = record(raw);
  const family = text(data?.family_id);
  if (!data || !family) return null;
  const children = (Array.isArray(data.children) ? data.children : [])
    .map((item) => {
      const child = record(item);
      const name = text(child?.name);
      return child && name ? { id: text(child.id), name, status_label: text(child.status_label) } : null;
    })
    .filter((child): child is { id: string; name: string; status_label: string } => child !== null);
  const childId = text(data.child_id);
  return {
    family_id: family,
    name: text(data.name) || text(data.family_name),
    phone_display: text(data.phone_display) || text(data.phone),
    children,
    link: customerCardPath(text(data.link)) ?? (childId ? `/customers?child=${encodeURIComponent(childId)}` : null),
    contact_id: contactId(data.contact_id),
    found_by: readFoundBy(data.found_by),
  };
}

function readContact(raw: unknown): WahubSearchContact | null {
  const data = record(raw);
  const id = contactId(data?.id);
  if (!data || id == null) return null;
  return {
    id,
    name: text(data.name),
    phone_display: text(data.phone_display),
    is_demo: data.is_demo === true,
    box_label: text(data.box_label),
    found_by: readFoundBy(data.found_by),
    customer_link: readCustomerRef(data.customer)?.link ?? null,
  };
}

function list<T>(value: unknown, read: (item: unknown) => T | null): T[] {
  return (Array.isArray(value) ? value : []).map(read).filter((item): item is T => item !== null);
}

/**
 * What a search brings beside its rows (ח.1.2 – ח.1.5): families in Kogo with no conversation, and people found
 * among the conversations who are not in the list that was searched. Null when the answer carries neither key —
 * a server built before ח, or an answer to no search at all.
 */
export function readSearchExtras(raw: unknown): WahubSearchExtras | null {
  const data = record(raw);
  if (!data || (!('customers' in data) && !('contacts' in data))) return null;
  return {
    customers: list(data.customers, readCustomer).slice(0, 5),
    customers_more: data.customers_more === true,
    contacts: list(data.contacts, readContact).slice(0, 5),
  };
}

export const NO_EXTRAS: WahubSearchExtras = { customers: [], customers_more: false, contacts: [] };

// ---------------------------------------------------------------------------
// What was typed
// ---------------------------------------------------------------------------

/** The server reads no more of a search than this (ח.1.1); the boxes take no more. */
export const SEARCH_MAX_LENGTH = 200;

const DIGIT_RUN = /[+(]?\d[\d\s\-+().]*/g;

/** The numbers in what was typed: four digits or more, whatever stands between them ("+972 50-123 4567" is one). */
export function phoneTokens(query: string): string[] {
  return (query.match(DIGIT_RUN) ?? []).map((run) => run.replace(/\D/g, '')).filter((digits) => digits.length >= 4);
}

/** The words in what was typed: everything that is not a number. Fewer than four digits is a word. */
export function wordTokens(query: string): string[] {
  const without = query.replace(DIGIT_RUN, (run) => (run.replace(/\D/g, '').length >= 4 ? ' ' : run));
  // Folded first, then cut: a hyphen is a space, so "בן-דוד" is two words.
  return fold(without).folded.split(/\s+/).filter(Boolean);
}

export type SearchKind = 'phone' | 'words' | 'mixed' | '';

/** What was searched for: a number, words, both — or nothing. */
export function searchKind(query: string): SearchKind {
  const phones = phoneTokens(query).length > 0;
  const words = wordTokens(query).length > 0;
  if (phones && words) return 'mixed';
  if (phones) return 'phone';
  return words ? 'words' : '';
}

// ---------------------------------------------------------------------------
// Marking what matched
// ---------------------------------------------------------------------------

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const DROPPED = /[֑-ׇ'"`׳״’‘”“]/;
const JOINERS = /[-־–—_]/;

/**
 * A word as the search compares it: without vowel points, without a geresh or a quote mark, a hyphen as a space,
 * a final letter as its plain one, in lower case — so "כהן" is "כהנ", "ג'ני" is "גני" and "בן-דוד" is "בן דוד".
 * `at[i]` is where the i-th folded letter stands in the original, so a match can be marked on what is shown.
 */
export function fold(value: string): { folded: string; at: number[] } {
  let folded = '';
  const at: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (DROPPED.test(char)) continue;
    folded += JOINERS.test(char) ? ' ' : (FINALS[char] ?? char.toLowerCase());
    at.push(index);
  }
  return { folded, at };
}

export interface MarkedPart {
  text: string;
  /** This piece is what the search matched. */
  hit: boolean;
}

function partsOf(value: string, ranges: Array<[number, number]>): MarkedPart[] {
  if (!ranges.length) return [{ text: value, hit: false }];
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const parts: MarkedPart[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: value.slice(cursor, start), hit: false });
    parts.push({ text: value.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), hit: false });
  return parts;
}

/**
 * A name (or any words) with the letters that matched marked. A word of one letter marks nothing — it would
 * mark half the list. Text the search did not match comes back whole, unmarked.
 */
export function markWords(value: string, query: string): MarkedPart[] {
  const words = wordTokens(query).filter((word) => word.length >= 2);
  if (!value || !words.length) return [{ text: value, hit: false }];
  const { folded, at } = fold(value);
  const ranges: Array<[number, number]> = [];
  for (const word of words) {
    let from = folded.indexOf(word);
    while (from !== -1) {
      ranges.push([at[from], at[from + word.length - 1] + 1]);
      from = folded.indexOf(word, from + word.length);
    }
  }
  return partsOf(value, ranges);
}

/** The spellings of one number that may stand in a phone as it is shown: as typed, 972… as 0…, and bare. */
function spellings(digits: string): string[] {
  const all = [digits];
  if (digits.startsWith('972')) all.push(`0${digits.slice(3)}`, digits.slice(3));
  else if (digits.startsWith('0')) all.push(digits.slice(1));
  return all.filter((spelling, index) => spelling.length >= 4 && all.indexOf(spelling) === index);
}

/**
 * A phone as it is shown ("050-123-4567") with the digits that matched marked — hyphens between them and all.
 * Null when no number that was typed is in it: the row was then found by something else.
 */
export function markPhone(display: string, query: string): MarkedPart[] | null {
  const tokens = phoneTokens(query);
  if (!display || !tokens.length) return null;
  const places: number[] = [];
  let digits = '';
  for (let index = 0; index < display.length; index += 1) {
    if (/\d/.test(display[index])) {
      digits += display[index];
      places.push(index);
    }
  }
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    for (const spelling of spellings(token)) {
      const from = digits.indexOf(spelling);
      if (from === -1) continue;
      ranges.push([places[from], places[from + spelling.length - 1] + 1]);
      break;
    }
  }
  return ranges.length ? partsOf(display, ranges) : null;
}

/** Whether any piece was marked. */
export function hasHit(parts: ReadonlyArray<MarkedPart> | null | undefined): boolean {
  return Boolean(parts?.some((part) => part.hit));
}

// ---------------------------------------------------------------------------
// The words of the screen
// ---------------------------------------------------------------------------

export const SEARCH_TEXT = {
  chatsEverywhere: 'תוצאות בכל השיחות',
  leadsEverywhere: 'תוצאות בכל הלידים',
  foundBy: 'נמצא לפי',
  customersTitle: 'לקוח במערכת — אין שיחה בוואטסאפ',
  customersMore: 'יש עוד לקוחות מתאימים במערכת. חיפוש מדויק יותר ימצא אותם.',
  contactsTitle: 'נמצא בשיחות — לא ברשימת הלידים',
  toChat: 'לשיחה',
  noCard: 'אין עדיין כרטיס לפתוח',
} as const;

/** "נמצא לפי: ילד/ה — נועם לוי"; a word in the conversation has no value to show. */
export function foundByLine(found: WahubFoundBy | null | undefined): string {
  if (!found) return '';
  const label = found.label || 'התאמה';
  return found.value ? `${SEARCH_TEXT.foundBy}: ${label} — ${found.value}` : `${SEARCH_TEXT.foundBy}: ${label}`;
}

/** "3 תוצאות" · "תוצאה אחת" */
export function resultsWord(count: number): string {
  return count === 1 ? 'תוצאה אחת' : `${count.toLocaleString('he-IL')} תוצאות`;
}

/**
 * What an empty search says: what was looked for — a number, or words — and what was looked through, so "nothing"
 * is never taken for "the search is broken". `known`: the server looked through the families in Kogo as well.
 */
export function notFoundWords(query: string, where: 'chats' | 'leads', known: boolean): { title: string; text: string } {
  const kind = searchKind(query);
  const noun = where === 'chats' ? 'שיחה' : 'ליד';
  const found = where === 'chats' ? 'לא נמצאה' : 'לא נמצא';
  const everywhere = where === 'chats' ? 'בכל השיחות' : 'בכל הלידים';
  const family = known ? ', וגם בפרטי המשפחות במערכת' : '';
  if (kind === 'phone') {
    return { title: `${found} ${noun} עם המספר הזה`, text: `חיפשנו ${everywhere} — בכל צורה שבה כותבים מספר${family}.` };
  }
  if (kind === 'mixed') {
    return { title: `${found} ${noun} עם השם והמספר האלה יחד`, text: `חיפשנו ${everywhere}${family}. אפשר לנסות רק שם, או רק מספר.` };
  }
  return {
    title: `${found} ${noun} ${where === 'chats' ? 'שמתאימה' : 'שמתאים'} לחיפוש`,
    text: `חיפשנו ${everywhere}: בשמות, בטלפונים${known ? ', בפרטי המשפחות במערכת' : ''} ובמה שנכתב.`,
  };
}

export type PlaceTone = 'danger' | 'gold' | 'warning' | 'muted';

/**
 * Where a conversation that a search found stands — the server's one box and its words (ח.1.2) — and the colour
 * the screen keeps for it. Null when the server did not say (it was built before ח).
 */
export function chatPlace(chat: { box?: string; box_label?: string }): { label: string; tone: PlaceTone } | null {
  const label = (chat.box_label ?? '').trim();
  if (!label) return null;
  const tone: PlaceTone =
    chat.box === 'needs_human'
      ? 'danger'
      : chat.box === 'human' || chat.box === 'open' || chat.box === 'birthday'
        ? 'gold'
        : chat.box === 'waiting'
          ? 'warning'
          : 'muted';
  return { label, tone };
}
