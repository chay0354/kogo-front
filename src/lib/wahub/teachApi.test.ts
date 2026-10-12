/**
 * The clients of "ללמד" and "בדיקות", against the two contracts
 * (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, א; docs/WAHUB-CONTRACT-BOT-EVALS.md):
 * which door each call knocks on, what it sends, how long it waits, and how a
 * server that was built before the two screens is told apart from a failure.
 * The axios instance is mocked, so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import {
  EVAL_RUN_TIMEOUT_MS,
  EvalsNotBuilt,
  evalFailureKind,
  evalsNotBuilt,
  fetchWahubEvalRun,
  fetchWahubEvals,
  runWahubEval,
} from './evalsApi';
import {
  TEACH_TIMEOUT_MS,
  TeachNotBuilt,
  approveWahubTeach,
  fetchWahubTeachCheck,
  fetchWahubTeachPage,
  fetchWahubTeachPreview,
  fetchWahubTeachThread,
  sayWahubTeach,
  startWahubTeach,
  teachAlreadySettled,
  teachNotBuilt,
  teachUnanswered,
  undoWahubTeach,
} from './teachApi';
import { rawEvalListing, rawEvalRun, rawTeachCheck, rawTeachPage, rawTeachRow, rawTeachSaved, rawTeachThread } from './teachFixtures';
import { createTinyStore } from './tinyStore';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

function refused(status: number, data: unknown = {}) {
  return { response: { status, data } };
}

describe('"ללמד": the calls', () => {
  it('a new explanation is POST refine/ with his words and nothing else, and is given the long wait', async () => {
    api.post.mockResolvedValue({ data: rawTeachThread() });
    const thread = await startWahubTeach('  כששואלים על מחיר, קודם לשאול על איזה חוג  ');
    expect(api.post).toHaveBeenCalledWith('/wahub/refine/', { text: 'כששואלים על מחיר, קודם לשאול על איזה חוג' }, { timeout: TEACH_TIMEOUT_MS });
    expect(thread.id).toBe(41);
    expect(thread.needs_approval).toBe(true);
    // Up to about 50 seconds each, the contract says: the default 30 would cut a real answer off.
    expect(TEACH_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('"לא בדיוק" and an answer go to say/; "מאשר" to approve/; "בטל" to undo/', async () => {
    api.post.mockResolvedValue({ data: rawTeachThread() });
    await sayWahubTeach(41, ' רק כשהילד חולה ');
    expect(api.post).toHaveBeenLastCalledWith('/wahub/refine/41/say/', { text: 'רק כשהילד חולה' }, { timeout: TEACH_TIMEOUT_MS });

    api.post.mockResolvedValue({ data: { ...rawTeachSaved(), applied: [] } });
    const saved = await approveWahubTeach(41);
    expect(api.post).toHaveBeenLastCalledWith('/wahub/refine/41/approve/', undefined, { timeout: TEACH_TIMEOUT_MS });
    expect(saved.state).toBe('applied');
    expect(saved.check?.summary).toBe('בדקתי שיחה אחת — הבוט עונה נכון');

    api.post.mockResolvedValue({ data: rawTeachThread({ state: 'undone', state_label: 'בוטל', needs_approval: false }) });
    const undone = await undoWahubTeach(41);
    expect(api.post).toHaveBeenLastCalledWith('/wahub/refine/41/undo/', undefined, { timeout: TEACH_TIMEOUT_MS });
    expect(undone.state).toBe('undone');
  });

  it('reads a thread, and the parts that are made a call at a time', async () => {
    api.get.mockResolvedValue({ data: rawTeachThread() });
    expect((await fetchWahubTeachThread(41)).id).toBe(41);
    expect(api.get).toHaveBeenLastCalledWith('/wahub/refine/41/');

    api.get.mockResolvedValue({ data: { thread: 41, preview: { question: 'כמה עולה חוג?', before: 'היום', after: null, pending: true } } });
    expect(await fetchWahubTeachPreview(41)).toMatchObject({ before: 'היום', after: null, pending: true });
    expect(api.get).toHaveBeenLastCalledWith('/wahub/refine/41/preview/', { timeout: TEACH_TIMEOUT_MS });

    api.get.mockResolvedValue({ data: { thread: 41, preview: null } });
    expect(await fetchWahubTeachPreview(41)).toBeNull();

    api.get.mockResolvedValue({ data: { thread: 41, check: rawTeachCheck({ pending: true }) } });
    expect((await fetchWahubTeachCheck(41))?.pending).toBe(true);
    expect(api.get).toHaveBeenLastCalledWith('/wahub/refine/41/check/', { timeout: TEACH_TIMEOUT_MS });
  });

  it('the list is GET refine/?mode=teach, a page at a time', async () => {
    api.get.mockResolvedValue({ data: rawTeachPage([rawTeachRow(3), rawTeachRow(2)], { count: 31, next: 'x' }) });
    const page = await fetchWahubTeachPage();
    expect(api.get).toHaveBeenLastCalledWith('/wahub/refine/', { params: { mode: 'teach' } });
    expect(page).toMatchObject({ count: 31, more: true });
    await fetchWahubTeachPage(3);
    expect(api.get).toHaveBeenLastCalledWith('/wahub/refine/', { params: { mode: 'teach', page: '3' } });
    await fetchWahubTeachPage(1, 500);
    expect(api.get).toHaveBeenLastCalledWith('/wahub/refine/', { params: { mode: 'teach', page_size: '100' } });
  });
});

describe('"ללמד": a server built before it', () => {
  it('answers the list of "דיוק" (a plain array) to mode=teach: told as "not built", never as an empty list', async () => {
    api.get.mockResolvedValue({ data: [] });
    const failure = await fetchWahubTeachPage().catch((error) => error);
    expect(failure).toBeInstanceOf(TeachNotBuilt);
    expect(teachNotBuilt(failure)).toBe(true);
    expect(teachUnanswered(failure)).toBe(false);
  });

  it('refuses words without a conversation, as a "דיוק" would be', async () => {
    api.post.mockRejectedValue(refused(400, { detail: 'איש הקשר לא נמצא.' }));
    const failure = await startWahubTeach('משהו').catch((error) => error);
    expect(teachNotBuilt(failure)).toBe(true);
  });

  it('or has no such door at all, or answers in the shape of "דיוק"', async () => {
    expect(teachNotBuilt(refused(404))).toBe(true);
    expect(teachNotBuilt(refused(405))).toBe(true);
    api.post.mockResolvedValue({ data: { thread: 9, status: 'open', reply: 'הבנתי', needs_answer: false, changes: [], turns: [] } });
    expect(teachNotBuilt(await startWahubTeach('משהו').catch((error) => error))).toBe(true);
  });

  it('a real refusal is not "not built": the server\'s sentence reaches the screen', () => {
    expect(teachNotBuilt(refused(400, { detail: 'נדרש טקסט: מה תרצה להסביר לבוט?' }))).toBe(false);
    expect(teachNotBuilt(refused(500))).toBe(false);
    expect(teachNotBuilt(refused(403, { detail: 'אין הרשאה' }))).toBe(false);
    expect(teachNotBuilt(new Error('timeout'))).toBe(false);
  });

  it('tells no answer at all from an answer, and "nothing left to approve" from a failure', () => {
    expect(teachUnanswered(new Error('timeout of 90000ms exceeded'))).toBe(true);
    expect(teachUnanswered(refused(500))).toBe(false);
    expect(teachAlreadySettled(refused(409, { detail: 'אין כאן שינוי שמחכה לאישור.' }))).toBe(true);
    expect(teachAlreadySettled(refused(400))).toBe(false);
  });
});

describe('"בדיקות": the calls', () => {
  it('reads the list from GET bot/evals/', async () => {
    api.get.mockResolvedValue({ data: rawEvalListing() });
    const listing = await fetchWahubEvals();
    expect(api.get).toHaveBeenCalledWith('/wahub/bot/evals/');
    expect(listing.summary.total).toBe(6);
  });

  it('plays ONE conversation per request; carrying one on sends its run_id', async () => {
    api.post.mockResolvedValue({ data: rawEvalRun({ status: 'running', done: false }) });
    const first = await runWahubEval({ scenario_id: 'order_city_only' });
    expect(api.post).toHaveBeenLastCalledWith('/wahub/bot/evals/run/', { scenario_id: 'order_city_only' }, { timeout: EVAL_RUN_TIMEOUT_MS, signal: undefined });
    expect(first.done).toBe(false);

    const controller = new AbortController();
    api.post.mockResolvedValue({ data: rawEvalRun() });
    const second = await runWahubEval({ scenario_id: 'order_city_only', run_id: 412 }, controller.signal);
    expect(api.post).toHaveBeenLastCalledWith('/wahub/bot/evals/run/', { scenario_id: 'order_city_only', run_id: 412 }, { timeout: EVAL_RUN_TIMEOUT_MS, signal: controller.signal });
    expect(second.done).toBe(true);
    // One request plays for up to about 50 seconds.
    expect(EVAL_RUN_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('opens a kept run without playing it again', async () => {
    api.get.mockResolvedValue({ data: rawEvalRun() });
    const run = await fetchWahubEvalRun(412);
    expect(api.get).toHaveBeenCalledWith('/wahub/bot/evals/runs/412/');
    expect(run.failures).toHaveLength(1);
  });

  it('a server built before the checks: the door is missing, or the answer is something else', async () => {
    expect(evalsNotBuilt(refused(404))).toBe(true);
    expect(evalsNotBuilt(refused(405))).toBe(true);
    expect(evalsNotBuilt(refused(500))).toBe(false);
    expect(evalsNotBuilt(refused(403))).toBe(false);
    api.get.mockResolvedValue({ data: '<!doctype html><title>Not Found</title>' });
    const failure = await fetchWahubEvals().catch((error) => error);
    expect(failure).toBeInstanceOf(EvalsNotBuilt);
    expect(evalsNotBuilt(failure)).toBe(true);
  });

  it('says how a request for one conversation failed', () => {
    expect(evalFailureKind(new Error('Network Error'))).toBe('offline');
    expect(evalFailureKind(refused(401))).toBe('denied');
    expect(evalFailureKind(refused(403))).toBe('denied');
    expect(evalFailureKind(refused(404))).toBe('missing');
    expect(evalFailureKind(refused(400, { detail: 'הריצה לא נמצאה.' }))).toBe('refused');
    expect(evalFailureKind(refused(500))).toBe('refused');
    expect(evalFailureKind(new EvalsNotBuilt())).toBe('missing');
  });
});

describe('a value kept outside the screen', () => {
  it('tells whoever listens when it changes, and only then', () => {
    const store = createTinyStore({ count: 0 });
    const listener = vi.fn();
    const leave = store.subscribe(listener);
    store.set((current) => ({ count: current.count + 1 }));
    expect(store.get()).toEqual({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    // The same value again tells nobody.
    store.set((current) => current);
    expect(listener).toHaveBeenCalledTimes(1);
    leave();
    store.set({ count: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ count: 5 });
  });
});
