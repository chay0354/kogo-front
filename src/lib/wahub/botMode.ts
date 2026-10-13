import type {
  WahubBotFollowups,
  WahubBotMode,
  WahubBotModeFailure,
  WahubBotModeLogEntry,
  WahubBotModeProblem,
  WahubBotModeStopped,
  WahubBotModeToday,
} from '@/types/wahubBotMode';
import { formatDateTime } from './format';
import type { StatusLevel } from './systemStatus';

/**
 * "מי עונה ללקוחות" (docs/WAHUB-CONTRACT-GO-LIVE.md, ג) — the words of the card
 * at the top of the settings and its small decisions, kept out of the
 * components so they can be read, and tested, on their own.
 *
 * Nothing here decides whom the bot answers: that is the server's. This file
 * reads what the server sent and says it in the owner's words — "בדיקה בלבד",
 * "הבוט החדש עונה לכולם". Where the server's answer cannot be read for
 * certain, nothing is guessed: the answer is refused, and the screen says so.
 */

// ---------------------------------------------------------------------------
// Reading what the server sent
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** A moment, kept only when it can be read as one. */
function time(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

const STOPPED_WORDS = 'הבוט החדש עצר את עצמו';

function readStopped(raw: unknown): WahubBotModeStopped | null {
  const data = record(raw);
  if (!data) return null;
  const reason = str(data.reason);
  // The brake fired, whatever else is said about it: it is never read as "nothing happened".
  return { at: time(data.at), reason, text: str(data.text) || (reason ? `${STOPPED_WORDS}: ${reason}` : STOPPED_WORDS) };
}

function readFailure(raw: unknown): WahubBotModeFailure | null {
  const data = record(raw);
  const text = data ? str(data.text) : '';
  return data && text ? { at: time(data.at), kind: str(data.kind), text } : null;
}

function readToday(raw: unknown): WahubBotModeToday {
  const data = record(raw) ?? {};
  return {
    sent: count(data.sent),
    failed: count(data.failed),
    late: count(data.late),
    needs_human: count(data.needs_human),
    fallback: count(data.fallback),
    unanswered: count(data.unanswered),
  };
}

function readFollowups(raw: unknown): WahubBotFollowups {
  const data = record(raw) ?? {};
  return {
    // On is said only by a plain `true`: anything else reads as off.
    on: data.on === true,
    since: time(data.since),
    turned_on_at: time(data.turned_on_at),
    by: str(data.by),
    text: str(data.text),
    due_now: count(data.due_now),
  };
}

function readLogEntry(raw: unknown): WahubBotModeLogEntry | null {
  const data = record(raw);
  const text = data ? str(data.text) : '';
  return data && text ? { at: time(data.at), what: str(data.what), to: str(data.to), by: str(data.by), text } : null;
}

/** How many changes the fold shows at the most (the contract's own number). */
export const LOG_MAX = 20;

/**
 * GET settings/bot-mode/ as the screen reads it — and the answer of the three
 * calls beside it, which is the same body. Null for an answer that does not say
 * plainly whether the mode is `test` or `all`: on this screen an answer that
 * cannot be read is a failure, never a guess.
 */
export function readBotMode(raw: unknown): WahubBotMode | null {
  const data = record(raw);
  if (!data) return null;
  if (data.mode !== 'test' && data.mode !== 'all') return null;
  const mode = data.mode;
  const liveSince = time(data.live_since);
  return {
    mode,
    // "Answers everybody" needs both: the mode, and the server saying so.
    live: mode === 'all' && data.live === true,
    live_since: mode === 'all' ? liveSince : null,
    chosen_at: time(data.chosen_at),
    chosen_by: str(data.chosen_by),
    sending_enabled: data.sending_enabled === true,
    text: str(data.text),
    warning: str(data.warning),
    stopped: readStopped(data.stopped),
    test_contacts: count(data.test_contacts),
    today: readToday(data.today),
    last_failure: readFailure(data.last_failure),
    followups: readFollowups(data.followups),
    log: (Array.isArray(data.log) ? data.log : [])
      .map(readLogEntry)
      .filter((entry): entry is WahubBotModeLogEntry => entry !== null)
      .slice(0, LOG_MAX),
  };
}

/** The reasons of a 409 `not_ready`, in the server's own words. Only reasons that say something. */
export function readProblems(raw: unknown): WahubBotModeProblem[] {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const data = record(item);
      const text = data ? str(data.text) : '';
      return data && text ? { code: str(data.code), text } : null;
    })
    .filter((problem): problem is WahubBotModeProblem => problem !== null);
}

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

/** The card's place on the page: where the row "מי עונה" of "מצב המערכת" leads to. */
export const WHO_ANSWERS_CARD_ID = 'wahub-who-answers';

export const WHO_ANSWERS_TEXT = {
  title: 'מי עונה ללקוחות',
  /** The two states, in the words the owner was given. */
  test: 'בדיקה בלבד',
  testSub: 'הבוט החדש עונה רק למספרי הבדיקה',
  all: 'הבוט החדש עונה לכולם',
  /** `all` was chosen and nothing goes out yet — when the server did not say why in a sentence of its own. */
  notYet: 'נבחר "הבוט החדש עונה לכולם" — והוא עוד לא עונה',
  /** The two buttons. */
  goLive: 'הבוט החדש עונה לכולם',
  backToTest: 'לחזור לבדיקה בלבד',
  loadFailed: 'לא הצלחנו לטעון מי עונה ללקוחות',
  /** The window of going live. */
  dialogTitle: 'הבוט החדש עונה לכולם',
  dialogLines: [
    'מהרגע הזה הבוט החדש עונה לכל לקוח שכותב.',
    'הוא לא עונה על הודעות שנכנסו לפני כן.',
    'ודאו שהבוט הישן כבר מנותק ב-ManyChat.',
  ],
  dialogSendingOff: 'השליחה ללקוחות כבויה כרגע. גם אחרי ההדלקה שום תשובה לא תצא, עד שהשליחה תודלק.',
  dialogTick: 'ניתקתי את הבוט הישן ב-ManyChat',
  dialogConfirm: 'להדליק לכולם',
  dialogNotReady: 'אי אפשר להדליק עכשיו',
  /** Going back. */
  backQuestion: 'לחזור לבדיקה בלבד?',
  backLine: 'הבוט החדש יפסיק לענות ללקוחות, ויענה רק למספרי הבדיקה.',
  backReminder: 'לחבר חזרה את הבוט הישן ב-ManyChat, אחרת אף אחד לא עונה ללקוחות.',
  backConfirm: 'כן, לחזור לבדיקה בלבד',
  /** After going back, for as long as the screen stays open. */
  wentBack: 'חזרנו לבדיקה בלבד.',
  wentBackReminder: 'אם הבוט הישן מנותק ב-ManyChat — חברו אותו חזרה, אחרת אף אחד לא עונה ללקוחות.',
  /** The brake fired: what it means, and what is done now. */
  stoppedNobody: 'מהרגע הזה אף אחד לא עונה ללקוחות אוטומטית.',
  stoppedNow: 'מה עושים עכשיו:',
  stoppedHow: 'מחברים חזרה את הבוט הישן ב-ManyChat — או בודקים למטה מה נכשל, ומדליקים שוב את הבוט החדש.',
  todayTitle: 'היום',
  failureTitle: 'הכשל האחרון',
  logTitle: 'מי שינה ומתי',
  /** A change that was sent and not answered: whether it was kept is not known. The card is read again from the server
   *  (and says so itself when that, too, got no answer). */
  unknown: 'השרת לא ענה, ולא ידוע אם השינוי נשמר. לפני שמנסים שוב — בדקו מה מוצג כאן.',
  goLiveFailed: 'ההדלקה לא נשמרה. נסו שוב.',
  backFailed: 'החזרה לבדיקה בלבד לא נשמרה. נסו שוב.',
} as const;

export const FOLLOWUPS_TEXT = {
  switchLabel: 'חזרות אוטומטיות ללידים',
  title: 'חזרות אוטומטיות',
  /** How the line is put right, where the switch stands on the line itself. */
  how: 'מדליקים במתג שבשורה הזאת.',
  question: 'להדליק את החזרות האוטומטיות ללידים?',
  line: 'ייצאו רק חזרות שמועדן מעכשיו והלאה; מה שהגיע זמנו קודם לא יישלח.',
  confirm: 'כן, להדליק',
  onFailed: 'ההדלקה לא נשמרה. נסו שוב.',
  offFailed: 'הכיבוי לא נשמר. נסו שוב.',
} as const;

/** "מספר בדיקה אחד" / "3 מספרי בדיקה" — how many contacts the live test holds. */
export function testNumbersWords(n: number): string {
  if (n <= 0) return 'אין כרגע מספרי בדיקה';
  return n === 1 ? 'מספר בדיקה אחד' : `${n.toLocaleString('he-IL')} מספרי בדיקה`;
}

/** "מאז 14.10 12:05"; empty when the moment is not known. */
export function sinceWords(value: string | null | undefined, now: Date): string {
  const when = formatDateTime(value, now);
  return when ? `מאז ${when}` : '';
}

export type WhoAnswersTone = 'test' | 'live' | 'held';

export interface WhoAnswersHeadline {
  tone: WhoAnswersTone;
  /** The state, large. */
  title: string;
  /** One quiet line under it; may be empty. */
  sub: string;
}

/**
 * Who answers the customers right now, in one large line.
 *
 *   test          "בדיקה בלבד" · the new bot answers only the test numbers (and how many there are)
 *   all, live     "הבוט החדש עונה לכולם" · since when
 *   all, not live the server's own sentence — it alone knows why nothing goes out yet (sending is off, or the
 *                 first message has not come in) — in amber
 */
export function whoAnswersHeadline(state: Pick<WahubBotMode, 'mode' | 'live' | 'live_since' | 'text' | 'test_contacts'>, now: Date): WhoAnswersHeadline {
  if (state.mode === 'test') {
    return { tone: 'test', title: WHO_ANSWERS_TEXT.test, sub: `${WHO_ANSWERS_TEXT.testSub} · ${testNumbersWords(state.test_contacts)}` };
  }
  if (state.live) return { tone: 'live', title: WHO_ANSWERS_TEXT.all, sub: sinceWords(state.live_since, now) };
  return { tone: 'held', title: state.text || WHO_ANSWERS_TEXT.notYet, sub: '' };
}

/**
 * The warning beside the state, when there is one to show. After the brake
 * fired the server's warning says once more that the bot stopped itself — the
 * strip above already says so, and it is not said twice.
 */
export function warningToShow(state: Pick<WahubBotMode, 'warning' | 'stopped'>): string {
  if (!state.warning) return '';
  if (state.stopped && state.warning.includes('עצר את עצמו')) return '';
  return state.warning;
}

/** The one button of the card: from `test` it opens the window of going live; from `all` it asks to go back. */
export function whoAnswersAction(state: Pick<WahubBotMode, 'mode'>): 'go_live' | 'back_to_test' {
  return state.mode === 'all' ? 'back_to_test' : 'go_live';
}

export interface TodayFigure {
  key: keyof WahubBotModeToday;
  label: string;
  value: number;
  /** A number that asks to be looked at: something failed, or somebody was not answered. */
  alert: boolean;
}

/** The day in six small numbers, in their fixed order. */
export function todayFigures(today: WahubBotModeToday): TodayFigure[] {
  return [
    { key: 'sent', label: 'נענו', value: today.sent, alert: false },
    { key: 'failed', label: 'נכשלו', value: today.failed, alert: today.failed > 0 },
    { key: 'late', label: 'נענו באיחור', value: today.late, alert: false },
    { key: 'needs_human', label: 'עברו לנציג', value: today.needs_human, alert: false },
    { key: 'fallback', label: 'קיבלו הודעת גיבוי', value: today.fallback, alert: false },
    { key: 'unanswered', label: 'לא נענו', value: today.unanswered, alert: today.unanswered > 0 },
  ];
}

/**
 * Whether the day's numbers are shown at all: while the bot answers everybody
 * (or was chosen to), after it stopped itself, and whenever there is anything
 * to count. In a quiet "בדיקה בלבד" six noughts say nothing, and are left out.
 */
export function showToday(state: Pick<WahubBotMode, 'mode' | 'stopped' | 'today'>): boolean {
  if (state.mode === 'all' || state.stopped) return true;
  return Object.values(state.today).some((value) => value > 0);
}

export interface LogLine {
  when: string;
  text: string;
  by: string;
}

/** The changes as lines: when, what was said, and who — where the server recorded a person. */
export function logLines(log: readonly WahubBotModeLogEntry[], now: Date): LogLine[] {
  return log.map((entry) => ({ when: formatDateTime(entry.at, now), text: entry.text, by: entry.by }));
}

/** The word of the row "מי עונה" in "מצב המערכת" — the state in two or three words; the card itself says the rest. */
export function whoAnswersWord(state: Pick<WahubBotMode, 'mode' | 'live' | 'stopped'>): { level: StatusLevel; value: string } {
  if (state.mode === 'all') return state.live ? { level: 'ok', value: 'הבוט החדש, לכולם' } : { level: 'warn', value: 'עוד לא עונה לכולם' };
  if (state.stopped) return { level: 'off', value: 'הבוט החדש עצר' };
  return { level: 'unknown', value: WHO_ANSWERS_TEXT.test };
}

// ---------------------------------------------------------------------------
// Going live: two steps, and nothing less
// ---------------------------------------------------------------------------

/**
 * The window of "הבוט החדש עונה לכולם". The button on the card only opens it;
 * inside, "ניתקתי את הבוט הישן ב-ManyChat" has to be ticked before "להדליק
 * לכולם" can be pressed. A stray press can never turn "כולם" on.
 */
export interface GoLiveStep {
  open: boolean;
  /** "ניתקתי את הבוט הישן ב-ManyChat" is ticked. */
  disconnected: boolean;
}

export const GO_LIVE_CLOSED: GoLiveStep = { open: false, disconnected: false };

export type GoLiveEvent = 'open' | 'close' | 'tick' | 'untick';

/** The tick is never remembered: every opening of the window starts without it, and closing forgets it. */
export function goLiveStep(step: GoLiveStep, event: GoLiveEvent): GoLiveStep {
  if (event === 'open') return { open: true, disconnected: false };
  if (event === 'close') return GO_LIVE_CLOSED;
  if (!step.open) return step;
  return { open: true, disconnected: event === 'tick' };
}

/** "להדליק לכולם" can be pressed: the window is open, the tick is on, and nothing is on its way to the server. */
export function canGoLive(step: GoLiveStep, busy: boolean): boolean {
  return step.open && step.disconnected && !busy;
}

// ---------------------------------------------------------------------------
// The switch of the comings back to the leads
// ---------------------------------------------------------------------------

/** The key of the line "חזרות אוטומטיות" among the lines of GET leads/automation/ (the contract, ג.3). */
export const FOLLOWUPS_LINE_KEY = 'followups';

interface AutomationLine {
  key: string;
  ok: boolean;
  title: string;
  detail: string;
  how: string;
}

/**
 * The lines of "חזרה אוטומטית ללידים" with the line of the switch among them.
 * Where the server sent that line, its tick and its title stay the server's.
 * Its sentence is taken from the switch itself, so the words and the switch
 * beside them never disagree. And how it is put right is said by the screen:
 * the switch stands on this very line, so the line does not send the reader
 * to look for it elsewhere. Where the server sent no such line, one is added
 * from what the switch says.
 */
export function withFollowupsLine<T extends AutomationLine>(lines: readonly T[], followups: { on: boolean; text: string }): AutomationLine[] {
  if (lines.some((line) => line.key === FOLLOWUPS_LINE_KEY)) {
    return lines.map((line) =>
      line.key === FOLLOWUPS_LINE_KEY ? { ...line, detail: followups.text || line.detail, how: line.ok ? '' : FOLLOWUPS_TEXT.how } : line,
    );
  }
  return [
    ...lines,
    { key: FOLLOWUPS_LINE_KEY, ok: followups.on, title: FOLLOWUPS_TEXT.title, detail: followups.text, how: followups.on ? '' : FOLLOWUPS_TEXT.how },
  ];
}

/**
 * What turning the switch on leaves behind, said with the number where there
 * is one: the comings back whose time has already come are not sent.
 */
export function followupsLeftBehind(dueNow: number): string {
  if (dueNow <= 0) return '';
  return dueNow === 1 ? 'חזרה אחת שכבר הגיע זמנה לא תישלח.' : `${dueNow.toLocaleString('he-IL')} חזרות שכבר הגיע זמנן לא יישלחו.`;
}

/** How often the state is read again while it is on screen, by what it last said. */
export function botModeInterval(state: WahubBotMode | null | undefined): number {
  // A server that has no such endpoint yet is asked again only now and then, in case it was just released.
  if (state === null) return 5 * 60_000;
  // While the bot answers everybody the day's numbers move, and the brake may fire.
  if (state?.mode === 'all') return 30_000;
  return 60_000;
}
