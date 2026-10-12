import type {
  WahubEvalCheck,
  WahubEvalCheckStatus,
  WahubEvalCustomerMessage,
  WahubEvalEngine,
  WahubEvalFailure,
  WahubEvalGroup,
  WahubEvalLast,
  WahubEvalListing,
  WahubEvalRule,
  WahubEvalRun,
  WahubEvalScenario,
  WahubEvalStatus,
  WahubEvalSummary,
  WahubEvalTurn,
} from '@/types/wahubTeach';
import { dayKey, daysBetween, formatClock, formatShortDate, israelToday } from './format';

/**
 * "בדיקות הבוט" (docs/WAHUB-CONTRACT-BOT-EVALS.md; the screen:
 * docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, ג).
 *
 * Written test conversations, each played against the bot one request at a
 * time. Everything the screen decides by itself is here, and nothing here
 * talks to the server by itself: how the answers are read, the big sentence,
 * the order of the list (what failed first), which conversations a press
 * checks, where a run stands, and what is handed to "ללמד" from a failure.
 */

export const EVALS_TEXT = {
  runNow: 'בדוק עכשיו',
  runFailed: 'בדוק רק מה שנכשל',
  stop: 'עצור',
  neverChecked: 'עוד לא נבדק',
  loadFailed: 'לא הצלחתי לטעון את הבדיקות',
  runFailedToOpen: 'לא הצלחתי לפתוח את השיחה הזאת כרגע',
  teach: 'ללמד את הבוט',
  technical: 'פרטים טכניים',
  conversation: 'השיחה',
  what: 'מה בודקים',
  expected: 'ציפינו ש',
  allChecks: 'כל מה שנבדק',
  stub: 'הבוט האמיתי לא מחובר כאן, אז עונה בוט מדומה. התוצאות לא אומרות איך הבוט האמיתי עונה',
  notBuiltTitle: 'המסך הזה ייפתח אחרי העדכון הבא של המערכת',
  notBuiltText: 'כאן תראה כמה שיחות בדיקה הבוט עובר, ותוכל לבדוק שוב בלחיצה. אין מה לעשות בינתיים — זה ייפתח לבד.',
  offline: 'אין חיבור, אז הבדיקה נעצרה. מה שכבר נבדק נשמר',
  denied: 'אין הרשאה להריץ בדיקות מהחשבון הזה',
} as const;

// ---------------------------------------------------------------------------
// Reading the server's answers
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function asId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function asList<T>(value: unknown, read: (entry: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(read).filter((entry): entry is T => entry !== null) : [];
}

const STATUSES: WahubEvalStatus[] = ['running', 'passed', 'failed', 'skipped', 'error'];
const STATUS_LABEL: Record<WahubEvalStatus, string> = { running: 'רץ', passed: 'עבר', failed: 'נכשל', skipped: 'דולג', error: 'לא רץ' };

function asStatus(value: unknown): WahubEvalStatus | null {
  return STATUSES.includes(value as WahubEvalStatus) ? (value as WahubEvalStatus) : null;
}

function readRule(raw: unknown): WahubEvalRule | null {
  const data = asRecord(raw);
  const title = asText(data?.title);
  return data && title ? { id: asText(data.id), title } : null;
}

function readLast(raw: unknown): WahubEvalLast | null {
  const data = asRecord(raw);
  const status = asStatus(data?.status);
  const runId = asId(data?.run_id);
  if (!data || !status || runId == null) return null;
  return {
    run_id: runId,
    status,
    status_label: asText(data.status_label) || STATUS_LABEL[status],
    finished_at: asText(data.finished_at) || null,
    engine: asText(data.engine),
    engine_is_stub: data.engine_is_stub === true,
    took_ms: asCount(data.took_ms),
    passed_checks: asCount(data.passed_checks),
    failed_checks: asCount(data.failed_checks),
    not_judged: asCount(data.not_judged),
    headline: asText(data.headline),
  };
}

function readScenarioHead(raw: unknown): WahubEvalRun['scenario'] | null {
  const data = asRecord(raw);
  const id = asText(data?.id);
  if (!data || !id) return null;
  return {
    id,
    // A scenario with no title is still a row: its sentence stands in, never its code name.
    title: asText(data.title) || asText(data.what) || 'שיחת בדיקה',
    group: asText(data.group),
    group_title: asText(data.group_title),
    what: asText(data.what),
    rules: asList(data.rules, readRule),
    turns: asCount(data.turns),
  };
}

function readScenario(raw: unknown): WahubEvalScenario | null {
  const head = readScenarioHead(raw);
  const data = asRecord(raw);
  if (!head || !data) return null;
  const going = asRecord(data.in_progress);
  const goingId = asId(going?.run_id);
  return {
    ...head,
    last: readLast(data.last),
    in_progress: going && goingId != null ? { run_id: goingId, turns_played: asCount(going.turns_played) } : null,
  };
}

function readGroup(raw: unknown): WahubEvalGroup | null {
  const data = asRecord(raw);
  const id = asText(data?.id);
  if (!data || !id) return null;
  return { id, title: asText(data.title) || id, total: asCount(data.total), passed: asCount(data.passed), failed: asCount(data.failed) };
}

function readEngine(raw: unknown): WahubEvalEngine {
  const data = asRecord(raw) ?? {};
  return {
    // Unsaid counts as connected: the banner of the stand-in bot is shown only when the server says so.
    configured: data.configured !== false,
    model: asText(data.model),
    judge: data.judge !== false,
    label: asText(data.label),
  };
}

/** GET bot/evals/. Null for an answer that is not the list. */
export function readEvalListing(raw: unknown): WahubEvalListing | null {
  const data = asRecord(raw);
  if (!data || !Array.isArray(data.scenarios)) return null;
  const scenarios = asList(data.scenarios, readScenario);
  const counted = summaryOf(scenarios);
  const sent = asRecord(data.summary);
  return {
    engine: readEngine(data.engine),
    summary: sent
      ? {
          total: asCount(sent.total) || counted.total,
          passed: asCount(sent.passed),
          failed: asCount(sent.failed),
          skipped: asCount(sent.skipped),
          not_run: asCount(sent.not_run),
          never_run: asCount(sent.never_run),
          last_run_at: asText(sent.last_run_at) || counted.last_run_at,
        }
      : counted,
    groups: Array.isArray(data.groups) ? asList(data.groups, readGroup) : groupsOf(scenarios),
    scenarios,
  };
}

const CHECK_STATUSES: WahubEvalCheckStatus[] = ['passed', 'failed', 'not_judged'];
const CHECK_LABEL: Record<WahubEvalCheckStatus, string> = { passed: 'עבר', failed: 'נכשל', not_judged: 'לא נשפט' };

function readCustomer(raw: unknown): WahubEvalCustomerMessage | null {
  const data = asRecord(raw);
  if (!data) return null;
  const kind = data.kind === 'voice' || data.kind === 'image' ? data.kind : 'text';
  return { kind, text: asText(data.text) };
}

function readTurn(raw: unknown): WahubEvalTurn | null {
  const data = asRecord(raw);
  if (!data) return null;
  return {
    turn: asCount(data.turn),
    customer: asList(data.customer, readCustomer),
    last_outbound: asText(data.last_outbound),
    bot: asText(data.bot),
    reasoning: asText(data.reasoning),
    tools: asList(data.tools, (entry) => {
      const tool = asRecord(entry);
      return tool ? { name: asText(tool.name), summary: asText(tool.summary) } : null;
    }),
    request_human: data.request_human === true,
    request_human_reason: asText(data.request_human_reason),
    tags: asList(data.tags, (entry) => {
      const tag = asRecord(entry);
      const name = asText(tag?.tag);
      return tag && name ? { tag: name, details: asText(tag.details) } : null;
    }),
  };
}

function readCheck(raw: unknown): WahubEvalCheck | null {
  const data = asRecord(raw);
  if (!data) return null;
  const status = CHECK_STATUSES.includes(data.status as WahubEvalCheckStatus) ? (data.status as WahubEvalCheckStatus) : 'not_judged';
  return {
    id: asText(data.id),
    turn: asCount(data.turn),
    kind: data.kind === 'rubric' ? 'rubric' : 'hard',
    title: asText(data.title),
    status,
    status_label: asText(data.status_label) || CHECK_LABEL[status],
    explain: asText(data.explain),
  };
}

function readFailure(raw: unknown): WahubEvalFailure | null {
  const check = readCheck(raw);
  const data = asRecord(raw);
  if (!check || !data) return null;
  return { ...check, status: 'failed', customer: asList(data.customer, readCustomer), bot: asText(data.bot) };
}

/** One run in full — the answer of POST bot/evals/run/ and of GET bot/evals/runs/{id}/. Null for anything else. */
export function readEvalRun(raw: unknown): WahubEvalRun | null {
  const data = asRecord(raw);
  const runId = asId(data?.run_id);
  const status = asStatus(data?.status);
  const scenario = readScenarioHead(data?.scenario);
  if (!data || runId == null || !status || !scenario) return null;
  const counts = asRecord(data.counts) ?? {};
  const conversation = asList(data.conversation, readTurn);
  return {
    run_id: runId,
    scenario,
    status,
    status_label: asText(data.status_label) || STATUS_LABEL[status],
    // `done` is the server's word; a status that is final says the same when it is missing.
    done: typeof data.done === 'boolean' ? data.done : status !== 'running',
    turns_played: asCount(data.turns_played) || conversation.length,
    turns_total: asCount(data.turns_total) || scenario.turns,
    engine: asText(data.engine),
    engine_is_stub: data.engine_is_stub === true,
    started_at: asText(data.started_at) || null,
    finished_at: asText(data.finished_at) || null,
    took_ms: asCount(data.took_ms),
    detail: asText(data.detail),
    headline: asText(data.headline),
    counts: { passed: asCount(counts.passed), failed: asCount(counts.failed), not_judged: asCount(counts.not_judged) },
    conversation,
    checks: asList(data.checks, readCheck),
    failures: asList(data.failures, readFailure),
  };
}

// ---------------------------------------------------------------------------
// The figures
// ---------------------------------------------------------------------------

/** Where a scenario stands by its last finished run: it failed, it passed, or nobody can say. */
export type EvalBucket = 'failed' | 'unchecked' | 'passed';

export function scenarioBucket(scenario: Pick<WahubEvalScenario, 'last'>): EvalBucket {
  const status = scenario.last?.status;
  if (status === 'failed') return 'failed';
  return status === 'passed' ? 'passed' : 'unchecked';
}

/** Why a scenario was not checked: "דולג", "לא רץ", "עוד לא נבדק". */
export function uncheckedLabel(scenario: Pick<WahubEvalScenario, 'last'>): string {
  const status = scenario.last?.status;
  if (status === 'skipped') return 'דולג';
  if (status === 'error') return 'לא רץ';
  return EVALS_TEXT.neverChecked;
}

/** The totals, counted from the rows — the same sum the server sends, kept right while a run changes the rows. */
export function summaryOf(scenarios: ReadonlyArray<Pick<WahubEvalScenario, 'last'>>): WahubEvalSummary {
  const summary: WahubEvalSummary = { total: scenarios.length, passed: 0, failed: 0, skipped: 0, not_run: 0, never_run: 0, last_run_at: null };
  for (const { last } of scenarios) {
    if (!last) summary.never_run += 1;
    else if (last.status === 'passed') summary.passed += 1;
    else if (last.status === 'failed') summary.failed += 1;
    else if (last.status === 'skipped') summary.skipped += 1;
    else summary.not_run += 1;
    if (last?.finished_at && (!summary.last_run_at || last.finished_at > summary.last_run_at)) summary.last_run_at = last.finished_at;
  }
  return summary;
}

/** The groups, in the order their first scenario stands, with how many of each passed and failed. */
export function groupsOf(scenarios: ReadonlyArray<Pick<WahubEvalScenario, 'group' | 'group_title' | 'last'>>): WahubEvalGroup[] {
  const groups = new Map<string, WahubEvalGroup>();
  for (const scenario of scenarios) {
    if (!scenario.group) continue;
    const group = groups.get(scenario.group) ?? { id: scenario.group, title: scenario.group_title || scenario.group, total: 0, passed: 0, failed: 0 };
    group.total += 1;
    if (scenario.last?.status === 'passed') group.passed += 1;
    if (scenario.last?.status === 'failed') group.failed += 1;
    groups.set(scenario.group, group);
  }
  return [...groups.values()];
}

export interface EvalHeadline {
  /** The two figures of the big sentence; null when no conversation was ever checked. */
  passed: number | null;
  total: number;
  /** The sentence around them. */
  text: string;
  /** What did not pass, in a quiet line: "9 נכשלו · 3 דולגו". Empty when all passed. */
  rest: string;
}

function countPhrase(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

/** "84 מתוך 101 שיחות בדיקה עוברות" — the one big sentence, and under it what did not pass. */
export function evalHeadline(summary: WahubEvalSummary): EvalHeadline {
  if (summary.total === 0) return { passed: null, total: 0, text: 'עוד אין שיחות בדיקה', rest: '' };
  if (summary.never_run >= summary.total) {
    return {
      passed: null,
      total: summary.total,
      text: summary.total === 1 ? 'שיחת בדיקה אחת מחכה לבדיקה ראשונה' : `${summary.total} שיחות בדיקה מחכות לבדיקה ראשונה`,
      rest: '',
    };
  }
  const rest = [
    summary.failed > 0 ? countPhrase(summary.failed, 'אחת נכשלה', 'נכשלו') : '',
    summary.not_run > 0 ? countPhrase(summary.not_run, 'אחת לא רצה', 'לא רצו') : '',
    summary.skipped > 0 ? countPhrase(summary.skipped, 'אחת דולגה', 'דולגו') : '',
    summary.never_run > 0 ? countPhrase(summary.never_run, 'אחת עוד לא נבדקה', 'עוד לא נבדקו') : '',
  ].filter(Boolean);
  return {
    passed: summary.passed,
    total: summary.total,
    text: summary.passed === 1 ? 'שיחת בדיקה עוברת' : 'שיחות בדיקה עוברות',
    rest: rest.join(' · '),
  };
}

/** "נבדק לאחרונה היום ב-12:41" */
export function lastCheckedText(lastRunAt: string | null | undefined, now: Date = new Date()): string {
  if (!lastRunAt) return EVALS_TEXT.neverChecked;
  const key = dayKey(lastRunAt);
  const clock = formatClock(lastRunAt);
  if (!key) return EVALS_TEXT.neverChecked;
  const diff = daysBetween(key, israelToday(now));
  const day = diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : `ב-${formatShortDate(lastRunAt, now)}`;
  return clock ? `נבדק לאחרונה ${day} ב-${clock}` : `נבדק לאחרונה ${day}`;
}

// ---------------------------------------------------------------------------
// The list: what failed first
// ---------------------------------------------------------------------------

export interface EvalSections<T> {
  /** Did not pass — always open, at the top. */
  failed: T[];
  /** Neither passed nor failed: skipped, did not run, never checked. Folded. */
  unchecked: T[];
  /** Passed. Folded: "84 עברו — הצג". */
  passed: T[];
}

/** The rows in three pieces, each keeping the server's own order. */
export function sortScenarios<T extends Pick<WahubEvalScenario, 'last'>>(scenarios: ReadonlyArray<T>): EvalSections<T> {
  const sections: EvalSections<T> = { failed: [], unchecked: [], passed: [] };
  for (const scenario of scenarios) sections[scenarioBucket(scenario)].push(scenario);
  return sections;
}

/** The rows of one group; every row when no group is chosen (or the chosen one is gone). */
export function inGroup<T extends Pick<WahubEvalScenario, 'group'>>(scenarios: ReadonlyArray<T>, group: string | null): T[] {
  if (!group || !scenarios.some((scenario) => scenario.group === group)) return scenarios.slice();
  return scenarios.filter((scenario) => scenario.group === group);
}

/** "42 עברו — הצג" */
export function passedFoldTitle(count: number): string {
  return count === 1 ? 'אחת עברה' : `${count} עברו`;
}

/** "8 לא נבדקו" */
export function uncheckedFoldTitle(count: number): string {
  return count === 1 ? 'אחת לא נבדקה' : `${count} לא נבדקו`;
}

/** What a customer's message says in a bubble: its words, or what it is when it has none. */
export function customerLine(message: WahubEvalCustomerMessage): string {
  if (message.kind === 'voice') return message.text ? `הקלטה: ${message.text}` : 'הקלטה קולית (בלי תמלול)';
  if (message.kind === 'image') return message.text ? `תמונה: ${message.text}` : 'תמונה';
  return message.text;
}

/** The checks that failed, by the answer they are about. */
export function failuresByTurn(run: Pick<WahubEvalRun, 'failures'>): Map<number, WahubEvalFailure[]> {
  const byTurn = new Map<number, WahubEvalFailure[]>();
  for (const failure of run.failures) byTurn.set(failure.turn, [...(byTurn.get(failure.turn) ?? []), failure]);
  return byTurn;
}

// ---------------------------------------------------------------------------
// What a press checks
// ---------------------------------------------------------------------------

/** `all`: every conversation on screen. `failed`: only what did not pass last time. */
export type EvalScope = 'all' | 'failed';

/** Did not pass, or did not run at all ("לא רץ" — it can be run again): what "בדוק רק מה שנכשל" checks. */
export function needsRecheck(scenario: Pick<WahubEvalScenario, 'last'>): boolean {
  return scenario.last?.status === 'failed' || scenario.last?.status === 'error';
}

export interface EvalQueueItem {
  id: string;
  title: string;
  turns: number;
  /** A run that started in the last ten minutes and did not finish: carried on instead of started again. */
  resume: number | null;
}

/** The conversations a press checks, in the server's order: the chosen group (or all), all of it or only what failed. */
export function runQueue(scenarios: ReadonlyArray<WahubEvalScenario>, scope: EvalScope, group: string | null = null): EvalQueueItem[] {
  return inGroup(scenarios, group)
    .filter((scenario) => scope === 'all' || needsRecheck(scenario))
    .map((scenario) => ({ id: scenario.id, title: scenario.title, turns: scenario.turns, resume: scenario.in_progress?.run_id ?? null }));
}

/** A turn of a conversation takes the bot about this long, and the judging at the end a little more. */
const SECONDS_PER_TURN = 13;
const SECONDS_PER_JUDGING = 6;

/** How long a press will take, in minutes: what each conversation took last time, or a guess from its length. */
export function estimateMinutes(scenarios: ReadonlyArray<Pick<WahubEvalScenario, 'turns' | 'last'>>): number {
  let seconds = 0;
  for (const scenario of scenarios) {
    const took = scenario.last && scenario.last.status !== 'skipped' ? scenario.last.took_ms / 1000 : 0;
    seconds += took > 0 ? took : Math.max(1, scenario.turns) * SECONDS_PER_TURN + SECONDS_PER_JUDGING;
  }
  return Math.max(1, Math.ceil(seconds / 60));
}

/** "כדקה", "כ-4 דקות", "כחצי שעה", "כשעה" */
export function minutesWords(minutes: number): string {
  if (minutes <= 1) return 'כדקה';
  if (minutes === 2) return 'כשתי דקות';
  if (minutes >= 25 && minutes <= 35) return 'כחצי שעה';
  if (minutes >= 55 && minutes <= 70) return 'כשעה';
  if (minutes > 70) return `כ-${Math.round(minutes / 30) / 2} שעות`;
  return `כ-${minutes} דקות`;
}

/** The quiet line under the button: what a press will check, and for how long. */
export function runHint(scenarios: ReadonlyArray<WahubEvalScenario>, group: WahubEvalGroup | null): string {
  const mine = inGroup(scenarios, group?.id ?? null);
  if (!mine.length) return '';
  const time = minutesWords(estimateMinutes(mine));
  const which = group
    ? mine.length === 1
      ? `תיבדק השיחה של "${group.title}"`
      : `ייבדקו ${mine.length} השיחות של "${group.title}"`
    : mine.length === 1
      ? 'תיבדק שיחה אחת'
      : `ייבדקו כל ${mine.length} השיחות`;
  return `${which} — ${time}. הבוט עונה באמת על כל אחת; אפשר לעצור באמצע.`;
}

// ---------------------------------------------------------------------------
// A run, as the screen follows it
// ---------------------------------------------------------------------------

/**
 * `running`: conversations are being checked one after the other.
 * `finished`: the whole queue was gone through. `stopped`: he pressed "עצור".
 * `halted`: the screen stopped by itself — no connection, or no permission.
 */
export type EvalRunPhase = 'idle' | 'running' | 'finished' | 'stopped' | 'halted';

/** How one conversation ended in this run. `unreached`: no answer came, so nothing is known. */
export type EvalOutcome = 'passed' | 'failed' | 'skipped' | 'error' | 'unreached';

export interface EvalRunState {
  phase: EvalRunPhase;
  scope: EvalScope;
  /** The group the press was scoped to; null for all of them. */
  group: string | null;
  queue: EvalQueueItem[];
  /** The conversation being checked now, with how far it got. */
  current: { id: string; title: string; turnsPlayed: number; turnsTotal: number } | null;
  /** Every conversation this run finished with, by its id. */
  outcomes: Record<string, EvalOutcome>;
  /** Why the screen stopped by itself. */
  halt: string;
}

export const EVAL_RUN_START: EvalRunState = { phase: 'idle', scope: 'all', group: null, queue: [], current: null, outcomes: {}, halt: '' };

export type EvalRunAction =
  | { type: 'start'; queue: EvalQueueItem[]; scope: EvalScope; group: string | null }
  | { type: 'scenario'; id: string }
  | { type: 'turns'; id: string; played: number; total: number }
  | { type: 'outcome'; id: string; outcome: EvalOutcome }
  | { type: 'stop' }
  | { type: 'halt'; reason: string }
  | { type: 'finish' }
  | { type: 'dismiss' };

export function evalRunReducer(state: EvalRunState, action: EvalRunAction): EvalRunState {
  switch (action.type) {
    case 'start':
      // A second press while a run is on changes nothing: one run at a time.
      if (state.phase === 'running' || !action.queue.length) return state;
      return { phase: 'running', scope: action.scope, group: action.group, queue: action.queue, current: null, outcomes: {}, halt: '' };
    case 'scenario': {
      if (state.phase !== 'running') return state;
      const item = state.queue.find((entry) => entry.id === action.id);
      if (!item) return state;
      return { ...state, current: { id: item.id, title: item.title, turnsPlayed: 0, turnsTotal: item.turns } };
    }
    case 'turns':
      if (state.phase !== 'running' || state.current?.id !== action.id) return state;
      return {
        ...state,
        current: {
          ...state.current,
          // Progress never goes back, whatever order the answers land in.
          turnsPlayed: Math.max(state.current.turnsPlayed, action.played),
          turnsTotal: action.total || state.current.turnsTotal,
        },
      };
    case 'outcome':
      if (state.phase !== 'running') return state;
      return { ...state, outcomes: { ...state.outcomes, [action.id]: action.outcome }, current: state.current?.id === action.id ? null : state.current };
    case 'stop':
      return state.phase === 'running' ? { ...state, phase: 'stopped', current: null } : state;
    case 'halt':
      return state.phase === 'running' ? { ...state, phase: 'halted', current: null, halt: action.reason } : state;
    case 'finish':
      return state.phase === 'running' ? { ...state, phase: 'finished', current: null } : state;
    case 'dismiss':
      return state.phase === 'running' ? state : EVAL_RUN_START;
    default:
      return state;
  }
}

/** How many conversations of the queue this run is done with. */
export function runDone(state: Pick<EvalRunState, 'outcomes'>): number {
  return Object.keys(state.outcomes).length;
}

/** 0–1 for the bar: the conversations done, and the part of the one being checked that was already played. */
export function runFraction(state: Pick<EvalRunState, 'queue' | 'outcomes' | 'current'>): number {
  if (!state.queue.length) return 0;
  const inside = state.current && state.current.turnsTotal > 0 ? Math.min(1, state.current.turnsPlayed / state.current.turnsTotal) : 0;
  // A conversation that is all played is still being judged: the bar stops just short of the next step.
  return Math.min(1, (runDone(state) + inside * 0.9) / state.queue.length);
}

/** "בודק 12 מתוך 45: הורה ששואל על מחיר" */
export function runLine(state: Pick<EvalRunState, 'queue' | 'outcomes' | 'current'>): string {
  const total = state.queue.length;
  const at = Math.min(total, runDone(state) + 1);
  if (!state.current) return total ? `בודק ${at} מתוך ${total}` : '';
  return `בודק ${at} מתוך ${total}: ${state.current.title}`;
}

/** "תשובה 2 מתוך 4" — how far inside a conversation of several turns. Empty for a one-turn conversation. */
export function runTurnLine(state: Pick<EvalRunState, 'current'>): string {
  const current = state.current;
  if (!current || current.turnsTotal <= 1) return '';
  return `תשובה ${Math.min(current.turnsTotal, current.turnsPlayed + 1)} מתוך ${current.turnsTotal}`;
}

export function outcomeCounts(state: Pick<EvalRunState, 'outcomes'>): Record<EvalOutcome, number> {
  const counts: Record<EvalOutcome, number> = { passed: 0, failed: 0, skipped: 0, error: 0, unreached: 0 };
  for (const outcome of Object.values(state.outcomes)) counts[outcome] += 1;
  return counts;
}

/** What a run that ended says: how far it got, and how the conversations it checked came out. */
export function runEndLine(state: EvalRunState): string {
  if (state.phase === 'idle' || state.phase === 'running') return '';
  const counts = outcomeCounts(state);
  const done = runDone(state);
  const total = state.queue.length;
  const unknown = counts.skipped + counts.error + counts.unreached;
  const parts = [
    counts.passed > 0 ? countPhrase(counts.passed, 'אחת עברה', 'עברו') : '',
    counts.failed > 0 ? countPhrase(counts.failed, 'אחת נכשלה', 'נכשלו') : '',
    unknown > 0 ? countPhrase(unknown, 'אחת לא נבדקה', 'לא נבדקו') : '',
  ].filter(Boolean);
  const result = parts.length ? `: ${parts.join(', ')}` : '';
  if (state.phase === 'finished') return `הבדיקה הסתיימה${result}`;
  const head = state.phase === 'halted' && state.halt ? state.halt : 'הבדיקה נעצרה';
  if (done === 0) return `${head}. שום שיחה לא נבדקה`;
  return `${head}. נבדקו ${done} מתוך ${total}${result}`;
}

// ---------------------------------------------------------------------------
// Running the queue
// ---------------------------------------------------------------------------

/** How a request for one conversation failed. */
export type EvalFailureKind = 'offline' | 'denied' | 'missing' | 'refused';

export interface RunQueueOptions {
  queue: ReadonlyArray<EvalQueueItem>;
  /** POST bot/evals/run/ — starts a conversation, or carries one on when `run_id` is given. */
  run: (body: { scenario_id: string; run_id?: number }) => Promise<WahubEvalRun>;
  dispatch: (action: EvalRunAction) => void;
  /** "עצור" was pressed. */
  stopped: () => boolean;
  /** Every answer that came — the list and the open row follow it. */
  onRun?: (run: WahubEvalRun) => void;
  classify: (error: unknown) => EvalFailureKind;
}

/** A conversation is carried on at most this many times: a ceiling, so one stuck conversation cannot hold the rest. */
export const MAX_CONTINUES = 24;
/** This many conversations in a row with no answer at all: there is no connection, and the run stops by itself. */
export const OFFLINE_LIMIT = 3;

/**
 * The run itself: one conversation at a time, one request at a time, in order.
 * A conversation of several turns answers `running` and is asked again with
 * its `run_id` until it is done. A conversation that fails to answer is marked
 * and the next one is checked — one bad line does not stop the rest; three in a
 * row with no answer at all, or a server that refuses the user, stops the run.
 * Returns when the queue is through, or when it was stopped.
 */
export async function runEvalQueue({ queue, run, dispatch, stopped, onRun, classify }: RunQueueOptions): Promise<void> {
  let silent = 0;
  for (const item of queue) {
    if (stopped()) return;
    dispatch({ type: 'scenario', id: item.id });
    let runId: number | null = item.resume;
    let retried = false;
    let outcome: EvalOutcome | null = null;
    for (let round = 0; round <= MAX_CONTINUES && outcome === null; round += 1) {
      let answer: WahubEvalRun;
      try {
        answer = await run(runId != null ? { scenario_id: item.id, run_id: runId } : { scenario_id: item.id });
      } catch (error) {
        if (stopped()) return;
        const kind = classify(error);
        if (kind === 'denied') return dispatch({ type: 'halt', reason: EVALS_TEXT.denied });
        if (kind === 'missing') return dispatch({ type: 'halt', reason: EVALS_TEXT.notBuiltTitle });
        // A run the server no longer has (it went stale): started again, once.
        if (kind === 'refused' && runId != null && !retried) {
          retried = true;
          runId = null;
          continue;
        }
        // No answer on a conversation that is under way: its turns are kept on the server, so it is asked once more.
        if (kind === 'offline' && runId != null && !retried) {
          retried = true;
          continue;
        }
        if (kind === 'offline') silent += 1;
        outcome = 'unreached';
        break;
      }
      if (stopped()) return;
      silent = 0;
      runId = answer.run_id;
      onRun?.(answer);
      dispatch({ type: 'turns', id: item.id, played: answer.turns_played, total: answer.turns_total });
      if (answer.done) outcome = answer.status === 'running' ? 'error' : answer.status;
    }
    dispatch({ type: 'outcome', id: item.id, outcome: outcome ?? 'unreached' });
    if (silent >= OFFLINE_LIMIT) return dispatch({ type: 'halt', reason: EVALS_TEXT.offline });
  }
  if (!stopped()) dispatch({ type: 'finish' });
}

// ---------------------------------------------------------------------------
// The list, kept right while a run changes it
// ---------------------------------------------------------------------------

/** A finished run, as the line the list carries for its scenario. */
export function lastOfRun(run: WahubEvalRun): WahubEvalLast {
  return {
    run_id: run.run_id,
    status: run.status,
    status_label: run.status_label,
    finished_at: run.finished_at,
    engine: run.engine,
    engine_is_stub: run.engine_is_stub,
    took_ms: run.took_ms,
    passed_checks: run.counts.passed,
    failed_checks: run.counts.failed,
    not_judged: run.counts.not_judged,
    headline: run.headline || run.failures[0]?.explain || (run.status === 'passed' ? '' : run.detail),
  };
}

/**
 * The list after an answer of a run: a finished run becomes its scenario's last
 * result and the totals are counted again; one still under way is noted on its
 * row, so it can be carried on. The server's own list replaces all of this when
 * the run ends.
 */
export function applyRun(listing: WahubEvalListing, run: WahubEvalRun): WahubEvalListing {
  if (!listing.scenarios.some((scenario) => scenario.id === run.scenario.id)) return listing;
  const scenarios = listing.scenarios.map((scenario) => {
    if (scenario.id !== run.scenario.id) return scenario;
    if (!run.done) return { ...scenario, in_progress: { run_id: run.run_id, turns_played: run.turns_played } };
    return { ...scenario, last: lastOfRun(run), in_progress: null };
  });
  const titles = new Map(listing.groups.map((group) => [group.id, group.title]));
  return {
    ...listing,
    scenarios,
    summary: summaryOf(scenarios),
    groups: groupsOf(scenarios).map((group) => ({ ...group, title: titles.get(group.id) ?? group.title })),
  };
}

// ---------------------------------------------------------------------------
// From a failure to "ללמד"
// ---------------------------------------------------------------------------

function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/**
 * The words "ללמד את הבוט" opens with, from a conversation that did not pass:
 * what the customer wrote, what was expected, and what the bot answered — in
 * his voice, for him to finish or change before sending. Nothing is sent by itself.
 */
export function teachSeed(run: Pick<WahubEvalRun, 'scenario' | 'failures' | 'conversation'>): string {
  const failure = run.failures[0];
  const turn = failure ? run.conversation.find((entry) => entry.turn === failure.turn) : run.conversation[run.conversation.length - 1];
  const wrote = (failure?.customer.length ? failure.customer : (turn?.customer ?? []))
    .map(customerLine)
    .filter(Boolean)
    .join(' / ');
  const answered = failure?.bot || turn?.bot || '';
  const expected = (failure?.title || run.scenario.what || '').replace(/[.。]+$/, '');
  const lines = [
    wrote ? `כשלקוח כותב "${clip(wrote, 240)}"` : `בשיחה כמו "${clip(run.scenario.title, 120)}"`,
    answered ? `הבוט ענה: "${clip(answered, 320)}"` : '',
    expected ? `בשיחה כזאת ציפיתי ש${expected.startsWith('הבוט') ? '' : ': '}${expected}.` : 'בשיחה כזאת ציפיתי ש',
  ].filter(Boolean);
  return lines.join('\n');
}
