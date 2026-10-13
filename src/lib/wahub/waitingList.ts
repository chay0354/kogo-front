import type {
  WahubLessonOption,
  WahubLessonOptions,
  WahubNote,
  WahubNotifyHow,
  WahubNotifyPreview,
  WahubNotifyResult,
  WahubWaitingEntry,
  WahubWaitingLesson,
  WahubWaitingListPage,
} from '@/types/wahub';
import { readableError } from '../apiError';
import { formatDateTime, formatShortDate } from './format';
import { isActiveEntry, placeText, readActionContact, readWaitingEntry, waitingSinceText } from './futureLeads';

export { placeText };

/**
 * The full waiting list, adding to it by hand, telling a customer that a place
 * was freed, and editing or deleting a note
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז): what the server sent, read
 * tolerantly, and the words and small decisions of the screens — kept out of
 * the components so they can be read, and tested, on their own.
 *
 * Nothing here decides who waits, whether a lesson is full or whether a message
 * may go out: all of that is the server's. A server built before any of it
 * sends none of it, and the screens then offer none of it.
 */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function time(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

/** A count: a whole number that is not below nought. */
function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** A number that may be unknown: null stays null, and so does anything that is not a number. */
function maybeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

// ---------------------------------------------------------------------------
// Does the server know any of this?
// ---------------------------------------------------------------------------

/** The server can tell the customer of a freed place: it says, on the entry, whether it did (ז.1). */
export function knowsNotify(holder: { notified_at?: string | null } | null | undefined): boolean {
  return holder != null && holder.notified_at !== undefined;
}

/** The server can edit and delete a note: it says, on the note, whether it was edited (ז.5). */
export function canEditNote(note: Pick<WahubNote, 'edited_at'> | null | undefined): boolean {
  return note != null && note.edited_at !== undefined;
}

// ---------------------------------------------------------------------------
// The full list, by lesson
// ---------------------------------------------------------------------------

function lessonLabel(course: string, day: string, start: string, branch: string): string {
  return [course, day ? `יום ${day}` : '', start, branch].filter(Boolean).join(' · ');
}

export function readWaitingLesson(raw: unknown): WahubWaitingLesson | null {
  const data = record(raw);
  const id = str(data?.id);
  if (!data || !id) return null;
  const course = str(data.course);
  const day = str(data.day);
  const start = str(data.start);
  const branch = str(data.branch);
  const ids = Array.isArray(data.entry_ids) ? data.entry_ids.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0) : [];
  return {
    id,
    course,
    day,
    start,
    end: str(data.end),
    branch,
    label: str(data.label) || lessonLabel(course, day, start, branch),
    exists: data.exists !== false,
    enrolled: maybeNumber(data.enrolled),
    capacity: maybeNumber(data.capacity),
    seats_left: maybeNumber(data.seats_left),
    is_full: data.is_full === true,
    seats_label: str(data.seats_label),
    waiting: count(data.waiting),
    freed: count(data.freed),
    entry_ids: ids,
  };
}

/**
 * The lessons of a server that sends none (built before ז): one for each lesson the entries name, in the order
 * the entries came — a freed place first, then the oldest. They carry no numbers: only who waits.
 */
function lessonsOfEntries(rows: ReadonlyArray<unknown>, entries: ReadonlyArray<WahubWaitingEntry>): WahubWaitingLesson[] {
  const byId = new Map<string, WahubWaitingLesson>();
  const ids = new Set(entries.map((entry) => entry.id));
  for (const raw of rows) {
    const data = record(raw);
    const entry = data ? readWaitingEntry(data) : null;
    if (!data || !entry || !ids.has(entry.id)) continue;
    const lesson = record(data.lesson) ?? {};
    const key = entry.lesson_id || entry.lesson_label;
    if (!key) continue;
    let held = byId.get(key);
    if (!held) {
      const course = str(lesson.course);
      const day = str(lesson.day);
      const start = str(lesson.start);
      const branch = str(lesson.branch);
      held = {
        id: key,
        course,
        day,
        start,
        end: str(lesson.end),
        branch,
        label: entry.lesson_label || lessonLabel(course, day, start, branch),
        exists: true,
        enrolled: null,
        capacity: null,
        seats_left: null,
        is_full: false,
        seats_label: '',
        waiting: 0,
        freed: 0,
        entry_ids: [],
      };
      byId.set(key, held);
    }
    held.entry_ids.push(entry.id);
    if (entry.status === 'freed') held.freed += 1;
    else if (entry.status === 'waiting') held.waiting += 1;
  }
  return [...byId.values()];
}

/** GET waiting-list/. Null for an answer that is not the list at all. */
export function readWaitingListPage(raw: unknown): WahubWaitingListPage | null {
  const data = record(raw);
  if (!data || !Array.isArray(data.results)) return null;
  const results = data.results.map(readWaitingEntry).filter((entry): entry is WahubWaitingEntry => entry !== null);
  const counts = record(data.counts) ?? {};
  const counted = Array.isArray(data.lessons);
  const lessons = counted
    ? (data.lessons as unknown[]).map(readWaitingLesson).filter((lesson): lesson is WahubWaitingLesson => lesson !== null)
    : lessonsOfEntries(data.results, results);
  return {
    counts: { waiting: count(counts.waiting), freed: count(counts.freed) },
    lessons,
    counted,
    results,
  };
}

/** The entries of one lesson, in the order of its line: by the server's `entry_ids`, else by the place each holds. */
export function entriesOfLesson(lesson: WahubWaitingLesson, entries: ReadonlyArray<WahubWaitingEntry>): WahubWaitingEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  const listed = lesson.entry_ids.map((id) => byId.get(id)).filter((entry): entry is WahubWaitingEntry => entry !== undefined);
  if (listed.length) return listed;
  return entries
    .filter((entry) => entry.lesson_id === lesson.id)
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
}

/** A place was freed in this lesson for somebody on screen. */
export function lessonFreed(lesson: WahubWaitingLesson, entries: ReadonlyArray<WahubWaitingEntry>): boolean {
  return entries.some((entry) => entry.status === 'freed') || (entries.length === 0 && lesson.freed > 0);
}

/** "ממתין אחד" / "3 ממתינים". */
export function waitersText(total: number): string {
  if (total <= 0) return 'אין ממתינים';
  return total === 1 ? 'ממתין אחד' : `${total.toLocaleString('he-IL')} ממתינים`;
}

export interface LessonHead {
  /** The class — the largest words of the row. */
  title: string;
  /** "יום שלישי · 17:00 · מינץ" */
  when: string;
  /** "19 מתוך 20 · נשאר מקום אחד" — or that the lesson is gone; '' when the server did not count. */
  seats: string;
  /** "3 ממתינים" */
  waiters: string;
}

/** A lesson's title row: the class, when and where; how full it is now; how many wait. */
export function lessonHead(lesson: WahubWaitingLesson, shown: number): LessonHead {
  const when = [lesson.day ? `יום ${lesson.day}` : '', lesson.start, lesson.branch].filter(Boolean).join(' · ');
  return {
    title: lesson.course || lesson.label,
    when: lesson.course ? when : '',
    seats: lesson.exists ? lesson.seats_label : 'השיעור כבר לא מתקיים',
    waiters: waitersText(shown),
  };
}

/** The one line at the way in: how many wait, and for how many a place was freed. */
export function waitingStripText(counts: { waiting: number; freed: number }): { total: string; freed: string } {
  const total = counts.waiting + counts.freed;
  return {
    total: waitersText(total),
    freed: counts.freed > 0 ? (counts.freed === 1 ? 'התפנה מקום לאחד' : `התפנה מקום ל-${counts.freed.toLocaleString('he-IL')}`) : '',
  };
}

export type EntryTone = 'waiting' | 'freed' | 'told' | 'replied' | 'closed';

export interface EntryStanding {
  tone: EntryTone;
  /** The one word of the row: "ממתין" / "התפנה מקום" / "הודענו ללקוח" / "הלקוח ענה". */
  word: string;
  /** "הודענו ללקוח · 14.10 11:02 · מיכל כהן" — only once the customer was told; '' otherwise. */
  told: string;
  /** "הלקוח ענה · 14.10 11:40" — only when they wrote after being told. */
  replied: string;
}

/**
 * When the customer was told of the place that is free NOW; null when they were not — also when they were told
 * of an earlier one that was taken again since. The entry keeps that moment as history; nothing on the screen
 * goes by it (the server's own rule, word for word: the telling counts from the moment this place was freed).
 */
export function toldOfThisPlace(entry: Pick<WahubWaitingEntry, 'status' | 'notified_at' | 'freed_at'>): string | null {
  if (entry.status !== 'freed' || !entry.notified_at) return null;
  if (!entry.freed_at) return entry.notified_at;
  return Date.parse(entry.notified_at) >= Date.parse(entry.freed_at) ? entry.notified_at : null;
}

/** Where one entry stands, as the office reads it: still waiting, a place freed, the customer told, the customer answered. */
export function entryStanding(entry: WahubWaitingEntry, now: Date): EntryStanding {
  const toldAt = toldOfThisPlace(entry);
  const told = toldAt ? ['הודענו ללקוח', formatDateTime(toldAt, now), entry.notified_by_name ?? ''].filter(Boolean).join(' · ') : '';
  const replied = toldAt && entry.customer_replied_at ? ['הלקוח ענה', formatDateTime(entry.customer_replied_at, now)].filter(Boolean).join(' · ') : '';
  if (!isActiveEntry(entry)) return { tone: 'closed', word: entry.status_label, told, replied };
  if (replied) return { tone: 'replied', word: 'הלקוח ענה', told, replied };
  if (told) return { tone: 'told', word: 'הודענו ללקוח', told, replied };
  if (entry.status === 'freed') return { tone: 'freed', word: 'התפנה מקום', told, replied };
  return { tone: 'waiting', word: 'ממתין', told, replied };
}

/** Who put the entry on the list: "הבוט הוסיף" / "הוסיף: מיכל כהן". */
export function addedByText(entry: Pick<WahubWaitingEntry, 'added_by' | 'added_by_name'>): string {
  if (entry.added_by === 'bot') return 'הבוט הוסיף';
  if (entry.added_by === 'person') return entry.added_by_name ? `הוסיף: ${entry.added_by_name}` : 'נוסף מהמשרד';
  return '';
}

/** What a press on a person opens: since when, the place in line, who added them — the row itself already says the rest. */
export function entryMoreFacts(entry: WahubWaitingEntry, now: Date): string[] {
  const freed = entry.status === 'freed' && entry.freed_at ? `התפנה ב-${formatShortDate(entry.freed_at, now)}` : '';
  return [waitingSinceText(entry.created_at, now), placeText(entry.position), freed, addedByText(entry)].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Choosing a lesson to wait for
// ---------------------------------------------------------------------------

export function readLessonOption(raw: unknown): WahubLessonOption | null {
  const data = record(raw);
  const id = str(data?.id);
  if (!data || !id) return null;
  const course = str(data.course);
  const day = str(data.day);
  const start = str(data.start);
  const branch = str(data.branch);
  const full = data.is_full === true;
  return {
    id,
    course,
    day,
    start,
    end: str(data.end),
    branch_id: str(data.branch_id),
    branch,
    label: str(data.label) || lessonLabel(course, day, start, branch),
    seats_label: str(data.seats_label),
    is_full: full,
    // The server's own word; one that does not say is read from "full" — the rule it is built on.
    can_join: typeof data.can_join === 'boolean' ? data.can_join : full,
    waiting: count(data.waiting),
    on_list: data.on_list === true,
  };
}

/** GET waiting-list/lessons/. Null for an answer that is not the list of lessons at all. */
export function readLessonOptions(raw: unknown): WahubLessonOptions | null {
  const data = record(raw);
  if (!data || !Array.isArray(data.results)) return null;
  const results = data.results.map(readLessonOption).filter((option): option is WahubLessonOption => option !== null);
  const branches = (Array.isArray(data.branches) ? data.branches : [])
    .map((row) => {
      const branch = record(row);
      const id = str(branch?.id);
      const name = str(branch?.name);
      return id && name ? { id, name } : null;
    })
    .filter((branch): branch is { id: string; name: string } => branch !== null);
  return { branches, total: count(data.total) || results.length, results };
}

/**
 * The lessons as the window shows them: the ones that can be waited for (full ones — with those this person is
 * already waiting for marked, not hidden), and, a press away, the ones that have room and so cannot.
 */
export function splitLessonOptions(options: ReadonlyArray<WahubLessonOption>): { joinable: WahubLessonOption[]; withRoom: WahubLessonOption[] } {
  return {
    joinable: options.filter((option) => option.can_join || option.on_list),
    withRoom: options.filter((option) => !option.can_join && !option.on_list),
  };
}

/** Said wherever a lesson that has room is met: there is nothing to wait for. */
export const HAS_ROOM_TEXT = 'בשיעור הזה יש מקום — אפשר לרשום ישר';

/** "יום שלישי · 17:00 · מינץ" — under the class's name. */
export function lessonOptionWhen(option: Pick<WahubLessonOption, 'day' | 'start' | 'branch'>): string {
  return [option.day ? `יום ${option.day}` : '', option.start, option.branch].filter(Boolean).join(' · ');
}

/** The quiet end of a lesson's row: how full it is, and how many already wait. */
export function lessonOptionNote(option: WahubLessonOption): string {
  if (option.on_list) return 'כבר ברשימה';
  const waiting = option.waiting > 0 ? waitersText(option.waiting) : '';
  return [option.seats_label, option.can_join ? waiting : ''].filter(Boolean).join(' · ');
}

/** How long what is known of the child may be. */
export const WAITING_CHILD_MAX = 80;

interface Failure {
  response?: { status?: number; data?: unknown };
}

function failureCode(error: unknown): string {
  return str(record((error as Failure)?.response?.data)?.code);
}

function failureDetail(error: unknown): string {
  return str(record((error as Failure)?.response?.data)?.detail);
}

/**
 * Why somebody was not added to a waiting list, in the screen's own plain words — for the refusals the contract
 * names (ד.4). '' for anything else: the caller then says what the server said, or that the outcome is not known.
 */
export function joinRefusal(error: unknown): string {
  switch (failureCode(error)) {
    case 'has_room':
      return `${HAS_ROOM_TEXT}.`;
    case 'exists':
      return 'הלקוח כבר ברשימת ההמתנה של השיעור הזה.';
    case 'no_lesson':
    case 'bad_lesson':
      return 'השיעור הזה כבר לא מתקיים — בחרו שיעור אחר.';
    default:
      return '';
  }
}

/** Why somebody was not added, whatever went wrong: a refusal in plain words, the server's own reason, or "not known". */
export function joinFailedText(error: unknown): string {
  const refusal = joinRefusal(error);
  if (refusal) return refusal;
  if (!(error as Failure)?.response) return 'לא ידוע אם הלקוח נוסף לרשימה. בדקו ברשימת ההמתנה לפני שמנסים שוב.';
  return readableError(error, 'הלקוח לא נוסף לרשימת ההמתנה');
}

// ---------------------------------------------------------------------------
// Telling the customer that a place was freed
// ---------------------------------------------------------------------------

function how(value: unknown): WahubNotifyHow {
  return value === 'text' || value === 'template' ? value : '';
}

/**
 * Why a message cannot go out, in the screen's own plain words, by the server's code (ז.4). A code this screen
 * does not know is said in the server's words.
 */
const NOT_SENT_WORDS: Record<string, string> = {
  not_active: 'הרשומה כבר לא ברשימת ההמתנה.',
  not_freed: 'עוד לא התפנה מקום בשיעור הזה — אין על מה להודיע.',
  taken: 'המקום נתפס בינתיים — השיעור שוב מלא. ההודעה לא נשלחה.',
  no_lesson: 'השיעור כבר לא מתקיים — הרשומה תיסגר לבד.',
  demo: 'זה איש קשר דמו — לא שולחים אליו הודעות.',
  sending_off: 'השליחה ללקוחות כבויה — ההודעה לא תצא עד שתודלק.',
  no_manychat: 'אין חיבור ל-ManyChat — ההודעה לא יכולה לצאת.',
  no_template: 'אין תבנית מחוברת: עברו 24 שעות מההודעה האחרונה של הלקוח, ואז וואטסאפ מרשה רק תבנית מאושרת. מחברים אותה בהגדרות, בכרטיס "חזרה אוטומטית ללידים".',
  no_words: 'הנוסח של ההודעה כבוי בידע של הבוט — אין מה לשלוח.',
};

/** Why nothing went out: the screen's words for a code it knows, else the server's own, else a plain "לא נשלחה". */
export function notSentText(code: string, detail: string): string {
  return NOT_SENT_WORDS[code] || detail || 'ההודעה לא נשלחה.';
}

/** `notify` of GET waiting-list/{id}/notify/. Null for an answer that carries none. */
export function readNotifyPreview(raw: unknown): WahubNotifyPreview | null {
  const data = record(record(raw)?.notify);
  if (!data) return null;
  const blocked = str(data.blocked);
  // It goes out only when the server says so in so many words, and names nothing that stops it.
  const can = data.can === true && !blocked;
  const already = time(data.already_notified_at);
  return {
    can,
    how: how(data.how),
    how_label: str(data.how_label),
    text: str(data.text),
    blocked: can ? '' : blocked || 'unknown',
    detail: str(data.detail),
    // The server's own word. One that does not say, about a customer who was told before, is read as "ask
    // first": a question too many costs a press, a message too many reaches a customer.
    needs_again: typeof data.needs_again === 'boolean' ? data.needs_again : already !== null,
    already_notified_at: already,
    already_notified_by_name: str(data.already_notified_by_name),
  };
}

/** The answer of POST waiting-list/{id}/notify/. Null for one that does not say whether anything went out. */
export function readNotifyResult(raw: unknown): WahubNotifyResult | null {
  const body = record(raw);
  const data = record(body?.notify);
  if (!body || !data || typeof data.sent !== 'boolean') return null;
  return {
    sent: data.sent,
    how: how(data.how),
    code: str(data.code),
    detail: str(data.detail),
    text: str(data.text),
    already_notified_at: time(data.already_notified_at),
    already_notified_by_name: str(data.already_notified_by_name),
    entry: readWaitingEntry(body.entry),
    contact: readActionContact(body.contact),
  };
}

/** "תצא כהודעה רגילה" / "תצא כתבנית מאושרת" — the server's own line when it sent one. */
export function notifyHowText(preview: Pick<WahubNotifyPreview, 'how' | 'how_label'>): string {
  if (preview.how_label) return preview.how_label;
  if (preview.how === 'template') return 'תצא כתבנית מאושרת — הלקוח מקבל את הנוסח הקבוע של התבנית';
  if (preview.how === 'text') return 'תצא כהודעה רגילה';
  return '';
}

/**
 * "כבר נשלחה הודעה ב-14.10 11:02 (מיכל כהן). לשלוח שוב?" — asked before a second message about the same place.
 * '' when this is the first one about it: an earlier message, about a place that was since taken, asks nothing.
 */
export function alreadyNotifiedText(
  preview: Pick<WahubNotifyPreview, 'needs_again' | 'already_notified_at' | 'already_notified_by_name'>,
  now: Date,
): string {
  if (!preview.needs_again) return '';
  if (!preview.already_notified_at) return 'כבר נשלחה ללקוח הודעה על המקום הזה. לשלוח שוב?';
  const who = preview.already_notified_by_name ? ` (${preview.already_notified_by_name})` : '';
  return `כבר נשלחה הודעה ב-${formatDateTime(preview.already_notified_at, now)}${who}. לשלוח שוב?`;
}

/**
 * What the small block of "להודיע ללקוח" shows. It opens on the reading of what would go out; then the wording
 * itself, how it goes out — or why it would not — and one button. A send that the server answered with "nothing
 * went out" stays, with the reason; one that went out closes the block, and the entry says "הודענו ללקוח".
 */
export type NotifyStep =
  | { step: 'loading' }
  | { step: 'ready'; preview: WahubNotifyPreview; sending: boolean }
  /** Nothing went out, and why — or the outcome is not known. Nothing here sends again. */
  | { step: 'held'; text: string };

export interface NotifyOpen {
  entryId: number;
  step: NotifyStep;
}

/** How a press on "שלח ללקוח" ended. */
export type NotifyOutcome =
  /** It went out: the block closes, and a word says so. */
  | { kind: 'sent'; text: string }
  /** The server answered, and nothing went out — or it never answered: the block stays and says so. */
  | { kind: 'held'; text: string }
  /** The customer was already told of this place (409 `already_notified`): the block asks before sending again. */
  | { kind: 'ask'; at: string | null; by: string }
  /** Another press on this entry is being sent right now (409 `in_progress`): a quiet word, a fresh read, no second send. */
  | { kind: 'busy'; text: string }
  /** The entry is no longer one to tell about (409): the block closes, a word says why, and the lists are read again. */
  | { kind: 'gone'; text: string };

/** The answer of the send, as the screen acts on it. */
export function notifyOutcome(result: WahubNotifyResult): NotifyOutcome {
  if (result.sent) return { kind: 'sent', text: result.detail || 'ההודעה נשלחה ללקוח' };
  // A refusal of ManyChat is said in its own words: it is the only one that names what happened.
  return { kind: 'held', text: result.code === 'failed' ? result.detail || 'ההודעה לא נשלחה.' : notSentText(result.code, result.detail) };
}

/** Said when the send was never answered: it may have gone out, so nothing is tried again by itself. */
export const NOTIFY_UNKNOWN_TEXT = 'לא ידוע אם ההודעה נשלחה. בדקו בשיחה עם הלקוח לפני ששולחים שוב.';

/** A send the server refused or never answered, as the screen acts on it. */
export function notifyFailure(error: unknown): NotifyOutcome {
  const status = (error as Failure)?.response?.status ?? null;
  if (status === 409) {
    const code = failureCode(error);
    const body = record((error as Failure)?.response?.data) ?? {};
    if (code === 'already_notified') return { kind: 'ask', at: time(body.already_notified_at), by: str(body.already_notified_by_name) };
    if (code === 'in_progress') return { kind: 'busy', text: 'ההודעה לרשומה הזאת נשלחת ממש עכשיו.' };
    return { kind: 'gone', text: notSentText(code, failureDetail(error)) };
  }
  if (status === 404) return { kind: 'gone', text: 'הרשומה כבר לא ברשימת ההמתנה.' };
  if (!(error as Failure)?.response) return { kind: 'held', text: NOTIFY_UNKNOWN_TEXT };
  return { kind: 'held', text: failureDetail(error) || 'ההודעה לא נשלחה.' };
}

/** The preview once the server said the customer was already told: the same wording, and the question before it. */
export function previewAskingAgain(preview: WahubNotifyPreview, at: string | null, by: string): WahubNotifyPreview {
  return {
    ...preview,
    needs_again: true,
    already_notified_at: at ?? preview.already_notified_at,
    already_notified_by_name: by || preview.already_notified_by_name,
  };
}

// ---------------------------------------------------------------------------
// A note that was edited, or deleted
// ---------------------------------------------------------------------------

/** "נערך" — said quietly beside a note that was changed after it was written; '' for one that was not. */
export function noteEditedWord(note: Pick<WahubNote, 'edited_at'>): string {
  return note.edited_at ? 'נערך' : '';
}

/** "נערך ב-13.10 10:02 · דור סער" — for whoever wants to know when, and by whom. */
export function noteEditedTitle(note: Pick<WahubNote, 'edited_at' | 'edited_by_name'>, now: Date): string {
  if (!note.edited_at) return '';
  return [`נערך ב-${formatDateTime(note.edited_at, now)}`, note.edited_by_name ?? ''].filter(Boolean).join(' · ');
}

/** The notes with one of them replaced by its newer copy — in its own place: an edit moves nothing. */
export function withEditedNote(notes: ReadonlyArray<WahubNote> | undefined, note: WahubNote): WahubNote[] {
  return (notes ?? []).map((held) => (held.id === note.id ? note : held));
}

/** The notes without the one that was deleted. */
export function withoutNote(notes: ReadonlyArray<WahubNote> | undefined, id: number): WahubNote[] {
  return (notes ?? []).filter((held) => held.id !== id);
}

/** Why an edit cannot be saved yet — or '' when it can. Saving the same words changes nothing, and is not offered. */
export function noteEditProblem(text: string, before: string, max: number): string {
  const clean = text.trim();
  if (!clean) return 'פתק ריק — כדי להסיר אותו, מוחקים';
  if (clean.length > max) return `הפתק ארוך מדי (עד ${max} תווים)`;
  if (clean === before.trim()) return 'לא השתנה כלום';
  return '';
}

/** Why a note was not changed (or deleted): it is gone already, the outcome is not known, or the server's own reason. */
export function noteFailedText(error: unknown, fallback: string): string {
  const status = (error as Failure)?.response?.status ?? null;
  if (status === 404) return 'הפתק הזה כבר לא קיים.';
  if (!(error as Failure)?.response) return 'לא ידוע אם השינוי נשמר. בדקו את הפתק לפני שמנסים שוב.';
  return readableError(error, fallback);
}
