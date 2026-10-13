/**
 * "ללמד" and "בדיקות" — the two sub-tabs of "הבוט" where the owner explains
 * something to the bot in his own words, and sees for himself how many written
 * test conversations the bot passes.
 *
 * docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md (א — the teach API, as the server was
 * built) and docs/WAHUB-CONTRACT-BOT-EVALS.md (the checks). These are the
 * shapes the screens keep; what the server sends is read into them, leniently,
 * in src/lib/wahub/teach.ts and src/lib/wahub/evals.ts.
 *
 * One rule shapes them: every text outside a `technical` is plain Hebrew meant
 * for the owner. A code name, a key or a record number lives in `technical`
 * only, and the screens show it only inside the folded "פרטים טכניים".
 */

// ---------------------------------------------------------------------------
// "ללמד את הבוט"
// ---------------------------------------------------------------------------

/** Where a teach thread stands, read by the server from its changes as they are now. */
export type WahubTeachState = 'waiting' | 'applied' | 'undone' | 'nothing';

export type WahubTeachChangeStatus = 'pending' | 'applied' | 'undone' | 'rejected';

/** A change as the owner reads it. `before` / `after` are wording ("היה" / "יהיה"), never fields. */
export interface WahubTeachPlain {
  /** "מעכשיו הבוט…" */
  headline: string;
  /** What will be written, in words. */
  rule: string;
  /** "כך הסברת: …" — his own words. */
  why: string;
  /** Nothing was there before: no "היה". */
  is_new: boolean;
  before: string | null;
  after: string | null;
  example_good: string;
  example_bad: string;
}

export interface WahubTeachChange {
  proposal_id: number | null;
  status: WahubTeachChangeStatus;
  status_label: string;
  applied: boolean;
  can_undo: boolean;
  /** Waiting, and what it touches was edited since: "מאשר" would be refused. */
  moved: boolean;
  plain: WahubTeachPlain;
  /** The card of a "דיוק" (action, kind, the fields before and after). Folded details only. */
  technical: Record<string, unknown> | null;
}

/** The example: a typical customer question, what the bot answers today, and what it would answer after. */
export interface WahubTeachPreview {
  question: string;
  before: string | null;
  after: string | null;
  /** A part is still being made: the screen asks GET refine/{id}/preview/ again. */
  pending: boolean;
  /** Said in words when a part could not be made ("לא הצלחתי להכין דוגמה כרגע"). */
  note: string;
}

/** Something the bot already knows that says otherwise. */
export interface WahubTeachConflict {
  title: string;
  why: string;
}

export interface WahubTeachCheckDetail {
  question: string;
  answer: string | null;
  passed: boolean;
  line: string;
}

/** The check that follows an approval: the bot is really asked again. */
export interface WahubTeachCheck {
  ran: number;
  passed: number;
  /** Not finished in time: the screen asks GET refine/{id}/check/ again. */
  pending: boolean;
  lines: string[];
  /** The one sentence to show. */
  summary: string;
  details: WahubTeachCheckDetail[];
  technical: Record<string, unknown> | null;
}

/**
 * Where a teach thread was born (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.4.2): written freely in "ללמד", or
 * opened by "דיוק" inside a conversation — on marked messages, or on an answer of the bot in the shadow.
 * Never a phone: a contact with no name is "מתוך שיחה".
 */
export interface WahubTeachOrigin {
  kind: 'free' | 'conversation' | 'shadow';
  /** "מתוך שיחה עם דנה לוי"; empty for a thread that was written freely. */
  label: string;
  contact_id: number | null;
  /** The way to that conversation, inside the CRM; null when it is gone. */
  link: string | null;
}

/** One marked piece of the conversation a thread was opened on, as it is quoted: who said it, and what. */
export interface WahubTeachQuote {
  id: number | null;
  /** `customer` / `bot` / `new_bot` / `office` / `system` / `shadow`. */
  who: string;
  who_label: string;
  text: string;
}

/** The system's first words on the marked piece, before he has written anything (as in "דיוק"). */
export interface WahubTeachSummary {
  what_happened: string;
  what_was_answered: string;
  suspected_issue: string | null;
}

export interface WahubTeachTechnical {
  model: string | null;
  reason: string | null;
  outcome: string | null;
}

/** A teach thread, as POST refine/, GET refine/{id}/, say/, approve/ and undo/ answer. */
export interface WahubTeachThread {
  id: number;
  status: 'open' | 'done';
  state: WahubTeachState;
  state_label: string;
  /** What he wrote first. */
  text: string;
  /** One or two plain sentences, without "הבנתי כך:". Empty when nobody understood yet. */
  understood: string;
  /** One short question in place of a guess. Then nothing is proposed in the same answer. */
  question: string | null;
  /** Every change of the thread that stands — waiting or kept; when none stands, the ones taken back. */
  changes: WahubTeachChange[];
  preview: WahubTeachPreview | null;
  conflicts: WahubTeachConflict[];
  /** Plain sentences for under the card: why something was not written, or that the bot is not sure. */
  notes: string[];
  needs_approval: boolean;
  needs_answer: boolean;
  can_undo: boolean;
  check: WahubTeachCheck | null;
  /** Everything the bot said in its last answer, as one text. */
  reply: string;
  created_at: string | null;
  created_by_name: string;
  technical: WahubTeachTechnical;
  /** Where the thread was born; absent on a server built before "דיוק" worked with "ללמד". */
  origin?: WahubTeachOrigin;
  /** The marked messages it was opened on, to quote folded ("על מה זה נכתב"). */
  quotes?: WahubTeachQuote[];
  /** The summary that opened it, while it is still the last thing said; null afterwards. */
  summary?: WahubTeachSummary | null;
}

/** One line of "מה לימדת עד היום". */
export interface WahubTeachRow {
  thread: number;
  at: string | null;
  by: string;
  /** Falls back on his own words when nobody understood them yet, so no line is empty. */
  understood: string;
  text: string;
  state: WahubTeachState;
  state_label: string;
  needs_answer: boolean;
  changes_count: number;
  /** Where it was taught from, when it was not written freely: "מתוך שיחה עם …", and the way there. */
  origin?: WahubTeachOrigin;
}

export interface WahubTeachPage {
  count: number;
  /** There is a later page to ask for. */
  more: boolean;
  results: WahubTeachRow[];
}

// ---------------------------------------------------------------------------
// "בדיקות הבוט"
// ---------------------------------------------------------------------------

/** How a run ended. `error` is "לא רץ": the bot did not answer — neither passed nor failed. */
export type WahubEvalStatus = 'running' | 'passed' | 'failed' | 'skipped' | 'error';

export interface WahubEvalEngine {
  /** False: there is no key, and a stand-in bot answers. */
  configured: boolean;
  /** A model's name. Folded details only. */
  model: string;
  judge: boolean;
  label: string;
}

export interface WahubEvalSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** "לא רץ": the bot did not answer three times. */
  not_run: number;
  never_run: number;
  last_run_at: string | null;
}

export interface WahubEvalGroup {
  id: string;
  title: string;
  total: number;
  passed: number;
  failed: number;
}

export interface WahubEvalRule {
  id: string;
  title: string;
}

/** The last finished run of a scenario, as the list carries it. */
export interface WahubEvalLast {
  run_id: number;
  status: WahubEvalStatus;
  status_label: string;
  finished_at: string | null;
  engine: string;
  engine_is_stub: boolean;
  took_ms: number;
  passed_checks: number;
  failed_checks: number;
  not_judged: number;
  /** One line for under a scenario that did not pass. Empty when it passed. */
  headline: string;
}

export interface WahubEvalScenario {
  id: string;
  title: string;
  group: string;
  group_title: string;
  /** One sentence: what is checked. */
  what: string;
  rules: WahubEvalRule[];
  turns: number;
  last: WahubEvalLast | null;
  /** A run that started in the last ten minutes and did not finish: it can be carried on. */
  in_progress: { run_id: number; turns_played: number } | null;
}

export interface WahubEvalListing {
  engine: WahubEvalEngine;
  summary: WahubEvalSummary;
  groups: WahubEvalGroup[];
  scenarios: WahubEvalScenario[];
}

export interface WahubEvalCustomerMessage {
  kind: 'text' | 'voice' | 'image';
  text: string;
}

export interface WahubEvalTool {
  name: string;
  summary: string;
}

export interface WahubEvalTurn {
  turn: number;
  customer: WahubEvalCustomerMessage[];
  /** What the system "sent" before the turn (a reminder, a broadcast); '' when nothing. */
  last_outbound: string;
  /** The bot's whole answer, as it would have been sent. */
  bot: string;
  reasoning: string;
  tools: WahubEvalTool[];
  request_human: boolean;
  request_human_reason: string;
  tags: Array<{ tag: string; details: string }>;
}

export type WahubEvalCheckStatus = 'passed' | 'failed' | 'not_judged';

export interface WahubEvalCheck {
  id: string;
  turn: number;
  kind: 'hard' | 'rubric';
  /** What was checked — which is also what was expected. */
  title: string;
  status: WahubEvalCheckStatus;
  status_label: string;
  /** Plain Hebrew: what was expected and what the bot wrote. Empty when it passed. */
  explain: string;
}

export interface WahubEvalFailure extends WahubEvalCheck {
  customer: WahubEvalCustomerMessage[];
  bot: string;
}

/** One run in full, as POST bot/evals/run/ and GET bot/evals/runs/{id}/ answer. */
export interface WahubEvalRun {
  run_id: number;
  scenario: Omit<WahubEvalScenario, 'last' | 'in_progress'>;
  status: WahubEvalStatus;
  status_label: string;
  done: boolean;
  turns_played: number;
  turns_total: number;
  engine: string;
  engine_is_stub: boolean;
  started_at: string | null;
  finished_at: string | null;
  took_ms: number;
  /** Why it was skipped or did not run. */
  detail: string;
  headline: string;
  counts: { passed: number; failed: number; not_judged: number };
  conversation: WahubEvalTurn[];
  checks: WahubEvalCheck[];
  failures: WahubEvalFailure[];
}
