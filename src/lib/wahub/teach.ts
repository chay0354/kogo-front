import type {
  WahubTeachChange,
  WahubTeachChangeStatus,
  WahubTeachCheck,
  WahubTeachCheckDetail,
  WahubTeachConflict,
  WahubTeachOrigin,
  WahubTeachPage,
  WahubTeachPlain,
  WahubTeachPreview,
  WahubTeachQuote,
  WahubTeachRow,
  WahubTeachState,
  WahubTeachSummary,
  WahubTeachThread,
} from '@/types/wahubTeach';
import { plainOfChange, type PlainChange } from './plain';
import { readRefineChange } from './refine';

/**
 * "ללמד את הבוט" (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, א–ב).
 *
 * The owner writes freely what he wants the bot to know; the bot says what it
 * understood and what would change, and nothing changes until he approves.
 * Everything the screen decides by itself is here, and nothing here talks to
 * the server: how an answer is read, what the card asks of him, how the line
 * of the check is worded, and when the screen stops asking for a part that
 * does not come.
 */

/** The server's own limit on an explanation. */
export const TEACH_MAX_LENGTH = 4000;

/** Every sentence the screen says by itself, in one place. */
export const TEACH_TEXT = {
  title: 'מה תרצה להסביר לבוט?',
  lead: 'כתוב במילים שלך, כמו שהיית מסביר לנציג חדש. הבוט יגיד מה הבין ומה ישתנה — ושום דבר לא משתנה בלי האישור שלך.',
  example: 'למשל: כששואלים על מחיר, קודם לשאול על איזה חוג',
  send: 'שלח לבוט',
  keys: 'Enter שולח · Shift+Enter שורה חדשה',
  wrote: 'כתבת',
  thinking: 'הבוט חושב',
  thinkingLonger: 'עוד רגע — הוא קורא גם את מה שהוא כבר יודע',
  thinkingLongest: 'זה לוקח עד דקה. אפשר להשאיר את המסך פתוח',
  understood: 'הבנתי כך',
  changes: 'מה ישתנה',
  example_title: 'דוגמה',
  asks: 'לקוח שואל',
  today: 'היום הבוט עונה',
  after: 'אחרי השינוי',
  nowAnswers: 'עכשיו הבוט עונה',
  heed: 'שים לב — זה שונה ממה שהבוט יודע היום',
  question: 'לפני שאני משנה משהו, שאלה אחת',
  answerHere: 'התשובה שלך',
  approve: 'מאשר',
  notQuite: 'לא בדיוק',
  whatToFix: 'מה לתקן?',
  sendFix: 'שלח תיקון',
  sendAnswer: 'שלח תשובה',
  cancel: 'ביטול',
  close: 'סגור',
  closeHint: 'סגור — מה שמחכה לאישור נשאר ברשימה למטה',
  nothingYet: 'שום דבר עוד לא השתנה — זה מחכה לאישור שלך',
  saving: 'שומר…',
  saved: 'נשמר',
  savedLine: 'הבוט כבר עונה לפי זה',
  undone: 'בוטל',
  undoneLine: 'הבוט חזר לענות כמו לפני',
  nothing: 'לא שונה דבר',
  undoChange: 'בטל את השינוי',
  undo: 'בטל',
  undoAsk: 'לבטל את מה שלימדת כאן? הבוט יחזור לענות כמו לפני.',
  undoAskWaiting: 'להוריד את ההצעה הזאת? שום דבר עוד לא השתנה.',
  keep: 'השאר',
  historyTitle: 'מה לימדת עד היום',
  historyEmpty: 'עוד לא לימדת את הבוט דבר. מה שתלמד יופיע כאן, ותמיד אפשר יהיה לבטל.',
  more: 'הצג עוד',
  technical: 'פרטים טכניים',
  // "דיוק" inside a conversation is the same teaching, born of marked messages (owner, 13.10.2026).
  quotes: 'על מה זה נכתב',
  toConversation: 'לשיחה',
  summaryMark: 'סיכום חכם',
  whatWasWrong: 'מה לא היה טוב כאן?',
  summarizing: 'קורא את מה שסומן',
  startFailed: 'לא הצלחתי לפתוח את הדיוק. אפשר לנסות שוב',
  startUnknown: 'לא הגיעה תשובה, אז אני לא יודע אם הדיוק נפתח. אפשר לנסות שוב',
  writeFirst: 'מה לא היה טוב בתשובה הזאת?',
  earlier: 'מה נלמד מהשיחה הזאת',
  checkRunning: 'בודק שהבוט באמת עונה כך',
  checkDetails: 'מה נבדק',
  asked: 'שאלתי',
  botAnswered: 'הבוט ענה',
  exampleMissing: 'לא הצלחתי להכין דוגמה כרגע',
  exampleStalled: 'הדוגמה לא הגיעה. אפשר לאשר גם בלעדיה',
  failed: 'לא הצלחתי לשלוח את זה. מה שכתבת נשאר בתיבה — אפשר לנסות שוב',
  unknown: 'לא הגיעה תשובה, אז אני לא יודע אם זה נקלט. מה שכתבת נשאר בתיבה; כדאי להציץ ברשימה למטה לפני ששולחים שוב',
  sayFailed: 'לא הצלחתי לשלוח את זה. מה שכתבת נשאר כאן — אפשר לנסות שוב',
  sayUnknown: 'לא הגיעה תשובה, אז אני לא יודע אם זה נקלט. מה שכתבת נשאר כאן',
  approveFailed: 'לא הצלחתי לשמור כרגע, ושום דבר לא השתנה. אפשר לנסות שוב',
  undoFailed: 'לא הצלחתי לבטל כרגע, ושום דבר לא זז. אפשר לנסות שוב',
  openFailed: 'לא הצלחתי לפתוח את זה כרגע',
  listFailed: 'לא הצלחתי לטעון את מה שלימדת',
  notBuiltTitle: 'המסך הזה ייפתח אחרי העדכון הבא של המערכת',
  notBuiltText: 'כאן תוכל להסביר לבוט דברים במילים שלך, והוא יבקש רק אישור. אין מה לעשות בינתיים — זה ייפתח לבד.',
} as const;

// ---------------------------------------------------------------------------
// Reading the server's answers
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function asId(value: unknown): number | null {
  const id = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asTextOrNull(value: unknown): string | null {
  return asText(value) || null;
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function asTexts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}

const STATES: WahubTeachState[] = ['waiting', 'applied', 'undone', 'nothing'];
const CHANGE_STATUSES: WahubTeachChangeStatus[] = ['pending', 'applied', 'undone', 'rejected'];

const STATE_LABEL: Record<WahubTeachState, string> = {
  waiting: 'מחכה לאישור שלך',
  applied: TEACH_TEXT.saved,
  undone: TEACH_TEXT.undone,
  nothing: TEACH_TEXT.nothing,
};

function readPlain(raw: unknown): WahubTeachPlain {
  const data = asRecord(raw) ?? {};
  return {
    headline: asText(data.headline),
    rule: asText(data.rule),
    why: asText(data.why),
    is_new: data.is_new === true,
    before: asTextOrNull(data.before),
    after: asTextOrNull(data.after),
    example_good: asText(data.example_good),
    example_bad: asText(data.example_bad),
  };
}

export function readTeachChange(raw: unknown): WahubTeachChange | null {
  const data = asRecord(raw);
  if (!data) return null;
  const status = CHANGE_STATUSES.includes(data.status as WahubTeachChangeStatus)
    ? (data.status as WahubTeachChangeStatus)
    : data.applied === true
      ? 'applied'
      : 'pending';
  return {
    proposal_id: asId(data.proposal_id),
    status,
    status_label: asText(data.status_label),
    applied: status === 'applied',
    can_undo: data.can_undo === true,
    moved: data.moved === true,
    plain: readPlain(data.plain),
    technical: asRecord(data.technical),
  };
}

/** The example. Null when there is none — no key, no change, or the bot gave no question. */
export function readTeachPreview(raw: unknown): WahubTeachPreview | null {
  const data = asRecord(raw);
  const question = asText(data?.question);
  if (!data || !question) return null;
  return {
    question,
    before: asTextOrNull(data.before),
    after: asTextOrNull(data.after),
    pending: data.pending === true,
    note: asText(data.note),
  };
}

function readCheckDetail(raw: unknown): WahubTeachCheckDetail | null {
  const data = asRecord(raw);
  if (!data) return null;
  return { question: asText(data.question), answer: asTextOrNull(data.answer), passed: data.passed === true, line: asText(data.line) };
}

export function readTeachCheck(raw: unknown): WahubTeachCheck | null {
  const data = asRecord(raw);
  if (!data) return null;
  const ran = asCount(data.ran);
  return {
    ran,
    passed: Math.min(ran, asCount(data.passed)),
    pending: data.pending === true,
    lines: asTexts(data.lines),
    summary: asText(data.summary),
    details: Array.isArray(data.details)
      ? data.details.map(readCheckDetail).filter((row): row is WahubTeachCheckDetail => row !== null)
      : [],
    technical: asRecord(data.technical),
  };
}

function readConflicts(raw: unknown): WahubTeachConflict[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const data = asRecord(entry);
      return data ? { title: asText(data.title), why: asText(data.why) } : null;
    })
    .filter((entry): entry is WahubTeachConflict => entry !== null && Boolean(entry.title || entry.why));
}

/**
 * Where a thread was born (ח.4.2). A thread that was written freely has no origin worth a word: null. The link is
 * kept only when it stays inside the section.
 */
export function readTeachOrigin(raw: unknown): WahubTeachOrigin | null {
  const data = asRecord(raw);
  const kind = data?.kind === 'conversation' || data?.kind === 'shadow' || data?.kind === 'unknown' ? data.kind : null;
  if (!data || !kind) return null;
  // A thread opened on a topic of "מה הבוט לא ידע השבוע" (ט.3.4): no conversation stands behind it, so it has
  // no way "to the conversation" — the topics are at the head of this very screen.
  if (kind === 'unknown') {
    return { kind, label: asText(data.label) || 'מתוך מה שהבוט לא ידע', contact_id: null, link: null, topic_id: asId(data.topic_id) };
  }
  const link = asText(data.link);
  return {
    kind,
    label: asText(data.label) || (kind === 'shadow' ? 'על תשובה של הבוט בצל' : 'מתוך שיחה'),
    contact_id: asId(data.contact_id),
    link: /^\/wahub(?:\?|$)/.test(link) ? link : null,
  };
}

function readQuotes(raw: unknown): WahubTeachQuote[] {
  const context = asRecord(raw);
  if (!context || !Array.isArray(context.quotes)) return [];
  return context.quotes
    .map((entry) => {
      const data = asRecord(entry);
      const text = asText(data?.text);
      return data && text ? { id: asId(data.id), who: asText(data.who), who_label: asText(data.who_label), text } : null;
    })
    .filter((quote): quote is WahubTeachQuote => quote !== null)
    .slice(0, 8);
}

function readSummary(raw: unknown): WahubTeachSummary | null {
  const data = asRecord(raw);
  if (!data) return null;
  const happened = asText(data.what_happened);
  const answered = asText(data.what_was_answered);
  const issue = asText(data.suspected_issue);
  return happened || answered || issue ? { what_happened: happened, what_was_answered: answered, suspected_issue: issue || null } : null;
}

/**
 * A teach thread. Null for anything else — and a thread of "דיוק" is something
 * else: an older server answers POST refine/ in that shape, without `mode`.
 */
export function readTeachThread(raw: unknown): WahubTeachThread | null {
  const data = asRecord(raw);
  if (!data || data.mode !== 'teach') return null;
  const id = asId(data.thread) ?? asId(data.id);
  if (id == null) return null;
  const state = STATES.includes(data.state as WahubTeachState) ? (data.state as WahubTeachState) : 'nothing';
  const changes = Array.isArray(data.changes)
    ? data.changes.map(readTeachChange).filter((change): change is WahubTeachChange => change !== null)
    : [];
  const needsAnswer = data.needs_answer === true;
  const technical = asRecord(data.technical) ?? {};
  const origin = readTeachOrigin(data.origin);
  const quotes = readQuotes(data.context);
  const summary = readSummary(data.summary);
  return {
    ...(origin ? { origin } : {}),
    ...(quotes.length ? { quotes } : {}),
    ...(summary ? { summary } : {}),
    id,
    status: data.status === 'done' ? 'done' : 'open',
    state,
    state_label: asText(data.state_label) || (needsAnswer ? 'מחכה לתשובה שלך' : STATE_LABEL[state]),
    text: asText(data.text),
    understood: asText(data.understood),
    question: needsAnswer ? asTextOrNull(data.question) : null,
    changes,
    preview: readTeachPreview(data.preview),
    conflicts: readConflicts(data.conflicts),
    notes: asTexts(data.notes),
    needs_approval: data.needs_approval === true,
    needs_answer: needsAnswer,
    can_undo: data.can_undo === true,
    check: readTeachCheck(data.check),
    reply: asText(data.reply),
    created_at: asTextOrNull(data.created_at),
    created_by_name: asText(data.created_by_name),
    technical: {
      model: asTextOrNull(technical.model),
      reason: asTextOrNull(technical.reason),
      outcome: asTextOrNull(technical.outcome),
    },
  };
}

function readRow(raw: unknown): WahubTeachRow | null {
  const data = asRecord(raw);
  const thread = asId(data?.thread) ?? asId(data?.id);
  if (!data || thread == null) return null;
  const state = STATES.includes(data.state as WahubTeachState) ? (data.state as WahubTeachState) : 'nothing';
  const needsAnswer = data.needs_answer === true;
  const text = asText(data.text);
  const origin = readTeachOrigin(data.origin);
  return {
    ...(origin ? { origin } : {}),
    thread,
    at: asTextOrNull(data.at),
    by: asText(data.by),
    understood: asText(data.understood) || text,
    text,
    state,
    state_label: asText(data.state_label) || (needsAnswer ? 'מחכה לתשובה שלך' : STATE_LABEL[state]),
    needs_answer: needsAnswer,
    changes_count: asCount(data.changes_count),
  };
}

/**
 * "מה לימדת עד היום", one page of it. Null when the answer is not a page:
 * a server built before "ללמד" ignores `mode=teach` and answers the plain list
 * of "דיוק" threads — which is how the screen knows it is not built yet.
 */
export function readTeachPage(raw: unknown): WahubTeachPage | null {
  const data = asRecord(raw);
  if (!data || !Array.isArray(data.results)) return null;
  const results = data.results.map(readRow).filter((row): row is WahubTeachRow => row !== null);
  return {
    count: Math.max(asCount(data.count), results.length),
    more: typeof data.next === 'string' ? Boolean(data.next) : data.next === true,
    results,
  };
}

/** GET refine/{id}/preview/ and GET refine/{id}/check/ answer `{thread, preview}` / `{thread, check}`. */
export function readTeachPart<T>(raw: unknown, name: 'preview' | 'check', read: (value: unknown) => T | null): T | null {
  const data = asRecord(raw);
  return data ? read(data[name]) : null;
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export type TeachStands = 'waiting' | 'applied' | 'undone' | 'rejected';

export function teachStands(change: Pick<WahubTeachChange, 'status'>): TeachStands {
  if (change.status === 'applied') return 'applied';
  if (change.status === 'undone') return 'undone';
  return change.status === 'rejected' ? 'rejected' : 'waiting';
}

/**
 * A change of a teach thread, for the section's one readable card (PlainCard).
 * What a person reads is the server's own wording (`plain`); the code names of
 * `technical` reach only the folded "פרטים טכניים". The reason is not said on
 * each change: his own words stand at the top of the card.
 */
export function plainOfTeachChange(change: WahubTeachChange): PlainChange {
  const technical = change.technical ?? {};
  const filed = readRefineChange({
    ...technical,
    proposal_id: change.proposal_id,
    applied: change.applied,
    plain: { kind_label: technical.kind_label, when_label: technical.when_label },
  });
  const tech = filed ? plainOfChange(filed).tech.slice() : [];
  // The item's key is sent beside the fields, not among them: it belongs with the other code names.
  const key = asText(technical.key);
  if (key && !tech.some((row) => row.key === 'key')) {
    const afterKind = tech.findIndex((row) => row.key === 'kind') + 1;
    tech.splice(afterKind, 0, { key: 'key', label: 'מפתח', value: '', code: key });
  }
  const { plain } = change;
  // "היה" above "יהיה" only when both are there: a new thing has no "היה", and one that is switched off has no "יהיה".
  const swap = !plain.is_new && plain.before && plain.after && plain.before !== plain.after;
  return {
    headline: plain.headline || 'מעכשיו הבוט יפעל לפי מה שהסברת',
    why: '',
    action: filed?.action ?? (plain.is_new ? 'create' : 'update'),
    isNew: plain.is_new,
    rule: plain.rule || plain.after || '',
    rows: swap ? [{ key: 'text', label: '', before: plain.before as string, after: plain.after as string }] : [],
    exampleBad: plain.example_bad,
    exampleGood: plain.example_good,
    tech,
  };
}

/**
 * What the card asks of him now:
 * - `answer`: the bot asked one question instead of guessing; nothing is proposed.
 * - `approve`: a change waits for "מאשר" / "לא בדיוק".
 * - `stuck`: a change waits but cannot be approved as it is (what it touches was edited since) — only "לא בדיוק".
 * - `saved`, `undone`, `nothing`: nothing is asked.
 */
export type TeachAsk = 'answer' | 'approve' | 'stuck' | 'saved' | 'undone' | 'nothing';

export function teachAsk(thread: Pick<WahubTeachThread, 'state' | 'needs_answer' | 'needs_approval'>): TeachAsk {
  if (thread.needs_answer) return 'answer';
  if (thread.state === 'waiting') return thread.needs_approval ? 'approve' : 'stuck';
  if (thread.state === 'applied') return 'saved';
  return thread.state === 'undone' ? 'undone' : 'nothing';
}

/** The card still waits for him: the big box steps aside, so there is one place to write at a time. */
export function teachWaitsForHim(thread: Pick<WahubTeachThread, 'state' | 'needs_answer' | 'needs_approval'> | null | undefined): boolean {
  if (!thread) return false;
  const ask = teachAsk(thread);
  return ask === 'answer' || ask === 'approve' || ask === 'stuck';
}

/**
 * What a thread that was taken back says. A change that had been kept went
 * back to what it was; one that only waited was simply dropped.
 */
export function undoneLine(thread: Pick<WahubTeachThread, 'reply'>): string {
  return thread.reply || `${TEACH_TEXT.undone} — ${TEACH_TEXT.undoneLine}`;
}

/** "מחיר — היום כתוב שם שעונים מחיר מיד" */
export function conflictLine(conflict: WahubTeachConflict): string {
  if (conflict.title && conflict.why) return `${conflict.title} — ${conflict.why}`;
  return conflict.title || conflict.why;
}

// ---------------------------------------------------------------------------
// The example
// ---------------------------------------------------------------------------

export type ExamplePart = { state: 'ready'; text: string } | { state: 'coming' } | { state: 'missing' };

export interface ExampleView {
  question: string;
  /** "היום הבוט עונה". Left out once the change is kept and nobody asked the bot of before. */
  before: ExamplePart;
  after: ExamplePart;
  /** The heading over the second answer: "אחרי השינוי", or "עכשיו הבוט עונה" once it is kept. */
  afterLabel: string;
  /** A sentence under the example, when a part of it will not come. */
  note: string;
}

/**
 * The example as the screen draws it. A part that has not arrived is "coming"
 * while the server is still making it (three dots in its bubble), and
 * "missing" once it gave up — or once the screen stopped asking (`stalled`).
 */
export function exampleView(
  preview: WahubTeachPreview | null,
  options: { applied?: boolean; stalled?: boolean } = {},
): ExampleView | null {
  if (!preview) return null;
  const waiting = preview.pending && !options.stalled;
  const part = (text: string | null): ExamplePart => (text ? { state: 'ready', text } : waiting ? { state: 'coming' } : { state: 'missing' });
  const before = part(preview.before);
  const after = part(preview.after);
  // Nothing at all came and nothing will: there is no example to show, only the sentence.
  let note = preview.note;
  if (!note && !waiting && (before.state === 'missing' || after.state === 'missing')) {
    note = options.stalled && preview.pending ? TEACH_TEXT.exampleStalled : before.state === 'missing' && after.state === 'missing' ? TEACH_TEXT.exampleMissing : '';
  }
  return { question: preview.question, before, after, afterLabel: options.applied ? TEACH_TEXT.nowAnswers : TEACH_TEXT.after, note };
}

// ---------------------------------------------------------------------------
// The line of the check
// ---------------------------------------------------------------------------

/** `good`: checked and right. `bad`: a conversation did not pass. `wait`: still running. `quiet`: nothing was checked. */
export type CheckTone = 'good' | 'bad' | 'wait' | 'quiet';

export interface CheckLine {
  tone: CheckTone;
  text: string;
  /** A conversation did not pass: "בטל את השינוי" is offered beside the line. */
  failed: boolean;
}

const COUNT_WORDS: Record<number, string> = { 1: 'אחת', 2: 'שתיים', 3: 'שלוש' };

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/**
 * The one line under "נשמר ✓". The server's own sentence when it sent one
 * (`summary`); otherwise worded here from the figures, the same way:
 * "בדקתי 3 שיחות — הבוט עונה נכון" · "אחת מתוך שלוש לא עברה" · "הבדיקה עוד רצה".
 * Null when there was no check at all.
 */
export function checkLine(check: WahubTeachCheck | null | undefined, options: { stalled?: boolean } = {}): CheckLine | null {
  if (!check) return null;
  if (check.pending) {
    if (options.stalled) return { tone: 'quiet', text: 'הבדיקה לא הסתיימה. השינוי נשמר; אפשר לבדוק במסך "בדיקות"', failed: false };
    return { tone: 'wait', text: TEACH_TEXT.checkRunning, failed: false };
  }
  const failedCount = Math.max(0, check.ran - check.passed);
  if (check.ran === 0) return { tone: 'quiet', text: check.summary || 'אין לי שיחת בדיקה שנוגעת לשינוי הזה', failed: false };
  if (failedCount === 0) {
    const text = check.summary || (check.ran === 1 ? 'בדקתי שיחה אחת — הבוט עונה נכון' : `בדקתי ${check.ran} שיחות — הבוט עונה נכון`);
    return { tone: 'good', text, failed: false };
  }
  let text = check.summary;
  if (!text) {
    const why = check.details.find((row) => !row.passed)?.line ?? '';
    const head =
      check.ran === 1
        ? 'השיחה שבדקתי לא עברה'
        : `${countWord(failedCount)} מתוך ${countWord(check.ran)} ${failedCount > 1 ? 'לא עברו' : 'לא עברה'}`;
    text = why ? `${head}: ${why}` : head;
  }
  return { tone: 'bad', text, failed: true };
}

// ---------------------------------------------------------------------------
// Waiting for the bot
// ---------------------------------------------------------------------------

/** After this long the waiting says a little more, so a long wait does not look stuck. */
export const THINKING_LONGER_MS = 8_000;
export const THINKING_LONGEST_MS = 25_000;

/** The quiet second line under "הבוט חושב". Empty at first: a quick answer needs no excuse. */
export function thinkingNote(elapsedMs: number): string {
  if (elapsedMs >= THINKING_LONGEST_MS) return TEACH_TEXT.thinkingLongest;
  return elapsedMs >= THINKING_LONGER_MS ? TEACH_TEXT.thinkingLonger : '';
}

/** A part that is made a call at a time (the example, the check): how the asking ended. */
export type PollEnd = 'settled' | 'stalled' | 'stopped';

export interface PollOptions<T> {
  /** One call. Null when the answer could not be read. */
  ask: () => Promise<T | null>;
  /** The part is not finished: ask again. */
  pending: (value: T) => boolean;
  /** Every answer that came, so the screen fills in as the parts arrive. */
  onValue: (value: T) => void;
  /** The card was closed, or another thread was opened: stop without a word. */
  alive: () => boolean;
  /** Calls with no usable answer, in a row, before the screen stops asking. */
  maxFailures?: number;
  /** A ceiling on the calls, whatever the server says: the screen never asks forever. */
  maxRounds?: number;
}

/**
 * Ask again until the part is whole. Each call makes one piece on the server
 * (an answer of the bot takes it 15–35 seconds), so there is no waiting between
 * calls. The server gives a part up after two failures of its own; the screen
 * gives up after two calls in a row that did not answer, or after `maxRounds`.
 */
export async function pollUntilSettled<T>({ ask, pending, onValue, alive, maxFailures = 2, maxRounds = 8 }: PollOptions<T>): Promise<PollEnd> {
  let failures = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    if (!alive()) return 'stopped';
    let value: T | null = null;
    try {
      value = await ask();
    } catch {
      value = null;
    }
    if (!alive()) return 'stopped';
    if (value === null) {
      failures += 1;
      if (failures >= maxFailures) return 'stalled';
      continue;
    }
    failures = 0;
    onValue(value);
    if (!pending(value)) return 'settled';
  }
  return 'stalled';
}

// ---------------------------------------------------------------------------
// "מה לימדת עד היום"
// ---------------------------------------------------------------------------

export type TeachRowTone = 'warning' | 'success' | 'muted';

/** The colour of a row's state. Amber for what waits for him — red is kept for "מבקש נציג" alone. */
export function teachRowTone(state: WahubTeachState): TeachRowTone {
  if (state === 'waiting') return 'warning';
  return state === 'applied' ? 'success' : 'muted';
}

/** "בטל" stands on a row that has something to take back: a change that waits, or one that was kept. */
export function teachRowCanUndo(row: Pick<WahubTeachRow, 'state'>): boolean {
  return row.state === 'waiting' || row.state === 'applied';
}

/** What "בטל" asks before it acts: a kept change goes back; one that only waits is dropped. */
export function undoQuestion(state: WahubTeachState): string {
  return state === 'applied' ? TEACH_TEXT.undoAsk : TEACH_TEXT.undoAskWaiting;
}

/** A thread that just changed, as its row in the list — so the list is right before it is read again. */
export function rowOfThread(thread: WahubTeachThread, previous?: WahubTeachRow): WahubTeachRow {
  const origin = thread.origin ?? previous?.origin;
  return {
    ...(origin ? { origin } : {}),
    thread: thread.id,
    at: thread.created_at ?? previous?.at ?? null,
    by: thread.created_by_name || previous?.by || '',
    understood: thread.understood || thread.text || previous?.understood || '',
    text: thread.text || previous?.text || '',
    state: thread.state,
    state_label: thread.state_label,
    needs_answer: thread.needs_answer,
    changes_count: thread.changes.length,
  };
}

/** The list with a thread's row made current: in its place when it is there, at the top when it is new. */
export function putRow(rows: ReadonlyArray<WahubTeachRow>, thread: WahubTeachThread): WahubTeachRow[] {
  const at = rows.findIndex((row) => row.thread === thread.id);
  if (at === -1) return [rowOfThread(thread), ...rows];
  const next = rows.slice();
  next[at] = rowOfThread(thread, rows[at]);
  return next;
}

/** The rows of every page read so far, each thread once. */
export function mergePages(pages: ReadonlyArray<WahubTeachPage>): WahubTeachRow[] {
  const seen = new Set<number>();
  const rows: WahubTeachRow[] = [];
  for (const page of pages) {
    for (const row of page.results) {
      if (seen.has(row.thread)) continue;
      seen.add(row.thread);
      rows.push(row);
    }
  }
  return rows;
}

/**
 * The pages of the list with a thread's row made current: in its place when
 * some page has it; at the top of the first page (and one more in the count)
 * when it is new.
 */
export function patchPages(pages: ReadonlyArray<WahubTeachPage>, thread: WahubTeachThread): WahubTeachPage[] {
  const at = pages.findIndex((page) => page.results.some((row) => row.thread === thread.id));
  if (at === -1) {
    if (!pages.length) return [];
    const [first, ...rest] = pages;
    return [{ ...first, count: first.count + 1, results: putRow(first.results, thread) }, ...rest];
  }
  return pages.map((page, index) => (index === at ? { ...page, results: putRow(page.results, thread) } : page));
}
