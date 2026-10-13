import type {
  WahubLeadChild,
  WahubLeadChips,
  WahubLeadCloseReason,
  WahubLeadCounts,
  WahubLeadDetail,
  WahubLeadDetails,
  WahubLeadFollowUp,
  WahubLeadNext,
  WahubLeadNextWho,
  WahubLeadRow,
  WahubLeadStageCount,
  WahubLeadTimelineEvent,
  WahubLeadTrial,
  WahubLeadsPage,
  WahubLeadsView,
} from '@/types/wahub';
import { dayKey, daysBetween, formatClock, formatDateTime, formatFullDate, formatShortDate, israelToday } from './format';
import { readFuture, readNotes, readWaitingEntries, readWaitingMark } from './futureLeads';
import { botBlockedReason, readOptedOut } from './optOut';
import { readCustomerRef, readFoundBy, readSearchExtras } from './search';
import { readWaitingSummary } from './waitingSummary';

/**
 * The leads tab, version 2 (docs/WAHUB-CONTRACT-LEADS-V2.md, ה): the words of
 * the screen and its small decisions, kept out of the components so they can
 * be read — and tested — on their own.
 *
 * Nothing here decides what a lead is, who handles it or when the bot comes
 * back: all of that is the server's. This file only reads what it sent and
 * says it in plain Hebrew.
 */

// ---------------------------------------------------------------------------
// The three lists and the states
// ---------------------------------------------------------------------------

export const LEADS_VIEWS: WahubLeadsView[] = ['office', 'bot', 'closed'];

export const LEADS_VIEW_LABELS: Record<WahubLeadsView, string> = {
  office: 'מחכים לך',
  bot: 'הבוט מטפל',
  closed: 'נסגרו',
};

/**
 * The waiting list under a name of its own (owner, 13.10.2026: "'מחכים לך' זה כללי מדי… תרשום 'מחכים שיתפנה
 * מקום', ושיישאר ככה"). It is a title above the lists and a screen of its own — not a fourth tab.
 */
export const WAITING_LIST_TITLE = 'מחכים שיתפנה מקום';

/** The four lists a lead may stand in (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.3.1), for a row whose label the server left out. */
export const LEADS_LIST_LABELS: Record<string, string> = { ...LEADS_VIEW_LABELS, waiting: WAITING_LIST_TITLE };

/** The list an address asks for. Anything it does not know opens the one that waits for the office. */
export function parseLeadsView(value: string | null | undefined): WahubLeadsView {
  return LEADS_VIEWS.includes(value as WahubLeadsView) ? (value as WahubLeadsView) : 'office';
}

/**
 * The contract's own words (ב, ח), in its order — for a row whose label the
 * server left out, and for the order of the filter. Not a closed list: a state
 * this file has never heard of is shown under the label it came with.
 */
export const LEAD_V2_STAGE_LABELS: Record<string, string> = {
  signup_stuck: 'נתקע בהרשמה',
  signup_failed: 'ניסה להירשם והחיוב נכשל',
  needs_reply: 'שאל ולא קיבל מענה',
  callback_due: 'הגיע הזמן לחזור אליו',
  signup_started: 'התחיל הרשמה ולא סיים',
  link_sent: 'קיבל קישור ועוד לא נרשם',
  will_check: 'אמר שיבדוק ויחזור',
  trial_booked: 'רשום לשיעור ניסיון',
  trial_no_show: 'נרשם לניסיון ולא הגיע',
  trial_done: 'עשה ניסיון ולא נרשם',
  waiting_date: 'מחכה למועד',
  // docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.3: on the list of one lesson, until a place is freed.
  waiting_list: 'ברשימת המתנה',
  nothing_to_offer: 'אין כרגע מה להציע',
  answered_silent: 'קיבל תשובה ולא נרשם',
  in_conversation: 'בשיחה',
  registered: 'נרשם',
  customer: 'לקוח קיים',
  not_interested: 'לא מעוניין',
  not_relevant: 'לא מעוניין',
  deleted: 'נמחק',
  cold: 'רדום',
};

const STAGE_ORDER = Object.keys(LEAD_V2_STAGE_LABELS);

const CLOSED_STAGES = new Set(['registered', 'customer', 'not_interested', 'not_relevant', 'deleted', 'cold']);
/** Closed because Kogo says so: there is nothing to bring back. */
const SETTLED_STAGES = new Set(['registered', 'customer']);

export function leadStageText(lead: Pick<WahubLeadRow, 'stage' | 'stage_label'>): string {
  return lead.stage_label || LEAD_V2_STAGE_LABELS[lead.stage] || lead.stage;
}

export function isClosedLead(lead: Pick<WahubLeadRow, 'stage'>): boolean {
  return CLOSED_STAGES.has(lead.stage);
}

/**
 * "נתקע בהרשמה" — tried to register and could not — is a hot lead that needs a
 * person the same day: it always stands at the head of "מחכים לך" (ח.2, ח.12).
 * The order is otherwise the server's, and stays so among the rest.
 */
export function stuckFirst<T extends Pick<WahubLeadRow, 'stage'>>(rows: readonly T[]): T[] {
  return [...rows.filter((row) => row.stage === 'signup_stuck'), ...rows.filter((row) => row.stage !== 'signup_stuck')];
}

/** The list a lead belongs to; null for a lead with nobody to make the next move (the server lists it where it sees fit). */
export function leadView(lead: Pick<WahubLeadRow, 'owner' | 'stage'>): WahubLeadsView | null {
  if (isClosedLead(lead)) return 'closed';
  return lead.owner === 'office' || lead.owner === 'bot' ? lead.owner : null;
}

// ---------------------------------------------------------------------------
// Reading what the server sent
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** A name that may come bare or as `{name}` (a course, a branch, an instructor). */
function nameOf(value: unknown): string {
  if (value && typeof value === 'object') {
    const named = value as { name?: unknown; label?: unknown; title?: unknown };
    return str(named.name) || str(named.label) || str(named.title);
  }
  return str(value);
}

/** A moment or a plain date, kept only when it can be read as one. */
function time(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function wholeOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export const NO_NEXT: WahubLeadNext = { who: 'none', what: '', when: null, state: 'none' };

function readNext(raw: unknown): WahubLeadNext {
  const data = record(raw);
  if (!data) return NO_NEXT;
  return {
    who: data.who === 'bot' || data.who === 'office' ? data.who : 'none',
    what: str(data.what),
    when: time(data.when),
    state: data.state === 'planned' || data.state === 'due' ? data.state : 'none',
  };
}

/** `intent: "add_class"` on the row, or `existing: true` among the chips: an existing customer who wants to add. */
function readChips(raw: unknown, intent: unknown): WahubLeadChips {
  const data = record(raw) ?? {};
  const chips: WahubLeadChips = { branch: nameOf(data.branch), course_type: nameOf(data.course_type), child: nameOf(data.child) };
  if (data.existing === true || data.intent === 'add_class' || intent === 'add_class') chips.existing = true;
  return chips;
}

/** One row of the list. Null for something that carries no contact — it is left out rather than drawn empty. */
export function readLeadRow(raw: unknown): WahubLeadRow | null {
  const data = record(raw);
  if (!data) return null;
  const id = Number(data.contact_id ?? data.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const stage = str(data.stage);
  const row: WahubLeadRow = {
    contact_id: id,
    name: str(data.name),
    phone: str(data.phone),
    is_demo: data.is_demo === true,
    stage,
    stage_label: str(data.stage_label) || LEAD_V2_STAGE_LABELS[stage] || stage,
    owner: data.owner === 'office' || data.owner === 'bot' ? data.owner : '',
    summary: str(data.summary),
    chips: readChips(data.chips, data.intent),
    since: time(data.since),
    next: readNext(data.next),
    last_message_at: time(data.last_message_at),
  };
  // The waiting list and a future lead (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.3): on the row only when there
  // is one — a server built before them sends neither, and the row is then exactly what it was.
  const waiting = readWaitingMark(data.waiting_list);
  if (waiting) row.waiting_list = waiting;
  const future = readFuture(data.future);
  if (future) row.future = future;
  // The afternoon of 13.10.2026 (ח): which list the lead stands in, the way to the customer's card, and — in
  // a search — why the row was found. Each only when the server says it.
  const list = str(data.list);
  if (list) {
    row.list = list;
    row.list_label = str(data.list_label) || LEADS_LIST_LABELS[list] || '';
  }
  if ('customer' in data) row.customer = readCustomerRef(data.customer);
  if ('found_by' in data) row.found_by = readFoundBy(data.found_by);
  // The evening of 13.10.2026 (ט): "ביקש הסר", and how long the lead waits for a person in the office's own
  // hours. A server that knows them sends both keys on every row, and so they are read only when they are there.
  if ('opted_out' in data) row.opted_out = readOptedOut(data.opted_out);
  if (typeof data.overdue === 'boolean') {
    row.overdue = data.overdue;
    row.waiting_label = str(data.waiting_label);
    row.waiting_from = time(data.waiting_from);
    row.waited_office_minutes = typeof data.waited_office_minutes === 'number' && data.waited_office_minutes >= 0 ? Math.floor(data.waited_office_minutes) : null;
  }
  return row;
}

function readStages(raw: unknown): WahubLeadStageCount[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const stages: WahubLeadStageCount[] = [];
  for (const item of raw) {
    const data = record(item);
    const key = str(data?.key ?? data?.stage);
    if (!data || !key) continue;
    stages.push({ key, label: str(data.label) || LEAD_V2_STAGE_LABELS[key] || key, count: count(data.count) });
  }
  return stages;
}

/** GET leads/ as the screen reads it: the three numbers always there, and only rows that can be drawn. */
export function readLeadsPage(raw: unknown): WahubLeadsPage {
  const data = record(raw) ?? {};
  const counts = record(data.counts) ?? {};
  const results = (Array.isArray(data.results) ? data.results : [])
    .map(readLeadRow)
    .filter((row): row is WahubLeadRow => row !== null);
  const page: WahubLeadsPage = {
    counts: { office: count(counts.office), bot: count(counts.bot), closed: count(counts.closed) },
    results,
    next_cursor: str(data.next_cursor) || null,
  };
  // "מחכים שיתפנה מקום" in numbers (ח.3.1): sent always by a server that knows ח, and so its sign.
  if ('waiting' in counts) {
    page.counts.waiting = count(counts.waiting);
    page.counts.waiting_act = count(counts.waiting_act);
  }
  const stages = readStages(data.stages);
  if (stages) page.stages = stages;
  // What a search brings beside its rows (ח.1.3).
  const extras = readSearchExtras(data);
  if (extras) {
    page.contacts = extras.contacts;
    page.customers = extras.customers;
    page.customers_more = extras.customers_more;
  }
  return page;
}

/** The server knows ח: it lists the waiting list apart, and can search through every list at once (`owner=all`). */
export function knowsListsApart(counts: Pick<WahubLeadCounts, 'waiting'> | null | undefined): boolean {
  return typeof counts?.waiting === 'number';
}

function readChild(raw: unknown): WahubLeadChild | null {
  const data = record(raw);
  if (!data) return null;
  const child: WahubLeadChild = {
    name: str(data.name),
    age_years: wholeOrNull(data.age_years),
    age_months: wholeOrNull(data.age_months),
    grade: str(data.grade),
    birth_date: time(data.birth_date),
  };
  const known = child.name || child.grade || child.birth_date || child.age_years != null || child.age_months != null;
  return known ? child : null;
}

function readTrial(raw: unknown): WahubLeadTrial | null {
  const data = record(raw);
  if (!data) return null;
  const trial: WahubLeadTrial = {
    course: nameOf(data.course),
    branch: nameOf(data.branch),
    date: time(data.date),
    instructor: nameOf(data.instructor),
    attended: typeof data.attended === 'boolean' ? data.attended : null,
  };
  return trial.course || trial.branch || trial.date || trial.instructor || trial.attended != null ? trial : null;
}

function readFollowUp(raw: unknown): WahubLeadFollowUp | null {
  const data = record(raw);
  if (!data) return null;
  const id = Number(data.id);
  const step = Number(data.step);
  return {
    id: Number.isSafeInteger(id) && id > 0 ? id : null,
    kind: str(data.kind),
    kind_label: str(data.kind_label),
    step: Number.isFinite(step) && step > 0 ? Math.floor(step) : null,
    due_at: time(data.due_at),
    status: str(data.status) || 'planned',
    status_label: str(data.status_label),
    text: str(data.text),
    why: str(data.why),
    acted_at: time(data.acted_at),
    outcome_note: str(data.outcome_note),
  };
}

function readTimelineEvent(raw: unknown): WahubLeadTimelineEvent | null {
  if (typeof raw === 'string') return raw.trim() ? { at: null, text: raw.trim() } : null;
  const data = record(raw);
  if (!data) return null;
  const text = str(data.text) || str(data.label) || str(data.title);
  if (!text) return null;
  return { at: time(data.at ?? data.created_at ?? data.when ?? data.date), text };
}

/** A path inside the CRM, and nothing else: an address that leads out of it is not ours to link to. */
function readInternalPath(raw: unknown): string | null {
  const data = record(raw);
  const path = data ? str(data.url) || str(data.link) || str(data.path) || str(data.href) : str(raw);
  return /^\/(?!\/)/.test(path) ? path : null;
}

export const NO_DETAILS: WahubLeadDetails = {
  reason: '',
  blocker_text: '',
  child: null,
  come_back_on: null,
  come_back_why: '',
  trial: null,
  followups: [],
  timeline: [],
  in_system: null,
};

function readDetails(raw: unknown): WahubLeadDetails {
  const data = record(raw);
  if (!data) return NO_DETAILS;
  const list = <T>(value: unknown, read: (item: unknown) => T | null): T[] =>
    (Array.isArray(value) ? value : []).map(read).filter((item): item is T => item !== null);
  const details: WahubLeadDetails = {
    reason: str(data.reason),
    blocker_text: str(data.blocker_text),
    child: readChild(data.child),
    come_back_on: time(data.come_back_on),
    come_back_why: str(data.come_back_why),
    trial: readTrial(data.trial),
    followups: list(data.followups, readFollowUp),
    timeline: list(data.timeline, readTimelineEvent).slice(0, 10),
    in_system: readInternalPath(data.in_system),
  };
  // The office's notes and the waiting-list entries: only from a server that sends them.
  const notes = readNotes(data.notes);
  if (notes) details.notes = notes.slice(0, 10);
  const entries = readWaitingEntries(data.waiting_list_entries);
  if (entries) details.waiting_list_entries = entries.slice(0, 20);
  // What they asked for, when they are on a waiting list (ח.3.2): said only by a server that knows ח.
  if ('waiting_summary' in data) details.waiting_summary = readWaitingSummary(data.waiting_summary);
  return details;
}

/** GET leads/{contact_id}/: the row, and `details`. Null when the answer names no contact. */
export function readLeadDetail(raw: unknown): WahubLeadDetail | null {
  const data = record(raw);
  if (!data) return null;
  const row = readLeadRow(data) ?? readLeadRow(data.lead);
  if (!row) return null;
  return { ...row, details: readDetails(data.details ?? record(data.lead)?.details) };
}

// ---------------------------------------------------------------------------
// Names and phones
// ---------------------------------------------------------------------------

/** 972501234567 → 050-123-4567. A number that is not an Israeli one is shown as it came. */
export function leadPhoneText(phone: string | null | undefined): string {
  const raw = (phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
  if (/^0\d{9}$/.test(local)) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  if (/^0\d{8}$/.test(local)) return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
  return raw;
}

/** The name on a row: the lead's own, or the phone when there is none. */
export function leadTitle(lead: Pick<WahubLeadRow, 'name' | 'phone'>): string {
  return (lead.name || '').trim() || leadPhoneText(lead.phone) || 'ליד בלי שם';
}

export const EXISTING_CUSTOMER_CHIP = 'לקוח קיים — רוצה להוסיף';

/**
 * The quiet words under a row's sentence: branch, class, child — whichever the
 * bot understood — and, before them, that this is an existing customer who
 * wants to add (it changes how the rest is read).
 */
export function leadChips(chips: WahubLeadChips | null | undefined): Array<{ key: keyof WahubLeadChips; text: string }> {
  if (!chips) return [];
  const words = (['branch', 'course_type', 'child'] as const)
    .map((key) => ({ key: key as keyof WahubLeadChips, text: (chips[key] || '').trim() }))
    .filter((chip) => chip.text);
  return chips.existing ? [{ key: 'existing', text: EXISTING_CUSTOMER_CHIP }, ...words] : words;
}

// ---------------------------------------------------------------------------
// Time, in words
// ---------------------------------------------------------------------------

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PLAIN_WEEKDAY = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', weekday: 'long' });

function weekdayOf(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  // Noon UTC: the weekday of a plain date must not slide with a time zone.
  return PLAIN_WEEKDAY.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function keyOf(value: string): string {
  return DATE_ONLY.test(value) ? value : dayKey(value);
}

/** 12.3 for a day in the months ahead — the month says which year; 12.3.28 for one further off, or behind us. */
function dateWords(key: string, days: number, now: Date): string {
  if (days >= 0 && days <= 330) {
    const [, month, day] = key.split('-').map(Number);
    return `${day}.${month}`;
  }
  return formatShortDate(key, now);
}

export interface WhenWords {
  /** "מחר ב-10:30", "ביום חמישי", "ב-12.3". */
  text: string;
  /** Whole days from today, in Israel. Negative: behind us. */
  days: number;
  /** The moment has already come. A plain date counts from the day after it. */
  past: boolean;
}

/**
 * When something is due, as a person would say it: the day in a word while it
 * is close, the date once it is a week off or more — and the hour only where
 * the server sent one.
 */
export function whenWords(value: string | null | undefined, now: Date): WhenWords | null {
  if (!value) return null;
  const plain = DATE_ONLY.test(value);
  const key = keyOf(value);
  if (!key) return null;
  const days = daysBetween(israelToday(now), key);
  const clock = plain ? '' : formatClock(value);
  const at = clock ? ` ב-${clock}` : '';
  const past = plain ? days < 0 : new Date(value).getTime() <= now.getTime();
  let text: string;
  if (days === 0) text = `היום${at}`;
  else if (days === 1) text = `מחר${at}`;
  else if (days === 2) text = `מחרתיים${at}`;
  else if (days === -1) text = `אתמול${at}`;
  else if (days > 2 && days < 7) text = `ב${weekdayOf(key)}${at}`;
  else text = `ב-${dateWords(key, days, now)}`;
  return { text, days, past };
}

function plural(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}

/**
 * "לפני 3 דק׳", "לפני שעתיים", "אתמול", "לפני שבוע", "לפני 4 חודשים" — how
 * long ago, in the roundest words that are still true. Days are counted on
 * Israel's calendar, so "אתמול" is yesterday and not "24 hours ago".
 */
export function sinceText(value: string | null | undefined, now: Date): string {
  if (!value) return '';
  const key = keyOf(value);
  if (!key) return '';
  const days = daysBetween(key, israelToday(now));
  if (DATE_ONLY.test(value)) {
    if (days <= 0) return 'היום';
  } else {
    const minutes = Math.floor((now.getTime() - new Date(value).getTime()) / 60_000);
    if (minutes < 1) return 'עכשיו';
    if (minutes < 60) return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דק׳`;
    // Late last night, seen just after midnight, is still "a few hours ago".
    if (days <= 0 || minutes < 6 * 60) return `לפני ${plural(Math.floor(minutes / 60), 'שעה', 'שעתיים', 'שעות')}`;
  }
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${plural(days, 'יום', 'יומיים', 'ימים')}`;
  if (days < 30) return `לפני ${plural(Math.floor(days / 7), 'שבוע', 'שבועיים', 'שבועות')}`;
  if (days < 365) return `לפני ${plural(Math.floor(days / 30), 'חודש', 'חודשיים', 'חודשים')}`;
  return `לפני ${plural(Math.floor(days / 365), 'שנה', 'שנתיים', 'שנים')}`;
}

/** "יום חמישי, 12.3.2027", with the hour when the server sent one. */
export function fullWhen(value: string | null | undefined): string {
  if (!value) return '';
  const key = keyOf(value);
  if (!key) return '';
  const clock = DATE_ONLY.test(value) ? '' : formatClock(value);
  return `${weekdayOf(key)}, ${formatFullDate(key)}${clock ? ` ב-${clock}` : ''}`;
}

// ---------------------------------------------------------------------------
// "הצעד הבא" — who, what, and when, in one line
// ---------------------------------------------------------------------------

/** The colour and the mark of the line: the office's own, the bot's, a send that is held back, or nothing to do. */
export type NextTone = 'office' | 'bot' | 'held' | 'quiet';

export interface NextStepLine {
  who: WahubLeadNextWho;
  tone: NextTone;
  /** The bot comes back on a day, rather than at an hour: the line opens with the date. */
  dated: boolean;
  text: string;
  /** The server's own words, where the line says something shorter than them. */
  detail: string;
}

/** Why a send that was due did not go out. `sendingOn` is the owner's switch; unknown, the line does not guess. */
export function heldReason(sendingOn: boolean | null | undefined): string {
  if (sendingOn === false) return 'השליחה כבויה';
  if (sendingOn === true) return 'אין תבנית מאושרת';
  return 'עוד לא נשלח';
}

/** What a lead with no next step is waiting on, by its state — when the server did not say it in its own words. */
const IDLE_WORDS: Record<string, string> = {
  trial_booked: 'מחכים לשיעור הניסיון',
  waiting_list: 'ברשימת המתנה — נתריע כשיתפנה מקום',
  nothing_to_offer: 'נשמר: נודיע כשנפתח',
  in_conversation: 'בשיחה עכשיו',
};

/** "מחכה לך: להתקשר" must not come out as "מחכה לך: מחכה לך – להתקשר" when the server already says so. */
function officeTask(what: string): string {
  return what.replace(/^מחכה\s+(לך|למשרד)\s*[:–—-]?\s*/, '').trim();
}

/**
 * The second thing the eye lands on in a row: who makes the next move, what it
 * is, and when — "הבוט יזכיר את הקישור מחר ב-10:30", "היה נשלח עכשיו —
 * השליחה כבויה", "מחכה לך: להתקשר", "ב-12.3 — הילד יהיה בן 3". A lead with
 * nobody's step still says something: the server's own words when it sent any
 * ("סניף חיצוני — ההרשמה מול העירייה"), otherwise what it is waiting on.
 *
 * `closed` is for a lead read from the closed list in a state this file does
 * not know: it then says how it ended, like the ones it does know.
 */
export function nextStepLine(
  lead: Pick<WahubLeadRow, 'next' | 'stage' | 'stage_label'>,
  now: Date,
  sendingOn?: boolean | null,
  closed: boolean = isClosedLead(lead),
): NextStepLine {
  const { who, what, when, state } = lead.next ?? NO_NEXT;
  const words = whenWords(when, now);

  // The time has come and nothing went out: said plainly, whoever's step it is.
  if (state === 'due') {
    return { who: who === 'none' ? 'bot' : who, tone: 'held', dated: false, text: `היה נשלח עכשיו — ${heldReason(sendingOn)}`, detail: what };
  }

  if (who === 'office') {
    const task = officeTask(what);
    const ahead = words && !words.past ? ` · ${words.text}` : '';
    return { who, tone: 'office', dated: false, text: `${task ? `מחכה לך: ${task}` : 'מחכה לך'}${ahead}`, detail: '' };
  }

  if (who === 'bot') {
    if (!words) return { who, tone: 'bot', dated: false, text: what || 'הבוט מטפל', detail: '' };
    // Planned, and its hour has passed: the next run of the bot takes it, within minutes.
    if (words.past) {
      return { who, tone: 'bot', dated: false, text: what ? `${what} — בדקות הקרובות` : 'הבוט יחזור בדקות הקרובות', detail: '' };
    }
    const dated = lead.stage === 'waiting_date' || words.days >= 7;
    const text = !what ? `הבוט יחזור ${words.text}` : dated ? `${words.text} — ${what}` : `${what} ${words.text}`;
    return { who, tone: 'bot', dated, text, detail: '' };
  }

  // Nobody's step. The server's own words come first; without them a closed lead says how it ended,
  // and an open one what it is waiting on.
  if (closed) return { who, tone: 'quiet', dated: false, text: what || leadStageText(lead) || 'נסגר', detail: '' };
  if (what) return { who, tone: 'quiet', dated: false, text: words && !words.past ? `${what} ${words.text}` : what, detail: '' };
  const idle = IDLE_WORDS[lead.stage];
  if (idle) return { who, tone: 'quiet', dated: false, text: words && !words.past ? `${idle} · ${words.text}` : idle, detail: '' };
  return { who, tone: 'quiet', dated: false, text: 'אין צעד כרגע', detail: '' };
}

// ---------------------------------------------------------------------------
// The details: the child, the trial, the times the bot comes back
// ---------------------------------------------------------------------------

/** "שנתיים ו-7 חודשים", "5", "8 חודשים" — the age as it was said. Empty when it was not. */
export function childAgeText(child: Pick<WahubLeadChild, 'age_years' | 'age_months'> | null | undefined): string {
  const years = child?.age_years ?? 0;
  const months = child?.age_months ?? 0;
  if (years > 0 && months > 0) {
    const tail = months === 1 ? 'וחודש' : months === 2 ? 'וחודשיים' : `ו-${months} חודשים`;
    return `${plural(years, 'שנה', 'שנתיים', 'שנים')} ${tail}`;
  }
  if (years > 0) return years === 1 ? 'שנה' : years === 2 ? 'שנתיים' : String(years);
  if (months > 0) return plural(months, 'חודש', 'חודשיים', 'חודשים');
  return '';
}

export interface Fact {
  label: string;
  value: string;
}

function facts(pairs: Array<[string, string]>): Fact[] {
  return pairs.filter(([, value]) => value).map(([label, value]) => ({ label, value }));
}

export function childFacts(child: WahubLeadChild | null | undefined): Fact[] {
  if (!child) return [];
  return facts([
    ['שם', child.name],
    ['גיל', childAgeText(child)],
    ['כיתה', child.grade],
    ['תאריך לידה', child.birth_date ? formatFullDate(child.birth_date) : ''],
  ]);
}

/** Whether they came: said only once it is known, or once the lesson is plainly still ahead. */
function attendedWords(trial: WahubLeadTrial, now: Date): string {
  if (trial.attended === true) return 'הגיעו';
  if (trial.attended === false) return 'לא הגיעו';
  const when = whenWords(trial.date, now);
  return when && !when.past ? 'עוד לא התקיים' : '';
}

export function trialFacts(trial: WahubLeadTrial | null | undefined, now: Date): Fact[] {
  if (!trial) return [];
  return facts([
    ['חוג', trial.course],
    ['סניף', trial.branch],
    ['מתי', fullWhen(trial.date)],
    ['מדריך', trial.instructor],
    ['הגעה', attendedWords(trial, now)],
  ]);
}

/** The kinds of coming back (ג), for a row whose label the server left out. */
export const FOLLOW_UP_KIND_LABELS: Record<string, string> = {
  link_reminder: 'תזכורת לקישור ההרשמה',
  will_check: 'בדיקה אם יש חדש',
  trial_feedback: 'איך היה בשיעור הניסיון',
  trial_no_show: 'הצעה למועד אחר לניסיון',
  date_arrived: 'המועד הגיע',
  dormant: 'פנייה כשנפתחת הרשמה',
};

export type FollowUpTone = 'planned' | 'held' | 'sent' | 'off' | 'bad';

export interface FollowUpLine {
  /** What kind of coming back, and which of the three. */
  title: string;
  /** What became of it, in a word or two. */
  status: string;
  tone: FollowUpTone;
  /** When it is planned for, or when it happened. */
  when: string;
  /** Why it was cancelled or failed, when the server says. */
  note: string;
}

/** One coming back as a line: what it is, when, and what happened. */
export function followUpLine(followUp: WahubLeadFollowUp, now: Date, sendingOn?: boolean | null): FollowUpLine {
  const kind = followUp.kind_label || FOLLOW_UP_KIND_LABELS[followUp.kind] || 'פנייה של הבוט';
  const title = followUp.step ? `${kind} · פנייה ${followUp.step}` : kind;
  const happened = formatDateTime(followUp.acted_at ?? followUp.due_at, now);
  const note = followUp.outcome_note;
  switch (followUp.status) {
    case 'planned': {
      const due = whenWords(followUp.due_at, now);
      return { title, status: 'מתוכנן', tone: 'planned', when: due ? (due.past ? 'בדקות הקרובות' : due.text) : '', note };
    }
    case 'due':
      // Short enough for a mark beside the title; why it did not go out is said under it.
      return { title, status: 'היה נשלח עכשיו', tone: 'held', when: formatDateTime(followUp.due_at, now), note: note || heldReason(sendingOn) };
    case 'sent':
      return { title, status: 'נשלח', tone: 'sent', when: happened, note };
    case 'skipped':
      return { title, status: 'בוטל', tone: 'off', when: happened, note };
    case 'failed':
      return { title, status: 'לא נשלח', tone: 'bad', when: happened, note };
    default:
      return { title, status: followUp.status_label || followUp.status, tone: 'off', when: happened, note };
  }
}

/** The times the bot comes back, the one still ahead first and then the newest behind it. */
export function sortFollowUps(followUps: WahubLeadFollowUp[]): WahubLeadFollowUp[] {
  const open = (item: WahubLeadFollowUp) => item.status === 'planned' || item.status === 'due';
  const at = (item: WahubLeadFollowUp) => new Date(item.acted_at ?? item.due_at ?? 0).getTime() || 0;
  return [...followUps].sort((a, b) => Number(open(b)) - Number(open(a)) || at(b) - at(a));
}

// ---------------------------------------------------------------------------
// Each thing once
// ---------------------------------------------------------------------------

/** The words of a sentence, without its marks: a quote mark or a full stop does not make two sentences differ. */
function wordsOf(text: string | null | undefined): string[] {
  return (text ?? '')
    .normalize('NFKC')
    .replace(/[֑-ׇ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** A sentence long enough for "nearly the same" to mean something. */
const NEARLY_FROM_WORDS = 8;
/** At most this share of its words may be new for it to count as the same sentence said again. */
const NEARLY_NEW_SHARE = 0.25;

/**
 * "כל מידע פעם אחת" (docs/CHANGE-IMPACT-2026-10-12-CRM-ROUND-FONT-AND-CLARITY.md):
 * whether a sentence tells the reader anything the ones already on the screen
 * did not. It does not when it is empty, when all of it already stands in one
 * of them, or when it is one of them said again with a word or two changed —
 * the same sentence written on another day reads "אתמול" where today's reads
 * "לפני יומיים".
 */
export function saysMore(text: string | null | undefined, ...said: Array<string | null | undefined>): boolean {
  const words = wordsOf(text);
  if (!words.length) return false;
  for (const other of said) {
    const have = new Set(wordsOf(other));
    if (!have.size) continue;
    const fresh = words.filter((word) => !have.has(word)).length;
    if (fresh === 0) return false;
    if (words.length >= NEARLY_FROM_WORDS && fresh / words.length <= NEARLY_NEW_SHARE) return false;
  }
  return true;
}

/**
 * A line of the timeline as the screen shows it. The server ends a change of
 * state with its reason in brackets — "בשיחה ← אמר שיבדוק ויחזור (…)" — and that
 * reason is the sentence the screen already opens with: the brackets are then
 * left out, and the line is the short thing it should be. A bracket that says
 * something else stays.
 */
export function timelineWords(text: string, ...said: Array<string | null | undefined>): string {
  const line = text.trim();
  if (!line.endsWith(')')) return line;
  // The bracket that closes the line, found from its end: a reason may hold brackets of its own ("(גיל 6)").
  let depth = 0;
  let open = -1;
  for (let at = line.length - 1; at >= 0; at -= 1) {
    if (line[at] === ')') depth += 1;
    else if (line[at] === '(') {
      depth -= 1;
      if (depth === 0) {
        open = at;
        break;
      }
    }
  }
  const head = open > 0 ? line.slice(0, open).trim() : '';
  if (!head) return line;
  return saysMore(line.slice(open + 1, -1), ...said) ? line : head;
}

/**
 * The child's facts, when they say more than the chip beside the sentence
 * already does ("גיל 6" under "למה זה ליד", and again "גיל: 6" two lines down,
 * is the same thing twice). One fact that is new brings the others with it —
 * a name alone, torn from its age, reads worse than the pair.
 */
export function factsBeyond(facts: Fact[], ...said: Array<string | null | undefined>): Fact[] {
  return facts.some((fact) => saysMore(fact.value, ...said)) ? facts : [];
}

/**
 * The bot's message that belongs to "מה קורה עכשיו": the one still ahead —
 * planned, or due and held back. With none ahead, the last one that went out,
 * while it is the bot the lead is waiting on ("הבוט חזר אליו — מחכים לתשובה");
 * once the step is the office's, what the bot sent is history.
 */
export function currentFollowUp(
  followUps: WahubLeadFollowUp[],
  lead: Pick<WahubLeadRow, 'next'> | null | undefined,
): WahubLeadFollowUp | null {
  const sorted = sortFollowUps(followUps);
  const first = sorted[0];
  if (!first) return null;
  if (first.status === 'planned' || first.status === 'due') return first;
  if (first.status === 'sent' && lead?.next?.who !== 'office') return first;
  return null;
}

// ---------------------------------------------------------------------------
// The one filter: the states that have someone in them
// ---------------------------------------------------------------------------

function stageRank(key: string): number {
  const rank = STAGE_ORDER.indexOf(key);
  return rank === -1 ? STAGE_ORDER.length : rank;
}

/**
 * The states the filter offers. From the server's own list when it sends one —
 * only those with someone in them. Otherwise from the rows read so far, with a
 * number only when the whole list was read (`complete`), so a count is never a
 * guess. The state already chosen is always among them, so the control can
 * never show a blank.
 */
export function stageOptions(
  sent: WahubLeadStageCount[] | undefined,
  rows: ReadonlyArray<Pick<WahubLeadRow, 'stage' | 'stage_label'>>,
  complete: boolean,
  selected: string | null = null,
): WahubLeadStageCount[] {
  let options: WahubLeadStageCount[];
  if (sent) {
    options = sent.filter((stage) => stage.count == null || stage.count > 0);
  } else {
    const seen = new Map<string, WahubLeadStageCount>();
    for (const row of rows) {
      if (!row.stage) continue;
      const held = seen.get(row.stage);
      if (held) held.count = (held.count ?? 0) + 1;
      else seen.set(row.stage, { key: row.stage, label: leadStageText(row), count: 1 });
    }
    options = [...seen.values()].map((stage) => (complete ? stage : { ...stage, count: null }));
  }
  if (selected && !options.some((stage) => stage.key === selected)) {
    options = [...options, { key: selected, label: LEAD_V2_STAGE_LABELS[selected] || selected, count: null }];
  }
  return options.sort((a, b) => stageRank(a.key) - stageRank(b.key));
}

/** "קיבל קישור ועוד לא נרשם (12)" — the number only when it is known. */
export function stageOptionText(stage: WahubLeadStageCount): string {
  return stage.count == null ? stage.label : `${stage.label} (${stage.count.toLocaleString('he-IL')})`;
}

// ---------------------------------------------------------------------------
// Rows across pages; nothing here
// ---------------------------------------------------------------------------

/** The rows of every page read so far, each lead once, in the server's order. */
export function leadRows(pages: ReadonlyArray<Pick<WahubLeadsPage, 'results'> | null> | undefined): WahubLeadRow[] {
  const seen = new Set<number>();
  const rows: WahubLeadRow[] = [];
  for (const page of pages ?? []) {
    for (const row of page?.results ?? []) {
      if (seen.has(row.contact_id)) continue;
      seen.add(row.contact_id);
      rows.push(row);
    }
  }
  return rows;
}

function leadsWord(n: number): string {
  return n === 1 ? 'בליד אחד' : `ב-${n.toLocaleString('he-IL')} לידים`;
}

/** What an empty list says. A list emptied by a search or a state says that, and nothing about the bot. */
export function emptyWords(view: WahubLeadsView, counts: WahubLeadCounts | null, filtered: boolean): { title: string; text: string } {
  if (filtered) return { title: 'אין לידים שמתאימים', text: 'נסו מילה אחרת, או נקו את הסינון.' };
  if (view === 'office') {
    return {
      title: 'אין לידים שמחכים לך',
      text: counts && counts.bot > 0 ? `הבוט מטפל ${leadsWord(counts.bot)}.` : 'כשמישהו יצטרך אותך, הוא יופיע כאן.',
    };
  }
  if (view === 'bot') {
    return {
      title: 'הבוט לא מטפל כרגע באף ליד',
      text: counts && counts.office > 0 ? `${counts.office.toLocaleString('he-IL')} מחכים לך.` : '',
    };
  }
  return { title: 'עוד לא נסגר אף ליד', text: 'מי שנרשם, מי שלא מעוניין ומי שהוצאתם מהרשימה יופיעו כאן.' };
}

// ---------------------------------------------------------------------------
// What can be done with a lead
// ---------------------------------------------------------------------------

export interface LeadActionSet {
  /** The owner a press would set: "קח אליי" (office) or "החזר לבוט" (bot). Null: not offered. */
  owner: 'office' | 'bot' | null;
  snooze: boolean;
  /** "לא רלוונטי". */
  remove: boolean;
  /** "החזר לרשימה" — for a lead that was closed by a person or by the bot, never for one who registered. */
  reopen: boolean;
}

/** `closed`: as in `nextStepLine` — a lead read from the closed list, whatever its state is called. */
export function leadActions(lead: Pick<WahubLeadRow, 'owner' | 'stage'>, closed: boolean = isClosedLead(lead)): LeadActionSet {
  if (closed) return { owner: null, snooze: false, remove: false, reopen: !SETTLED_STAGES.has(lead.stage) };
  return { owner: lead.owner === 'office' ? 'bot' : 'office', snooze: true, remove: true, reopen: false };
}

/**
 * Why "החזר לבוט" is locked, in plain words — the customer asked out, and the bot does not come back to them
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.1.6). Empty when nothing stops it, and when the press is not offered
 * at all. "דחה למועד" is the office's own mark and stays open: on its day the lead comes back to the office,
 * not to the bot.
 */
export function leadBotBlocked(lead: Pick<WahubLeadRow, 'owner' | 'stage' | 'opted_out'>, closed: boolean = isClosedLead(lead)): string {
  return leadActions(lead, closed).owner === 'bot' ? botBlockedReason(lead) : '';
}

export const OWNER_ACTION_LABELS: Record<'office' | 'bot', string> = { office: 'קח אליי', bot: 'החזר לבוט' };

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** "דחה למועד": the first day that can be chosen is tomorrow, and the box opens a week ahead. */
export function snoozeDates(now: Date): { min: string; suggested: string } {
  const today = israelToday(now);
  return { min: addDays(today, 1), suggested: addDays(today, 7) };
}

export function isValidSnooze(until: string, now: Date): boolean {
  return DATE_ONLY.test(until) && !Number.isNaN(new Date(until).getTime()) && daysBetween(israelToday(now), until) >= 1;
}

// ---------------------------------------------------------------------------
// A change, shown before the server has answered
// ---------------------------------------------------------------------------

export type LeadChange =
  | { kind: 'owner'; owner: 'office' | 'bot' }
  | { kind: 'snooze'; until: string; note: string }
  | { kind: 'close'; reason: WahubLeadCloseReason }
  | { kind: 'reopen' };

/**
 * How a lead reads once the change is saved — as far as the screen can know.
 * The server has the last word a moment later (the lists are read again); this
 * only keeps the row from standing in the wrong place meanwhile.
 */
export function changedLead<T extends WahubLeadRow>(lead: T, change: LeadChange): T {
  switch (change.kind) {
    case 'owner':
      return { ...lead, owner: change.owner, next: { who: change.owner, what: '', when: null, state: 'none' } };
    case 'snooze':
      return {
        ...lead,
        owner: 'bot',
        stage: 'waiting_date',
        stage_label: LEAD_V2_STAGE_LABELS.waiting_date,
        next: { who: 'bot', what: change.note, when: change.until, state: 'planned' },
      };
    case 'close':
      return { ...lead, owner: '', stage: change.reason, stage_label: LEAD_V2_STAGE_LABELS[change.reason], next: NO_NEXT };
    case 'reopen':
      // Where it lands is the server's to say; until then it only leaves the closed list.
      return { ...lead, stage: '', stage_label: '', next: NO_NEXT };
  }
}

function stepCount(counts: WahubLeadCounts, from: WahubLeadsView | null, to: WahubLeadsView | null): WahubLeadCounts {
  if (from === to) return counts;
  const next = { ...counts };
  if (from) next[from] = Math.max(0, next[from] - 1);
  if (to) next[to] += 1;
  return next;
}

/**
 * One list that is on screen (or kept from a moment ago), after a change to
 * one lead: the row is rewritten where it still belongs, taken out where it no
 * longer does, and the three numbers move with it. A list the lead moves into
 * is left as it is — the read that follows puts the row in its place.
 *
 * `from` is the list the lead is counted in now. It is read from the lead
 * itself; a lead with nobody's step (an outside branch, a trial ahead) does not
 * say, and the caller then names the list it was found in.
 */
export function applyLeadChange(
  pages: ReadonlyArray<WahubLeadsPage | null>,
  view: WahubLeadsView | 'all',
  lead: WahubLeadRow,
  change: LeadChange,
  from: WahubLeadsView | null = leadView(lead),
): Array<WahubLeadsPage | null> {
  const after = changedLead(lead, change);
  const to = change.kind === 'reopen' ? null : leadView(after);
  // The results of a search through every list hold a lead wherever it stands: it is rewritten in place.
  const stays = view === 'all' || to === view;
  return pages.map((page) => {
    if (!page) return page;
    const held = page.results.some((row) => row.contact_id === lead.contact_id);
    const results = !held
      ? page.results
      : stays
        ? page.results.map((row) => (row.contact_id === lead.contact_id ? { ...row, ...readRowFields(after) } : row))
        : page.results.filter((row) => row.contact_id !== lead.contact_id);
    const stages =
      held && !stays && page.stages
        ? page.stages.map((stage) =>
            stage.key === lead.stage && stage.count != null ? { ...stage, count: Math.max(0, stage.count - 1) } : stage,
          )
        : page.stages;
    const next: WahubLeadsPage = { ...page, counts: stepCount(page.counts, from, to), results };
    if (stages) next.stages = stages;
    return next;
  });
}

/** The row's own fields of a lead that may carry more (its details). */
function readRowFields(lead: WahubLeadRow): WahubLeadRow {
  const row: WahubLeadRow = {
    contact_id: lead.contact_id,
    name: lead.name,
    phone: lead.phone,
    is_demo: lead.is_demo,
    stage: lead.stage,
    stage_label: lead.stage_label,
    owner: lead.owner,
    summary: lead.summary,
    chips: lead.chips,
    since: lead.since,
    next: lead.next,
    last_message_at: lead.last_message_at,
  };
  if (lead.waiting_list) row.waiting_list = lead.waiting_list;
  if (lead.future) row.future = lead.future;
  if (lead.list) {
    row.list = lead.list;
    row.list_label = lead.list_label;
  }
  if (lead.customer !== undefined) row.customer = lead.customer;
  if (lead.opted_out !== undefined) row.opted_out = lead.opted_out;
  if (lead.overdue !== undefined) {
    row.overdue = lead.overdue;
    row.waiting_label = lead.waiting_label;
    row.waiting_from = lead.waiting_from;
    row.waited_office_minutes = lead.waited_office_minutes;
  }
  return row;
}

/** What the screen says once a change was saved. */
export function changeSavedText(change: LeadChange, lead: Pick<WahubLeadRow, 'name' | 'phone'>): string {
  // Worded so that it is true of a mother and of a father alike: the name, then what happened.
  const name = leadTitle(lead);
  switch (change.kind) {
    case 'owner':
      return change.owner === 'office' ? `${name}: מחכה לך עכשיו` : `${name}: הבוט ממשיך לטפל`;
    case 'snooze':
      return `${name}: חוזרים ב-${formatFullDate(change.until)}`;
    case 'close':
      return `${name}: מחוץ ללידים`;
    case 'reopen':
      return `${name}: בחזרה בלידים`;
  }
}

export function changeFailedText(change: LeadChange): string {
  switch (change.kind) {
    case 'owner':
      return change.owner === 'office' ? 'לא הצלחנו להעביר את הליד אליך' : 'לא הצלחנו להחזיר את הליד לבוט';
    case 'snooze':
      return 'הדחייה לא נשמרה';
    case 'close':
      return 'הליד לא הוצא מהרשימה';
    case 'reopen':
      return 'הליד לא הוחזר לרשימה';
  }
}

// ---------------------------------------------------------------------------
// The screen: the list, and the details of one lead
// ---------------------------------------------------------------------------

/** Room for the list with the details beside it. Below it — a phone, a narrow tablet — one of the two at a time. */
export const LEADS_SPLIT_FROM = 900;

export type LeadsLayout = 'split' | 'single';

/**
 * Unmeasured (the first paint) counts as wide. A phone is one screen at a time
 * whatever the frame measures — the same line the stylesheet draws the phone
 * from (lib/wahub/screens.ts), so the two never disagree.
 */
export function leadsLayout(width: number | null, phone = false): LeadsLayout {
  if (phone) return 'single';
  return width === null || width >= LEADS_SPLIT_FROM ? 'split' : 'single';
}

export interface LeadsPanes {
  list: boolean;
  details: boolean;
  /** The details stand in place of the list, with a way back — rather than beside it. */
  cover: boolean;
}

export function leadsPanes(layout: LeadsLayout, leadId: number | null): LeadsPanes {
  const open = leadId != null;
  return { list: layout === 'split' || !open, details: open, cover: open && layout === 'single' };
}
