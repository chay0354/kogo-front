import type {
  WahubBoxCounts,
  WahubContact,
  WahubFuture,
  WahubFutureState,
  WahubMessage,
  WahubNote,
  WahubUnderstood,
  WahubWaitingEntry,
  WahubWaitingMark,
} from '@/types/wahub';
import { dayKey, dayLabel, daysBetween, formatClock, formatDateTime, formatShortDate } from './format';
import { isOptimistic } from './messages';

/**
 * Future leads, the clock and the note; the waiting list
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md): the words of the screen and its small
 * decisions, kept out of the components so they can be read — and tested — on
 * their own.
 *
 * Nothing here decides who is a future lead, when a conversation is "open" or
 * whether a place was freed: all of that is the server's. This file reads what
 * it sent, tolerantly — a server built before any of it sends none of it, and
 * the screen then shows what it showed before.
 */

// ---------------------------------------------------------------------------
// Does the server know any of this?
// ---------------------------------------------------------------------------

/**
 * The server sends `chat.open`: it knows the ✓, the clock and the note. Without
 * the field none of the three is offered (the contract's own rule).
 */
export function knowsFutureLeads(contact: { chat?: { open?: unknown } | null } | null | undefined): boolean {
  return typeof contact?.chat?.open === 'boolean';
}

/** The server counts "פתוחות": the two new boxes exist. Null until the first count is in hand — not known yet. */
export function knowsFutureBoxes(counts: Partial<WahubBoxCounts> | null | undefined): boolean | null {
  if (!counts) return null;
  return typeof counts.open === 'number';
}

// ---------------------------------------------------------------------------
// Reading what the server sent
// ---------------------------------------------------------------------------

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** A moment, kept only when it can be read as one. */
function time(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** `future` on a contact or a lead. Null for "none" — and for anything that has no day to it. */
export function readFuture(raw: unknown): WahubFuture | null {
  const data = record(raw);
  if (!data) return null;
  const due = str(data.due).slice(0, 10);
  if (!DATE_ONLY.test(due)) return null;
  const state: WahubFutureState = data.state === 'due' || data.state === 'wrote' ? data.state : 'parked';
  const daysLeft = Number(data.days_left);
  return {
    due,
    reason: str(data.reason),
    by_name: str(data.by_name),
    at: time(data.at),
    state,
    label: str(data.label) || FUTURE_LABEL,
    days_left: Number.isFinite(daysLeft) ? Math.trunc(daysLeft) : 0,
    // Only a plain "no" is a warning: a server that leaves the field out is not saying the bot answers.
    muted: data.muted !== false,
  };
}

/** `waiting_list` on a contact or a lead. Null for "none", and for an entry that names no lesson. */
export function readWaitingMark(raw: unknown): WahubWaitingMark | null {
  const data = record(raw);
  if (!data) return null;
  const status = data.status === 'freed' ? 'freed' : data.status === 'waiting' ? 'waiting' : null;
  if (!status) return null;
  const label = str(data.label) || [str(data.course), str(data.day), str(data.start), str(data.branch)].filter(Boolean).join(' · ');
  const title = str(data.title) || (label ? `${status === 'freed' ? 'התפנה מקום: ' : 'ברשימת המתנה: '}${label}` : '');
  if (!title) return null;
  const more = Number(data.more);
  return {
    status,
    status_label: str(data.status_label) || WAITING_LABELS[status],
    entry_id: positiveId(data.entry_id) ?? 0,
    lesson_id: str(data.lesson_id),
    label,
    course: str(data.course),
    day: str(data.day),
    start: str(data.start),
    branch: str(data.branch),
    child: str(data.child),
    since: time(data.since),
    freed_at: time(data.freed_at),
    title,
    more: Number.isFinite(more) && more > 0 ? Math.floor(more) : 0,
  };
}

export function readNote(raw: unknown): WahubNote | null {
  const data = record(raw);
  const id = positiveId(data?.id);
  const text = str(data?.text);
  const createdAt = time(data?.created_at);
  if (!data || id == null || !text || !createdAt) return null;
  return { id, text, by_name: str(data.by_name), created_at: createdAt };
}

/** A list of notes, newest first. Undefined when the server sent no list at all — it does not know notes. */
export function readNotes(raw: unknown): WahubNote[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map(readNote)
    .filter((note): note is WahubNote => note !== null)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
}

/** One entry of the waiting list (ד.4): the lesson is read from `lesson.label`, or from the mark's flat fields. */
export function readWaitingEntry(raw: unknown): WahubWaitingEntry | null {
  const data = record(raw);
  const id = positiveId(data?.id ?? data?.entry_id);
  if (!data || id == null) return null;
  const lesson = record(data.lesson) ?? {};
  const lessonLabel =
    str(lesson.label) ||
    str(data.label) ||
    [str(lesson.course ?? data.course), str(lesson.day ?? data.day), str(lesson.start ?? data.start), str(lesson.branch ?? data.branch)]
      .filter(Boolean)
      .join(' · ');
  const status = str(data.status);
  const position = Number(data.position);
  return {
    id,
    status,
    status_label: str(data.status_label) || ENTRY_LABELS[status] || status,
    lesson_label: lessonLabel,
    child: str(data.child),
    added_by: data.added_by === 'bot' || data.added_by === 'person' ? data.added_by : '',
    added_by_name: str(data.added_by_name),
    created_at: time(data.created_at ?? data.since),
    freed_at: time(data.freed_at),
    closed_at: time(data.closed_at),
    closed_by_name: str(data.closed_by_name),
    closed_reason: str(data.closed_reason),
    position: Number.isFinite(position) && position > 0 ? Math.floor(position) : null,
    title: str(data.title),
  };
}

export function readWaitingEntries(raw: unknown): WahubWaitingEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(readWaitingEntry).filter((entry): entry is WahubWaitingEntry => entry !== null);
}

/** What the bot understood (ג.4). An answer without a sentence is read as "found no step", in the screen's own words. */
export function readUnderstood(raw: unknown): WahubUnderstood {
  const data = record(raw) ?? {};
  const next = record(data.next);
  const text = str(data.text);
  return {
    ok: data.ok === true && Boolean(text),
    text: text || 'הבוט לא מצא בשיחה מתי ועל מה לחזור.',
    why: str(data.why),
    stage: str(data.stage),
    stage_label: str(data.stage_label),
    come_back_on: time(data.come_back_on),
    next_when: time(next?.when),
    source: data.source === 'ai' || data.source === 'rules' ? data.source : '',
    sending_enabled: typeof data.sending_enabled === 'boolean' ? data.sending_enabled : null,
  };
}

/** `mute` of POST future/. Saved either way; only a plain "no" means the bot still answers. */
export function readMute(raw: unknown): { muted: boolean; detail: string } {
  const data = record(raw);
  return { muted: data?.muted !== false, detail: str(data?.detail) };
}

/** A contact as an action answers with it — bare, or under `contact`. Null when the answer carries none. */
export function readActionContact(raw: unknown): WahubContact | null {
  const data = record(raw);
  if (!data) return null;
  const inner = record(data.contact) ?? data;
  return typeof inner.id === 'number' && record(inner.chat) ? (inner as unknown as WahubContact) : null;
}

export function futureOf(holder: { future?: unknown } | null | undefined): WahubFuture | null {
  return readFuture(holder?.future);
}

export function waitingOf(holder: { waiting_list?: unknown } | null | undefined): WahubWaitingMark | null {
  return readWaitingMark(holder?.waiting_list);
}

// ---------------------------------------------------------------------------
// "ליד עתידי" — the chip
// ---------------------------------------------------------------------------

export const FUTURE_LABEL = 'ליד עתידי';

/**
 * Where a future lead stands right now. The server works it out against
 * today's date on every read; a screen left open over midnight still holds
 * yesterday's answer, so a parked lead whose day has come is read as due.
 */
export function futureStateNow(future: Pick<WahubFuture, 'state' | 'due'>, today: string): WahubFutureState {
  if (future.state === 'parked' && DATE_ONLY.test(today) && daysBetween(today, future.due) <= 0) return 'due';
  return future.state;
}

export interface FutureChip {
  state: WahubFutureState;
  /** Its day has come, or the customer wrote before it: it stands out. Parked, it is quiet. */
  loud: boolean;
  /** "ליד עתידי" */
  label: string;
  /** "1.12" while it waits; "הגיע היום" / "הגיע ב-10.10" once its day came; "הלקוח כתב · נקבע ל-1.12". */
  when: string;
  /** The same, as short as a row of a list needs it: "1.12" / "הגיע היום" / "הלקוח כתב". */
  short: string;
  reason: string;
  /** Whose lead it is. */
  by: string;
  /** All of it in one line: "ליד עתידי · 1.12 · הילד יהיה בן 3 · מיכל כהן". */
  line: string;
}

/** The chip at the head of a conversation and on its row: the mark, the day, the reason, and whose it is. */
export function futureChip(future: WahubFuture, today: string, now: Date): FutureChip {
  const state = futureStateNow(future, today);
  const date = formatShortDate(future.due, now);
  const days = DATE_ONLY.test(today) ? daysBetween(today, future.due) : future.days_left;
  let when = date;
  let short = date;
  if (state === 'due') {
    when = days >= 0 ? 'הגיע היום' : `הגיע ב-${date}`;
    short = when;
  } else if (state === 'wrote') {
    when = `הלקוח כתב · נקבע ל-${date}`;
    short = 'הלקוח כתב';
  }
  const label = future.label || FUTURE_LABEL;
  return {
    state,
    loud: state !== 'parked',
    label,
    when,
    short,
    reason: future.reason,
    by: future.by_name,
    line: [label, when, future.reason, future.by_name].filter(Boolean).join(' · '),
  };
}

/** Said beside a future lead the bot was not silenced for (ג.1, `muted: false`). */
export const BOT_STILL_ANSWERS = 'הבוט עדיין עונה ללקוח הזה אם יכתוב';

/** The line after a save that could not silence the bot (ג.5): saved — and why the bot still answers. */
export function notMutedText(detail: string): string {
  const why = detail.trim().replace(/[.:\s]+$/u, '');
  return why ? `נשמר. ${BOT_STILL_ANSWERS}: ${why}.` : `נשמר. ${BOT_STILL_ANSWERS}.`;
}

// ---------------------------------------------------------------------------
// "ליד עתידי שלי" — a day and a reason, and nothing else
// ---------------------------------------------------------------------------

export const FUTURE_REASON_MAX = 300;

function iso(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return iso(year, month, day + days);
}

/** The same day of a later month; a day the month does not have (31.1 → February) lands on its last one. */
export function addMonthsKey(key: string, months: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(day, last));
}

export interface FutureShortcut {
  key: 'tomorrow' | 'week' | 'month' | 'two_months';
  label: string;
  date: string;
}

/** The four days a press away: tomorrow, in a week, in a month, in two months — counted from today in Israel. */
export function futureShortcuts(today: string): FutureShortcut[] {
  return [
    { key: 'tomorrow', label: 'מחר', date: addDaysKey(today, 1) },
    { key: 'week', label: 'בעוד שבוע', date: addDaysKey(today, 7) },
    { key: 'month', label: 'בעוד חודש', date: addMonthsKey(today, 1) },
    { key: 'two_months', label: 'בעוד חודשיים', date: addMonthsKey(today, 2) },
  ];
}

/** The first day that can be chosen: tomorrow (the server refuses today and anything behind it). */
export function futureMinDate(today: string): string {
  return addDaysKey(today, 1);
}

/** A real date, after today. */
export function isFutureDate(value: string, today: string): boolean {
  if (!DATE_ONLY.test(value) || !DATE_ONLY.test(today)) return false;
  // A day the calendar does not have ("2026-02-31") is not a date, whatever the pattern says.
  if (iso(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10))) !== value) return false;
  return daysBetween(today, value) >= 1;
}

/**
 * Why the form cannot be saved yet, in a sentence — or '' when it can. A first
 * mark needs its reason; putting an existing one off does not (the reason that
 * was there stays).
 */
export function futureFormProblem(form: { due: string; reason: string }, today: string, postponing: boolean): string {
  if (!form.due) return 'בחרו תאריך';
  if (!isFutureDate(form.due, today)) return 'המועד צריך להיות אחרי היום';
  if (!postponing && !form.reason.trim()) return 'כתבו בכמה מילים למה — כדי שיהיה קל לזכור';
  if (form.reason.trim().length > FUTURE_REASON_MAX) return `הסיבה ארוכה מדי (עד ${FUTURE_REASON_MAX} תווים)`;
  return '';
}

// ---------------------------------------------------------------------------
// The clock's bubble: where it stands
// ---------------------------------------------------------------------------

/**
 * What the clock's bubble shows. It opens on the two choices; "הבוט ימשיך
 * לטפל" reads the conversation (up to half a minute) and then says what it
 * understood; "ליד עתידי שלי" is the form, and — only when the bot could not be
 * silenced — the line that says so.
 */
export type LaterStep =
  | { step: 'menu' }
  | { step: 'reading' }
  | { step: 'understood'; understood: WahubUnderstood }
  /** The hand-over was refused, or its outcome is not known. */
  | { step: 'failed'; text: string }
  | { step: 'form'; saving: boolean; error: string }
  | { step: 'saved'; text: string };

export const LATER_FORM: LaterStep = { step: 'form', saving: false, error: '' };

/** How handing the conversation to the bot ended: what it understood, or why it did not happen. */
export type HandToBotOutcome = { understood: WahubUnderstood } | { error: string };

/** How "ליד עתידי שלי" ended: saved (with whether the bot is silenced), or why it was not. */
export type FutureOutcome = { muted: boolean; detail: string } | { error: string };

export function laterAfterHandToBot(outcome: HandToBotOutcome): LaterStep {
  return 'error' in outcome ? { step: 'failed', text: outcome.error } : { step: 'understood', understood: outcome.understood };
}

/** Saved and silenced: the bubble closes (null) — the chip at the head of the conversation says it. */
export function laterAfterFuture(outcome: FutureOutcome): LaterStep | null {
  if ('error' in outcome) return { step: 'form', saving: false, error: outcome.error };
  return outcome.muted ? null : { step: 'saved', text: notMutedText(outcome.detail) };
}

/** Said under what the bot understood when nothing can go out yet (`sending_enabled: false`). */
export const SENDING_OFF_NOTE = 'השליחה ללקוחות כבויה — ההודעה תחכה עד שתודלק.';

// ---------------------------------------------------------------------------
// "רשימת המתנה" — the chip
// ---------------------------------------------------------------------------

const WAITING_LABELS: Record<'waiting' | 'freed', string> = { waiting: 'ברשימת המתנה', freed: 'התפנה מקום' };

const ENTRY_LABELS: Record<string, string> = { ...WAITING_LABELS, handled: 'טופל', removed: 'הוסר' };

export interface WaitingChip {
  /** A place was freed: it stands out. Still waiting, it is quiet. */
  loud: boolean;
  /** The server's own title: "ברשימת המתנה: …" / "התפנה מקום ב…". */
  text: string;
  /** "ועוד 2" — further active entries; '' when this is the only one. */
  more: string;
}

export function waitingChip(mark: WahubWaitingMark): WaitingChip {
  return { loud: mark.status === 'freed', text: mark.title, more: mark.more > 0 ? `ועוד ${mark.more}` : '' };
}

/** "נכנס ב-13.10" — when they joined the list. '' when the server did not say. */
export function waitingSinceText(since: string | null | undefined, now: Date): string {
  const date = formatShortDate(since ?? '', now);
  return date ? `נכנס ב-${date}` : '';
}

/**
 * The mark a row carries, as an entry — so a lead's details can show its lesson at once, from the row that was
 * pressed, before the full list of its entries has been read.
 */
export function entryOfMark(mark: WahubWaitingMark): WahubWaitingEntry {
  return {
    id: mark.entry_id,
    status: mark.status,
    status_label: mark.status_label,
    lesson_label: mark.label,
    child: mark.child,
    added_by: '',
    added_by_name: '',
    created_at: mark.since,
    freed_at: mark.freed_at,
    closed_at: null,
    closed_by_name: '',
    closed_reason: '',
    position: null,
    title: mark.title,
  };
}

/** An entry that still stands: waiting, or with a place freed. */
export function isActiveEntry(entry: Pick<WahubWaitingEntry, 'status'>): boolean {
  return entry.status === 'waiting' || entry.status === 'freed';
}

/**
 * The entries in the order they are read: what calls for the office first — a
 * place that was freed — then whoever still waits, and what was closed last.
 * Within each, the server's own order (the newest first) is kept.
 */
export function sortEntries<T extends Pick<WahubWaitingEntry, 'status'>>(entries: ReadonlyArray<T>): T[] {
  const rank = (entry: T) => (entry.status === 'freed' ? 0 : entry.status === 'waiting' ? 1 : 2);
  return entries.map((entry, index) => ({ entry, index })).sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index).map((item) => item.entry);
}

/** One entry as a line of small facts: where it stands, since when, the child, the place in line, how it ended. */
export function waitingEntryFacts(entry: WahubWaitingEntry, now: Date): string[] {
  const active = isActiveEntry(entry);
  const closed = entry.closed_at ? formatShortDate(entry.closed_at, now) : '';
  return [
    entry.status_label,
    waitingSinceText(entry.created_at, now),
    entry.child,
    active && entry.position ? `מקום ${entry.position} בתור` : '',
    !active && entry.closed_reason ? entry.closed_reason : '',
    !active && closed ? `נסגר ב-${closed}` : '',
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// "פתק" — a note is a line of the log, never a message
// ---------------------------------------------------------------------------

export const NOTE_MAX = 500;

/** Said wherever a note is written or shown, so it is never taken for a message. */
export const NOTE_NOT_SENT = 'פתק פנימי – לא נשלח ללקוח';

/** "פתק · מיכל כהן · 09:20" — inside the conversation, under its day. */
export function noteHeading(note: Pick<WahubNote, 'by_name' | 'created_at'>): string {
  return ['פתק', note.by_name, formatClock(note.created_at)].filter(Boolean).join(' · ');
}

/** "מיכל כהן · 13.10 09:20" — in a list of notes, where there is no day above it. */
export function noteByLine(note: Pick<WahubNote, 'by_name' | 'created_at'>, now: Date): string {
  return [note.by_name, formatDateTime(note.created_at, now)].filter(Boolean).join(' · ');
}

/** A note that was just saved, put at the head of the list — once, whatever a re-read already brought. */
export function withNote(notes: ReadonlyArray<WahubNote> | undefined, note: WahubNote): WahubNote[] {
  return [note, ...(notes ?? []).filter((held) => held.id !== note.id)];
}

export type ThreadItem =
  | { kind: 'message'; key: string; message: WahubMessage }
  | { kind: 'note'; key: string; note: WahubNote };

export interface ThreadDay {
  /** YYYY-MM-DD in Israel time. */
  key: string;
  /** "היום", "אתמול", or the full date. */
  label: string;
  items: ThreadItem[];
}

function ms(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * The conversation cut into days, with each note standing where it was written
 * — between the messages before it and the ones after. The messages keep the
 * order they came in (what is still being sent is always last); a note written
 * before the earliest message on screen, while earlier messages are still to be
 * loaded, waits for them rather than standing at the top out of its place.
 */
export function threadDays(
  messages: ReadonlyArray<WahubMessage>,
  notes: ReadonlyArray<WahubNote> | undefined,
  now: Date,
  hasOlder = false,
): ThreadDay[] {
  const kept = messages.filter((message) => !isOptimistic(message));
  const pending = messages.filter(isOptimistic);
  const earliest = kept.length ? ms(kept[0].sent_at) : null;
  const queue = [...(notes ?? [])]
    .filter((note) => !(hasOlder && earliest !== null && ms(note.created_at) < earliest))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id - b.id);

  const items: Array<{ at: string; item: ThreadItem }> = [];
  const note = (held: WahubNote) => items.push({ at: held.created_at, item: { kind: 'note', key: `note-${held.id}`, note: held } });
  const message = (held: WahubMessage) => items.push({ at: held.sent_at, item: { kind: 'message', key: `message-${held.id}`, message: held } });
  for (const held of kept) {
    while (queue.length && ms(queue[0].created_at) < ms(held.sent_at)) note(queue.shift() as WahubNote);
    message(held);
  }
  queue.forEach(note);
  pending.forEach(message);

  const days: ThreadDay[] = [];
  for (const { at, item } of items) {
    const key = dayKey(at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(at, now), items: [item] });
  }
  return days;
}
