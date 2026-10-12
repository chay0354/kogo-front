/**
 * "בדיקות הבוט" — what the screen decides by itself
 * (docs/WAHUB-CONTRACT-BOT-EVALS.md; docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, ג):
 * the big sentence, what failed first, which conversations a press checks,
 * where a run stands and how it goes on when one conversation does not answer,
 * and the words "ללמד" is opened with.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  EVALS_TEXT,
  EVAL_RUN_START,
  MAX_CONTINUES,
  OFFLINE_LIMIT,
  applyRun,
  customerLine,
  estimateMinutes,
  evalHeadline,
  evalRunReducer,
  failuresByTurn,
  groupsOf,
  inGroup,
  lastCheckedText,
  lastOfRun,
  minutesWords,
  needsRecheck,
  outcomeCounts,
  passedFoldTitle,
  readEvalListing,
  readEvalRun,
  runDone,
  runEndLine,
  runEvalQueue,
  runFraction,
  runHint,
  runLine,
  runQueue,
  runTurnLine,
  scenarioBucket,
  sortScenarios,
  summaryOf,
  teachSeed,
  uncheckedFoldTitle,
  uncheckedLabel,
  type EvalFailureKind,
  type EvalQueueItem,
  type EvalRunAction,
  type EvalRunState,
} from './evals';
import { rawEvalLast, rawEvalListing, rawEvalRun, rawEvalScenario } from './teachFixtures';
import type { WahubEvalListing, WahubEvalRun } from '@/types/wahubTeach';

function listing(over: Record<string, unknown> = {}): WahubEvalListing {
  const read = readEvalListing(rawEvalListing(over));
  if (!read) throw new Error('the fixture is not a listing');
  return read;
}

function run(over: Record<string, unknown> = {}): WahubEvalRun {
  const read = readEvalRun(rawEvalRun(over));
  if (!read) throw new Error('the fixture is not a run');
  return read;
}

const NOW = new Date('2026-10-12T15:00:00+03:00');

describe('reading the list', () => {
  it('reads the contract answer: the engine, the totals, the groups and each conversation with its last result', () => {
    const read = listing();
    expect(read.engine).toEqual({ configured: true, model: 'claude-opus-5-5', judge: true, label: 'הבוט עצמו' });
    expect(read.summary).toMatchObject({ total: 6, passed: 3, failed: 1, skipped: 1, not_run: 0, never_run: 1 });
    expect(read.groups.map((group) => group.id)).toEqual(['order', 'money', 'places']);
    expect(read.scenarios).toHaveLength(6);
    expect(read.scenarios[1]).toMatchObject({ id: 'order_city_only', title: 'נותן עיר בלבד', turns: 1 });
    expect(read.scenarios[1].last).toMatchObject({ run_id: 412, status: 'failed', failed_checks: 2 });
    expect(read.scenarios[4].last).toBeNull();
  });

  it('is not a list without the conversations: that is how an older server is told', () => {
    expect(readEvalListing(null)).toBeNull();
    expect(readEvalListing({ detail: 'Not found.' })).toBeNull();
    expect(readEvalListing('<html>')).toBeNull();
  });

  it('counts the totals and the groups itself when the server sends none', () => {
    const read = readEvalListing({ scenarios: rawEvalListing().scenarios });
    expect(read?.summary).toMatchObject({ total: 6, passed: 3, failed: 1, skipped: 1, not_run: 0, never_run: 1 });
    expect(read?.groups).toEqual([
      { id: 'order', title: 'סדר השיחה', total: 3, passed: 2, failed: 1 },
      { id: 'money', title: 'מחיר, ניסיון והרשמה', total: 2, passed: 1, failed: 0 },
      { id: 'places', title: 'סניפים וכתובות', total: 1, passed: 0, failed: 0 },
    ]);
    // Unsaid, the engine counts as connected: the stand-in banner shows only when the server says so.
    expect(read?.engine.configured).toBe(true);
    expect(readEvalListing(rawEvalListing({ engine: { configured: false } }))?.engine.configured).toBe(false);
  });

  it('a conversation with no name is still a row — by its sentence, never by its code name', () => {
    const read = readEvalListing({ scenarios: [rawEvalScenario('order_x', { title: '', what: 'הבוט שואל על העיר' })] });
    expect(read?.scenarios[0].title).toBe('הבוט שואל על העיר');
    expect(readEvalListing({ scenarios: [rawEvalScenario('order_y', { title: '', what: '' })] })?.scenarios[0].title).toBe('שיחת בדיקה');
  });

  it('notes a run that was left in the middle, so it can be carried on', () => {
    const read = readEvalListing({ scenarios: [rawEvalScenario('a', { in_progress: { run_id: 500, turns_played: 2 } })] });
    expect(read?.scenarios[0].in_progress).toEqual({ run_id: 500, turns_played: 2 });
  });
});

describe('reading a run', () => {
  it('reads the conversation, every check, and each failure beside the answer it is about', () => {
    const read = run();
    expect(read).toMatchObject({ run_id: 412, status: 'failed', done: true, turns_played: 1, turns_total: 1 });
    expect(read.conversation[0].customer).toEqual([{ kind: 'text', text: 'פתח תקווה' }]);
    expect(read.conversation[0].tools).toEqual([{ name: 'find_courses', summary: 'חיפוש חוגים בעיר שנאמרה' }]);
    expect(read.checks.map((check) => check.status)).toEqual(['failed', 'passed', 'not_judged']);
    expect(read.failures).toHaveLength(1);
    expect(read.failures[0].bot).toContain('קפוארה');
    expect(failuresByTurn(read).get(1)).toHaveLength(1);
  });

  it('`done` is the server\'s word; a final status says the same when it is missing', () => {
    expect(run({ status: 'running', done: false, finished_at: null }).done).toBe(false);
    expect(run({ done: undefined, status: 'passed' }).done).toBe(true);
    expect(run({ done: undefined, status: 'running' }).done).toBe(false);
    expect(readEvalRun({ run_id: 1, status: 'passed' })).toBeNull();
    expect(readEvalRun({ detail: 'הריצה לא נמצאה.' })).toBeNull();
  });

  it('says what a customer message is when it has no words', () => {
    expect(customerLine({ kind: 'text', text: 'היי' })).toBe('היי');
    expect(customerLine({ kind: 'voice', text: '' })).toBe('הקלטה קולית (בלי תמלול)');
    expect(customerLine({ kind: 'image', text: 'מערכת השעות' })).toBe('תמונה: מערכת השעות');
    expect(customerLine({ kind: 'image', text: '' })).toBe('תמונה');
  });
});

describe('the big sentence', () => {
  it('"N מתוך M שיחות בדיקה עוברות", and under it what did not pass', () => {
    expect(evalHeadline({ total: 45, passed: 42, failed: 3, skipped: 0, not_run: 0, never_run: 0, last_run_at: null })).toEqual({
      passed: 42,
      total: 45,
      text: 'שיחות בדיקה עוברות',
      rest: '3 נכשלו',
    });
    expect(evalHeadline(listing().summary).rest).toBe('אחת נכשלה · אחת דולגה · אחת עוד לא נבדקה');
    expect(evalHeadline({ total: 101, passed: 84, failed: 9, skipped: 3, not_run: 1, never_run: 4, last_run_at: null }).rest).toBe(
      '9 נכשלו · אחת לא רצה · 3 דולגו · 4 עוד לא נבדקו',
    );
  });

  it('says nothing under it when everything passes', () => {
    expect(evalHeadline({ total: 45, passed: 45, failed: 0, skipped: 0, not_run: 0, never_run: 0, last_run_at: null }).rest).toBe('');
  });

  it('before the first check there are no figures to boast: the sentence says they wait', () => {
    expect(evalHeadline({ total: 101, passed: 0, failed: 0, skipped: 0, not_run: 0, never_run: 101, last_run_at: null })).toEqual({
      passed: null,
      total: 101,
      text: '101 שיחות בדיקה מחכות לבדיקה ראשונה',
      rest: '',
    });
    expect(evalHeadline({ total: 0, passed: 0, failed: 0, skipped: 0, not_run: 0, never_run: 0, last_run_at: null }).text).toBe('עוד אין שיחות בדיקה');
  });

  it('says when they were last checked, on Israel\'s clock', () => {
    expect(lastCheckedText('2026-10-12T09:41:07.120394+00:00', NOW)).toBe('נבדק לאחרונה היום ב-12:41');
    expect(lastCheckedText('2026-10-11T18:05:00+00:00', NOW)).toBe('נבדק לאחרונה אתמול ב-21:05');
    expect(lastCheckedText('2026-10-08T07:00:00+00:00', NOW)).toBe('נבדק לאחרונה ב-8.10 ב-10:00');
    expect(lastCheckedText(null, NOW)).toBe(EVALS_TEXT.neverChecked);
    expect(lastCheckedText('not a date', NOW)).toBe(EVALS_TEXT.neverChecked);
  });

  it('counts the totals from the rows, the same way the server does', () => {
    const read = listing();
    expect(summaryOf(read.scenarios)).toEqual(read.summary);
    expect(groupsOf(read.scenarios)).toEqual(read.groups);
  });
});

describe('the list: what failed first', () => {
  it('puts each conversation in its piece: failed, passed, or nobody can say', () => {
    expect(scenarioBucket({ last: null })).toBe('unchecked');
    const read = listing();
    expect(read.scenarios.map(scenarioBucket)).toEqual(['passed', 'failed', 'passed', 'passed', 'unchecked', 'unchecked']);
  });

  it('keeps the server\'s order inside each piece', () => {
    const sections = sortScenarios(listing().scenarios);
    expect(sections.failed.map((scenario) => scenario.id)).toEqual(['order_city_only']);
    expect(sections.passed.map((scenario) => scenario.id)).toEqual(['order_greeting', 'order_step_by_step', 'money_price']);
    expect(sections.unchecked.map((scenario) => scenario.id)).toEqual(['money_sibling', 'places_external']);
  });

  it('says why a conversation was not checked', () => {
    const read = listing();
    expect(uncheckedLabel(read.scenarios[4])).toBe('עוד לא נבדק');
    expect(uncheckedLabel(read.scenarios[5])).toBe('דולג');
    expect(uncheckedLabel({ last: { ...read.scenarios[1].last!, status: 'error' } })).toBe('לא רץ');
  });

  it('narrows to a group; a group that is gone narrows nothing', () => {
    const read = listing();
    expect(inGroup(read.scenarios, 'money').map((scenario) => scenario.id)).toEqual(['money_price', 'money_sibling']);
    expect(inGroup(read.scenarios, null)).toHaveLength(6);
    expect(inGroup(read.scenarios, 'no_such_group')).toHaveLength(6);
  });

  it('titles the folded pieces', () => {
    expect(passedFoldTitle(42)).toBe('42 עברו');
    expect(passedFoldTitle(1)).toBe('אחת עברה');
    expect(uncheckedFoldTitle(8)).toBe('8 לא נבדקו');
    expect(uncheckedFoldTitle(1)).toBe('אחת לא נבדקה');
  });
});

describe('what a press checks', () => {
  it('"בדוק עכשיו" is every conversation on screen, in the server\'s order', () => {
    const queue = runQueue(listing().scenarios, 'all');
    expect(queue.map((item) => item.id)).toEqual(['order_greeting', 'order_city_only', 'order_step_by_step', 'money_price', 'money_sibling', 'places_external']);
    expect(queue[2]).toEqual({ id: 'order_step_by_step', title: 'שיחה שלמה, פרט אחרי פרט', turns: 4, resume: null });
  });

  it('"בדוק רק מה שנכשל" is what failed and what did not run at all', () => {
    const read = listing();
    expect(runQueue(read.scenarios, 'failed').map((item) => item.id)).toEqual(['order_city_only']);
    expect(needsRecheck({ last: null })).toBe(false);
    expect(needsRecheck({ last: { ...read.scenarios[1].last!, status: 'error' } })).toBe(true);
    expect(needsRecheck({ last: { ...read.scenarios[1].last!, status: 'skipped' } })).toBe(false);
    expect(needsRecheck({ last: { ...read.scenarios[1].last!, status: 'passed' } })).toBe(false);
  });

  it('a chosen group narrows the press as well as the list', () => {
    const read = listing();
    expect(runQueue(read.scenarios, 'all', 'money').map((item) => item.id)).toEqual(['money_price', 'money_sibling']);
    expect(runQueue(read.scenarios, 'failed', 'money')).toEqual([]);
  });

  it('carries on a run that was left in the middle instead of starting it again', () => {
    const read = readEvalListing({ scenarios: [rawEvalScenario('a', { in_progress: { run_id: 500, turns_played: 2 } })] });
    expect(runQueue(read!.scenarios, 'all')[0].resume).toBe(500);
  });

  it('says how long a press will take: what each took last time, or a guess from its length', () => {
    expect(estimateMinutes([{ turns: 1, last: null }])).toBe(1);
    // 100 conversations of one turn that were never run: 19 seconds each.
    expect(estimateMinutes(Array.from({ length: 100 }, () => ({ turns: 1, last: null })))).toBe(32);
    const took = readEvalListing({ scenarios: [rawEvalScenario('a', { last: rawEvalLast({ took_ms: 180_000 }) })] })!.scenarios;
    expect(estimateMinutes(took)).toBe(3);
    expect(minutesWords(1)).toBe('כדקה');
    expect(minutesWords(2)).toBe('כשתי דקות');
    expect(minutesWords(8)).toBe('כ-8 דקות');
    expect(minutesWords(32)).toBe('כחצי שעה');
    expect(minutesWords(60)).toBe('כשעה');
    expect(minutesWords(45)).toBe('כ-45 דקות');
    expect(minutesWords(95)).toBe('כ-1.5 שעות');
  });

  it('says under the button what will be checked, that the bot really answers, and that it can be stopped', () => {
    const read = listing();
    const all = runHint(read.scenarios, null);
    expect(all).toContain('ייבדקו כל 6 השיחות');
    expect(all).toContain('אפשר לעצור באמצע');
    expect(runHint(read.scenarios, read.groups[1])).toContain('ייבדקו 2 השיחות של "מחיר, ניסיון והרשמה"');
    expect(runHint(read.scenarios, read.groups[2])).toContain('תיבדק השיחה של "סניפים וכתובות"');
    expect(runHint([], null)).toBe('');
  });
});

const QUEUE: EvalQueueItem[] = [
  { id: 'a', title: 'הורה ששואל על מחיר', turns: 1, resume: null },
  { id: 'b', title: 'שיחה שלמה, פרט אחרי פרט', turns: 4, resume: null },
  { id: 'c', title: 'סניף חיצוני', turns: 1, resume: null },
];

function reduce(actions: EvalRunAction[], from: EvalRunState = EVAL_RUN_START): EvalRunState {
  return actions.reduce(evalRunReducer, from);
}

describe('a run, as the screen follows it', () => {
  const started = reduce([{ type: 'start', queue: QUEUE, scope: 'all', group: null }]);

  it('starts on a press, and a second press while it runs changes nothing', () => {
    expect(started).toMatchObject({ phase: 'running', scope: 'all', group: null, current: null, outcomes: {} });
    expect(evalRunReducer(started, { type: 'start', queue: QUEUE.slice(0, 1), scope: 'failed', group: 'money' })).toBe(started);
    // Nothing to check: nothing starts.
    expect(evalRunReducer(EVAL_RUN_START, { type: 'start', queue: [], scope: 'all', group: null })).toBe(EVAL_RUN_START);
  });

  it('says which conversation is being checked, out of how many', () => {
    const first = reduce([{ type: 'scenario', id: 'a' }], started);
    expect(runLine(first)).toBe('בודק 1 מתוך 3: הורה ששואל על מחיר');
    expect(runTurnLine(first)).toBe('');
    const second = reduce(
      [
        { type: 'outcome', id: 'a', outcome: 'passed' },
        { type: 'scenario', id: 'b' },
      ],
      first,
    );
    expect(runLine(second)).toBe('בודק 2 מתוך 3: שיחה שלמה, פרט אחרי פרט');
    expect(runTurnLine(second)).toBe('תשובה 1 מתוך 4');
    expect(runDone(second)).toBe(1);
  });

  it('follows a conversation of several turns as it answers `running`, and never goes back', () => {
    const inside = reduce(
      [
        { type: 'scenario', id: 'b' },
        { type: 'turns', id: 'b', played: 2, total: 4 },
      ],
      started,
    );
    expect(inside.current).toEqual({ id: 'b', title: 'שיחה שלמה, פרט אחרי פרט', turnsPlayed: 2, turnsTotal: 4 });
    expect(runTurnLine(inside)).toBe('תשובה 3 מתוך 4');
    expect(evalRunReducer(inside, { type: 'turns', id: 'b', played: 1, total: 4 }).current?.turnsPlayed).toBe(2);
    // An answer of a conversation that is no longer the one being checked moves nothing.
    expect(evalRunReducer(inside, { type: 'turns', id: 'a', played: 1, total: 1 })).toBe(inside);
  });

  it('moves the bar by conversations done, and a little by the turns of the one being checked', () => {
    expect(runFraction(started)).toBe(0);
    const inside = reduce(
      [
        { type: 'scenario', id: 'a' },
        { type: 'outcome', id: 'a', outcome: 'passed' },
        { type: 'scenario', id: 'b' },
        { type: 'turns', id: 'b', played: 2, total: 4 },
      ],
      started,
    );
    expect(runFraction(inside)).toBeCloseTo((1 + 0.45) / 3, 5);
    const done = reduce(
      [
        { type: 'outcome', id: 'b', outcome: 'failed' },
        { type: 'outcome', id: 'c', outcome: 'skipped' },
      ],
      inside,
    );
    expect(runFraction(done)).toBe(1);
    expect(runFraction({ queue: [], outcomes: {}, current: null })).toBe(0);
  });

  it('ends by saying how it came out', () => {
    const finished = reduce(
      [
        { type: 'outcome', id: 'a', outcome: 'passed' },
        { type: 'outcome', id: 'b', outcome: 'failed' },
        { type: 'outcome', id: 'c', outcome: 'skipped' },
        { type: 'finish' },
      ],
      started,
    );
    expect(finished.phase).toBe('finished');
    expect(outcomeCounts(finished)).toEqual({ passed: 1, failed: 1, skipped: 1, error: 0, unreached: 0 });
    expect(runEndLine(finished)).toBe('הבדיקה הסתיימה: אחת עברה, אחת נכשלה, אחת לא נבדקה');
    expect(runEndLine(started)).toBe('');
    expect(runEndLine(EVAL_RUN_START)).toBe('');
  });

  it('"עצור" stops at once and says how far it got; what was checked is kept', () => {
    const stopped = reduce(
      [
        { type: 'scenario', id: 'a' },
        { type: 'outcome', id: 'a', outcome: 'passed' },
        { type: 'scenario', id: 'b' },
        { type: 'stop' },
      ],
      started,
    );
    expect(stopped).toMatchObject({ phase: 'stopped', current: null });
    expect(runEndLine(stopped)).toBe('הבדיקה נעצרה. נבדקו 1 מתוך 3: אחת עברה');
    expect(runEndLine(reduce([{ type: 'stop' }], started))).toBe('הבדיקה נעצרה. שום שיחה לא נבדקה');
    // An answer that lands after "עצור" changes nothing.
    expect(evalRunReducer(stopped, { type: 'outcome', id: 'b', outcome: 'failed' })).toBe(stopped);
    expect(evalRunReducer(stopped, { type: 'finish' })).toBe(stopped);
  });

  it('a run the screen stopped by itself says why', () => {
    const halted = reduce([{ type: 'outcome', id: 'a', outcome: 'unreached' }, { type: 'halt', reason: EVALS_TEXT.offline }], started);
    expect(halted.phase).toBe('halted');
    expect(runEndLine(halted)).toBe(`${EVALS_TEXT.offline}. נבדקו 1 מתוך 3: אחת לא נבדקה`);
  });

  it('a run that ended is put away by the next one; one that is going on is not', () => {
    const finished = reduce([{ type: 'finish' }], started);
    expect(evalRunReducer(finished, { type: 'dismiss' })).toBe(EVAL_RUN_START);
    expect(evalRunReducer(started, { type: 'dismiss' })).toBe(started);
    expect(evalRunReducer(finished, { type: 'start', queue: QUEUE.slice(0, 1), scope: 'failed', group: null })).toMatchObject({ phase: 'running', scope: 'failed', outcomes: {} });
  });
});

/** Drives the queue against a scripted server, and keeps what the screen was told. */
function drive(script: (body: { scenario_id: string; run_id?: number }, call: number) => WahubEvalRun | Error, options: { stopAfter?: number; queue?: EvalQueueItem[] } = {}) {
  let state = evalRunReducer(EVAL_RUN_START, { type: 'start', queue: options.queue ?? QUEUE, scope: 'all', group: null });
  const calls: Array<{ scenario_id: string; run_id?: number }> = [];
  const seen: WahubEvalRun[] = [];
  let stopped = false;
  const api = vi.fn(async (body: { scenario_id: string; run_id?: number }) => {
    calls.push(body);
    if (options.stopAfter !== undefined && calls.length > options.stopAfter) stopped = true;
    const answer = script(body, calls.length);
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const done = runEvalQueue({
    queue: options.queue ?? QUEUE,
    run: api,
    dispatch: (action) => {
      state = evalRunReducer(state, action);
    },
    stopped: () => stopped,
    onRun: (answer) => seen.push(answer),
    classify: (error): EvalFailureKind => (error as { kind?: EvalFailureKind }).kind ?? 'refused',
  });
  return { done, calls, seen, state: () => state };
}

function failure(kind: EvalFailureKind): Error {
  return Object.assign(new Error(kind), { kind });
}

function answerFor(id: string, over: Record<string, unknown> = {}): WahubEvalRun {
  return run({ scenario: { ...(rawEvalRun().scenario as object), id }, status: 'passed', status_label: 'עבר', failures: [], ...over });
}

describe('running the queue', () => {
  it('checks one conversation after the other, one request each, and finishes', async () => {
    const drove = drive((body) => answerFor(body.scenario_id, { run_id: 700 }));
    await drove.done;
    expect(drove.calls).toEqual([{ scenario_id: 'a' }, { scenario_id: 'b' }, { scenario_id: 'c' }]);
    expect(drove.state().phase).toBe('finished');
    expect(drove.state().outcomes).toEqual({ a: 'passed', b: 'passed', c: 'passed' });
    expect(drove.seen).toHaveLength(3);
  });

  it('a conversation that answers `running` is sent again with its run_id until it is done', async () => {
    const drove = drive((body, call) => {
      if (body.scenario_id !== 'b') return answerFor(body.scenario_id, { run_id: 700 + call });
      if (body.run_id === undefined) return answerFor('b', { run_id: 413, status: 'running', done: false, turns_played: 2, turns_total: 4 });
      return answerFor('b', { run_id: 413, status: 'failed', done: true, turns_played: 4, turns_total: 4 });
    });
    await drove.done;
    expect(drove.calls).toEqual([{ scenario_id: 'a' }, { scenario_id: 'b' }, { scenario_id: 'b', run_id: 413 }, { scenario_id: 'c' }]);
    expect(drove.state().outcomes.b).toBe('failed');
    expect(drove.state().phase).toBe('finished');
  });

  it('a run left in the middle is carried on from its run_id', async () => {
    const queue = [{ id: 'b', title: 'שיחה', turns: 4, resume: 413 }];
    const drove = drive(() => answerFor('b', { run_id: 413 }), { queue });
    await drove.done;
    expect(drove.calls).toEqual([{ scenario_id: 'b', run_id: 413 }]);
  });

  it('a run the server no longer has is started again, once', async () => {
    const queue = [{ id: 'b', title: 'שיחה', turns: 4, resume: 413 }];
    const drove = drive((body) => (body.run_id === 413 ? failure('refused') : answerFor('b', { run_id: 900 })), { queue });
    await drove.done;
    expect(drove.calls).toEqual([{ scenario_id: 'b', run_id: 413 }, { scenario_id: 'b' }]);
    expect(drove.state().outcomes.b).toBe('passed');
  });

  it('a conversation that does not answer does not stop the rest', async () => {
    const drove = drive((body) => (body.scenario_id === 'b' ? failure('refused') : answerFor(body.scenario_id, { run_id: 700 })));
    await drove.done;
    expect(drove.state().outcomes).toEqual({ a: 'passed', b: 'unreached', c: 'passed' });
    expect(drove.state().phase).toBe('finished');
    expect(runEndLine(drove.state())).toBe('הבדיקה הסתיימה: 2 עברו, אחת לא נבדקה');
  });

  it('no answer in the middle of a conversation: it is asked once more, because its turns are kept on the server', async () => {
    let dropped = false;
    const drove = drive((body) => {
      if (body.scenario_id !== 'b') return answerFor(body.scenario_id, { run_id: 700 });
      if (body.run_id === undefined) return answerFor('b', { run_id: 413, status: 'running', done: false, turns_played: 2, turns_total: 4 });
      if (!dropped) {
        dropped = true;
        return failure('offline');
      }
      return answerFor('b', { run_id: 413, done: true, turns_played: 4, turns_total: 4 });
    });
    await drove.done;
    expect(drove.calls.filter((call) => call.scenario_id === 'b')).toEqual([{ scenario_id: 'b' }, { scenario_id: 'b', run_id: 413 }, { scenario_id: 'b', run_id: 413 }]);
    expect(drove.state().outcomes.b).toBe('passed');
  });

  it('three conversations in a row with no answer at all: there is no connection, and the run stops by itself', async () => {
    const queue = Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, title: `שיחה ${index}`, turns: 1, resume: null }));
    const drove = drive(() => failure('offline'), { queue });
    await drove.done;
    expect(drove.calls).toHaveLength(OFFLINE_LIMIT);
    expect(drove.state()).toMatchObject({ phase: 'halted', halt: EVALS_TEXT.offline });
    expect(runDone(drove.state())).toBe(OFFLINE_LIMIT);
  });

  it('a server that refuses the user, or has no such door, stops the run at once', async () => {
    const denied = drive(() => failure('denied'));
    await denied.done;
    expect(denied.calls).toHaveLength(1);
    expect(denied.state()).toMatchObject({ phase: 'halted', halt: EVALS_TEXT.denied });
    const missing = drive(() => failure('missing'));
    await missing.done;
    expect(missing.state()).toMatchObject({ phase: 'halted', halt: EVALS_TEXT.notBuiltTitle });
  });

  it('"עצור" in the middle: nothing more is sent, and the answer that was in the air is dropped', async () => {
    // "עצור" lands while the second request is in the air.
    const drove = drive((body) => answerFor(body.scenario_id, { run_id: 700 }), { stopAfter: 1 });
    await drove.done;
    expect(drove.calls).toEqual([{ scenario_id: 'a' }, { scenario_id: 'b' }]);
    expect(drove.state().outcomes).toEqual({ a: 'passed' });
    expect(drove.seen).toHaveLength(1);
    // The run itself is marked stopped by the press, not by the loop.
    expect(drove.state().phase).toBe('running');
  });

  it('a conversation that never finishes is given up after a ceiling, and the rest go on', async () => {
    const drove = drive((body) =>
      body.scenario_id === 'b' ? answerFor('b', { run_id: 413, status: 'running', done: false, turns_played: 1, turns_total: 4 }) : answerFor(body.scenario_id, { run_id: 700 }),
    );
    await drove.done;
    expect(drove.calls.filter((call) => call.scenario_id === 'b')).toHaveLength(MAX_CONTINUES + 1);
    expect(drove.state().outcomes).toEqual({ a: 'passed', b: 'unreached', c: 'passed' });
    expect(drove.state().phase).toBe('finished');
  });
});

describe('the list, kept right while a run changes it', () => {
  it('a finished run becomes its conversation\'s last result, and the totals are counted again', () => {
    const before = listing();
    const passed = run({ status: 'passed', status_label: 'עבר', failures: [], headline: '', counts: { passed: 25, failed: 0, not_judged: 0 }, run_id: 900 });
    const after = applyRun(before, passed);
    expect(after.scenarios[1].last).toMatchObject({ run_id: 900, status: 'passed', headline: '' });
    expect(after.summary).toMatchObject({ passed: 4, failed: 0 });
    expect(after.groups[0]).toEqual({ id: 'order', title: 'סדר השיחה', total: 3, passed: 3, failed: 0 });
    expect(sortScenarios(after.scenarios).failed).toEqual([]);
    // The list it came from is not touched.
    expect(before.scenarios[1].last?.status).toBe('failed');
  });

  it('a run still under way is noted on its row, and changes no figure', () => {
    const before = listing();
    const going = run({ status: 'running', done: false, run_id: 901, turns_played: 2, turns_total: 4, scenario: { ...(rawEvalRun().scenario as object), id: 'order_step_by_step' } });
    const after = applyRun(before, going);
    expect(after.scenarios[2].in_progress).toEqual({ run_id: 901, turns_played: 2 });
    expect(after.scenarios[2].last?.run_id).toBe(413);
    expect(after.summary).toEqual(before.summary);
  });

  it('a run of a conversation the list does not have changes nothing', () => {
    const before = listing();
    expect(applyRun(before, run({ scenario: { ...(rawEvalRun().scenario as object), id: 'unknown' } }))).toBe(before);
  });

  it('the line under a row that did not pass is the first failure; for one that did not run, why', () => {
    expect(lastOfRun(run()).headline).toContain('קודם מבררים');
    expect(lastOfRun(run({ headline: '' })).headline).toContain('קודם מבררים');
    expect(lastOfRun(run({ status: 'error', headline: '', failures: [], detail: 'הבוט לא ענה בתור 1' })).headline).toBe('הבוט לא ענה בתור 1');
    expect(lastOfRun(run({ status: 'passed', headline: '', failures: [], detail: '' })).headline).toBe('');
  });
});

describe('from a failure to "ללמד"', () => {
  it('opens with what the customer wrote, what the bot answered, and what was expected — for him to finish', () => {
    expect(teachSeed(run())).toBe(
      ['כשלקוח כותב "פתח תקווה"', 'הבוט ענה: "בפתח תקווה יש לנו *קפוארה* בימי שני ב-17:00 (₪260)"', 'בשיחה כזאת ציפיתי שהבוט שואל באיזה תחום מדובר לפני שהוא מציע חוגים.'].join('\n'),
    );
  });

  it('joins a burst of messages, and clips a long answer', () => {
    const seed = teachSeed(
      run({
        failures: [
          {
            ...(rawEvalRun().failures as Array<Record<string, unknown>>)[0],
            customer: [
              { kind: 'text', text: 'ויש לי גם ילד בן 5.' },
              { kind: 'voice', text: '' },
            ],
            bot: 'א'.repeat(600),
          },
        ],
      }),
    );
    expect(seed).toContain('כשלקוח כותב "ויש לי גם ילד בן 5. / הקלטה קולית (בלי תמלול)"');
    expect(seed.split('\n')[1].length).toBeLessThan(340);
    expect(seed).toContain('…');
  });

  it('with no failure to quote, it starts from what the conversation checks', () => {
    const seed = teachSeed(run({ failures: [], scenario: { ...(rawEvalRun().scenario as object), what: 'אין מחיר שלא מהמערכת' } }));
    expect(seed).toContain('כשלקוח כותב "פתח תקווה"');
    expect(seed).toContain('בשיחה כזאת ציפיתי ש: אין מחיר שלא מהמערכת.');
    expect(teachSeed(run({ failures: [], conversation: [], scenario: { ...(rawEvalRun().scenario as object), what: '' } }))).toBe('בשיחה כמו "נותן עיר בלבד"\nבשיחה כזאת ציפיתי ש');
  });
});
