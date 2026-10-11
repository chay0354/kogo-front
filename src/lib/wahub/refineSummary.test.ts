/**
 * "דיוק" with a smart summary (docs/WAHUB-CONTRACT-POLISH-1.md, ב): "המשך"
 * opens the thread with no words, the system speaks first, and what the
 * operator writes next continues the same thread. The axios instance is mocked,
 * so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import {
  REFINE_START,
  REFINE_TEXT,
  SUMMARY_TEXT,
  awaitsFirstWords,
  readRefineSummary,
  readRefineThread,
  refinePlaceholder,
  refineReducer,
  spokenThreads,
  summaryRows,
  threadTitle,
  type RefineAction,
  type RefineChatState,
} from './refine';
import { startWahubRefine, wantsWordsFirst } from './refineApi';
import { sendRefine, startRefineSummary, type RefineFlowContext } from './refineFlow';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
});

const SUMMARY = {
  what_happened: 'הלקוחה שאלה כמה עולה חוג קפוארה.',
  what_was_answered: 'הבוט ענה 250 ₪ לחודש, והבטיח לבדוק ולחזור לגבי דמי רישום.',
  suspected_issue: 'הבוט הבטיח "אבדוק ואחזור" – הוא לא יכול לחזור.',
};

const REPLY = 'סיכום: הלקוחה שאלה על מחיר, והבוט ענה 250 ₪ והבטיח לחזור. מה לא היה טוב כאן?';

/** The answer to POST refine/ with `text: ""`: the system's opening turn, a summary, and nothing changed. */
function opening(over: Record<string, unknown> = {}) {
  return {
    thread: 9,
    status: 'open',
    reply: REPLY,
    needs_answer: true,
    summary: SUMMARY,
    changes: [],
    turns: [{ role: 'system', text: REPLY, summary: SUMMARY, changes: [], created_at: '2026-10-11T16:00:05+03:00' }],
    ...over,
  };
}

const CHANGE = {
  proposal_id: 51,
  action: 'create',
  item_id: 44,
  kind_label: 'כלל התנהגות',
  title: 'לא מבטיחים "אבדוק ואחזור"',
  before: null,
  after: { body: 'הבוט לא יכול לבדוק ולחזור. כשחסר מידע – מוסרים את טלפון המשרד.' },
  applied: true,
};

/** The answer to the operator's first words, on the same thread. */
function answered(over: Record<string, unknown> = {}) {
  const said = 'הבנתי: ההבטחה לחזור לא טובה. שיניתי: הוספתי כלל התנהגות.';
  return {
    thread: 9,
    status: 'open',
    reply: said,
    needs_answer: false,
    changes: [CHANGE],
    turns: [
      { role: 'system', text: REPLY, summary: SUMMARY, changes: [], created_at: '2026-10-11T16:00:05+03:00' },
      { role: 'operator', text: 'כן, בדיוק', changes: [], created_at: '2026-10-11T16:01:00+03:00' },
      { role: 'system', text: said, changes: [CHANGE], created_at: '2026-10-11T16:01:20+03:00' },
    ],
    ...over,
  };
}

const refused = (data: unknown, status = 400) => ({ response: { status, data } });
const notFound = () => ({ response: { status: 404, data: '<!doctype html><title>Not Found</title>' } });
const noAnswer = () => new Error('timeout of 90000ms exceeded');

/** The small chat without a screen: where it stands, and everything that was said to it. */
function chat(start: RefineChatState = REFINE_START) {
  let state = start;
  const actions: RefineAction[] = [];
  const onChanged = vi.fn();
  const ctx: RefineFlowContext = {
    getState: () => state,
    dispatch: (action) => {
      actions.push(action);
      state = refineReducer(state, action);
    },
    onChanged,
  };
  return { ctx, actions, onChanged, state: () => state };
}

const TARGET = { contactId: 12, messageIds: [105, 106] };

// ---------------------------------------------------------------------------
// Reading the summary
// ---------------------------------------------------------------------------

describe('the smart summary, as the server sends it', () => {
  it('three short texts; nothing looked wrong is null', () => {
    expect(readRefineSummary(SUMMARY)).toEqual(SUMMARY);
    expect(readRefineSummary({ ...SUMMARY, suspected_issue: null })).toEqual({ ...SUMMARY, suspected_issue: null });
    expect(readRefineSummary({ ...SUMMARY, suspected_issue: '  ' })?.suspected_issue).toBeNull();
  });

  it('a line that is missing is empty; a summary with no line at all is no summary', () => {
    expect(readRefineSummary({ what_happened: 'שאל על מחיר' })).toEqual({ what_happened: 'שאל על מחיר', what_was_answered: '', suspected_issue: null });
    for (const raw of [null, undefined, '', 'סיכום', [], {}, { what_happened: '', what_was_answered: ' ', suspected_issue: null }]) {
      expect(readRefineSummary(raw)).toBeNull();
    }
  });

  it('is read from the answer and from the system\'s turn; a line of hers never carries one', () => {
    const thread = readRefineThread(opening())!;
    expect(thread.summary).toEqual(SUMMARY);
    expect(thread.turns[0].summary).toEqual(SUMMARY);
    expect(thread.needs_answer).toBe(true);
    expect(thread.changes).toEqual([]);

    const later = readRefineThread(answered({ turns: [{ role: 'operator', text: 'כן', summary: SUMMARY, changes: [] }] }))!;
    expect(later.turns[0].summary).toBeNull();
    // A server built before the summary sends none: nothing is made up.
    expect(readRefineThread(answered())!.summary).toBeNull();
  });

  it('its three lines stand in one order, each under its small title', () => {
    expect(summaryRows(SUMMARY).map((line) => [line.title, line.text])).toEqual([
      ['מה קרה', SUMMARY.what_happened],
      ['מה נענה', SUMMARY.what_was_answered],
      ['מה נראה לא טוב', SUMMARY.suspected_issue],
    ]);
    expect(SUMMARY_TEXT.ask).toBe('מה לא היה טוב כאן?');
  });

  it('nothing looked wrong (or nobody looked — a summary by the rules): the third line is left out, not made up', () => {
    expect(summaryRows({ ...SUMMARY, suspected_issue: null }).map((line) => line.key)).toEqual(['happened', 'answered']);
  });

  it('a line the server left empty is left out too', () => {
    expect(summaryRows({ what_happened: '', what_was_answered: SUMMARY.what_was_answered, suspected_issue: null }).map((line) => line.key)).toEqual(['answered']);
    expect(summaryRows({ what_happened: ' ', what_was_answered: '', suspected_issue: 'הבוט חזר על עצמו' }).map((line) => line.key)).toEqual(['issue']);
  });
});

// ---------------------------------------------------------------------------
// "המשך": the system speaks first
// ---------------------------------------------------------------------------

describe('"המשך" on marked messages', () => {
  it('opens the thread with no words: POST refine/ carries the contact, the marks and an empty text', async () => {
    api.post.mockResolvedValue({ data: opening() });
    const { ctx } = chat();

    expect(await startRefineSummary(ctx, TARGET)).toBe('summarized');

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/refine/');
    expect(body).toEqual({ contact: 12, message_ids: [105, 106], text: '' });
    // The server reads the conversation and asks the model before it answers.
    expect(config.timeout).toBeGreaterThanOrEqual(60_000);
  });

  it('while the server sums up: "המערכת מסכמת…", and nothing can be sent', async () => {
    let release: (value: unknown) => void = () => {};
    api.post.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { ctx, state } = chat();

    const pending = startRefineSummary(ctx, TARGET);
    expect(state().phase).toBe('summarizing');
    expect(state().bubbles).toEqual([]);
    // A line typed meanwhile is not sent on top of it.
    expect(await sendRefine(ctx, TARGET, 'המחיר לא נכון')).toBe('failed');
    expect(api.post).toHaveBeenCalledTimes(1);

    release({ data: opening() });
    await pending;
    expect(state().phase).toBe('idle');
  });

  it('the answer is one bubble of the system, with the summary, asking — and nothing was changed', async () => {
    api.post.mockResolvedValue({ data: opening() });
    const { ctx, state, actions, onChanged } = chat();

    await startRefineSummary(ctx, TARGET);

    expect(actions.map((action) => action.type)).toEqual(['summarizing', 'answered']);
    expect(state()).toMatchObject({ phase: 'idle', threadId: 9, needsAnswer: true, changes: [], error: '' });
    expect(state().bubbles).toHaveLength(1);
    expect(state().bubbles[0]).toMatchObject({ role: 'system', text: REPLY, pending: false, summary: SUMMARY });
    // The conversation has one more thread to list.
    expect(onChanged).toHaveBeenCalledTimes(1);
    // The question is still the first one, and the box asks it.
    expect(awaitsFirstWords(state())).toBe(true);
    expect(refinePlaceholder(state())).toBe('מה לא היה טוב כאן?');
  });

  it('the summary is taken from the answer when the turn does not carry it — and when there are no turns at all', async () => {
    api.post.mockResolvedValueOnce({ data: opening({ turns: [{ role: 'system', text: REPLY, changes: [] }] }) });
    const first = chat();
    await startRefineSummary(first.ctx, TARGET);
    expect(first.state().bubbles).toHaveLength(1);
    expect(first.state().bubbles[0].summary).toEqual(SUMMARY);

    api.post.mockResolvedValueOnce({ data: opening({ turns: [] }) });
    const second = chat();
    await startRefineSummary(second.ctx, TARGET);
    expect(second.state().bubbles).toEqual([expect.objectContaining({ role: 'system', text: REPLY, summary: SUMMARY })]);
  });

  it('a server that keeps an empty line of hers: it is not shown as something she said', async () => {
    api.post.mockResolvedValue({
      data: opening({ turns: [{ role: 'operator', text: '', changes: [] }, { role: 'system', text: REPLY, summary: SUMMARY, changes: [] }] }),
    });
    const { ctx, state } = chat();
    await startRefineSummary(ctx, TARGET);
    expect(state().bubbles.map((bubble) => bubble.role)).toEqual(['system']);
    expect(awaitsFirstWords(state())).toBe(true);
    // The thread's title in "דיוקים קודמים" is not an empty line either.
    expect(threadTitle(readRefineThread(opening({ turns: [{ role: 'operator', text: '' }, { role: 'system', text: REPLY }] }))!)).toBe(REPLY);
  });

  it('no summary in the answer: the system\'s own words are shown instead', async () => {
    api.post.mockResolvedValue({ data: opening({ summary: undefined, turns: [{ role: 'system', text: REPLY, changes: [] }] }) });
    const { ctx, state } = chat();
    expect(await startRefineSummary(ctx, TARGET)).toBe('summarized');
    expect(state().bubbles).toHaveLength(1);
    expect(state().bubbles[0].text).toBe(REPLY);
    expect(state().bubbles[0].summary ?? null).toBeNull();
    expect(state().needsAnswer).toBe(true);
  });

  it('what she writes next goes to the same thread — POST refine/{id}/say/ — and the summary stays above it', async () => {
    api.post.mockResolvedValueOnce({ data: opening() });
    const { ctx, state, onChanged } = chat();
    await startRefineSummary(ctx, TARGET);

    api.post.mockResolvedValueOnce({ data: answered() });
    expect(await sendRefine(ctx, TARGET, ' כן, בדיוק ')).toBe('sent');

    expect(api.post).toHaveBeenCalledTimes(2);
    const [url, body] = api.post.mock.calls[1];
    expect(url).toBe('/wahub/refine/9/say/');
    expect(body).toEqual({ text: 'כן, בדיוק' });
    expect(state().bubbles.map((bubble) => bubble.role)).toEqual(['system', 'operator', 'system']);
    expect(state().bubbles[0].summary).toEqual(SUMMARY);
    expect(state().bubbles[2].summary ?? null).toBeNull();
    expect(state().bubbles[1].text).toBe('כן, בדיוק');
    // Now a change may be applied — and it is on a card.
    expect(state().changes[0]).toMatchObject({ proposal_id: 51, applied: true });
    expect(state().needsAnswer).toBe(false);
    expect(awaitsFirstWords(state())).toBe(false);
    expect(refinePlaceholder(state())).toBe('רוצים לדייק עוד? כתבו כאן…');
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('a later answer that repeats the thread\'s summary at its top does not turn the answer into a summary', async () => {
    api.post.mockResolvedValueOnce({ data: opening() });
    const { ctx, state } = chat();
    await startRefineSummary(ctx, TARGET);

    // No turns in the answer: the screen keeps what it has and adds the reply.
    api.post.mockResolvedValueOnce({ data: answered({ turns: [], summary: SUMMARY }) });
    await sendRefine(ctx, TARGET, 'כן, בדיוק');
    expect(state().bubbles.map((bubble) => [bubble.role, Boolean(bubble.summary)])).toEqual([
      ['system', true],
      ['operator', false],
      ['system', false],
    ]);
  });

  it('is asked once: a thread that is already open is not opened again', async () => {
    api.post.mockResolvedValue({ data: opening() });
    const { ctx } = chat();
    await startRefineSummary(ctx, TARGET);
    expect(await startRefineSummary(ctx, TARGET)).toBe('failed');
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('is of marked messages of a conversation: with no marks, no conversation, or on a proposal, nothing is asked', async () => {
    for (const target of [
      { contactId: 12, messageIds: [] },
      { contactId: null, messageIds: [105] },
      { contactId: 12, messageIds: [105], proposalId: 204 },
    ]) {
      const { ctx, actions } = chat();
      expect(await startRefineSummary(ctx, target)).toBe('failed');
      expect(actions).toEqual([]);
    }
    expect(api.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// An older server, and a summary that does not come
// ---------------------------------------------------------------------------

describe('a server built before the smart summary', () => {
  it('answers 400 to an empty text: that is "her words first"', () => {
    expect(wantsWordsFirst(refused({ text: ['שדה זה אינו יכול להיות ריק.'] }))).toBe(true);
    expect(wantsWordsFirst(refused({ detail: 'חסר טקסט' }))).toBe(true);
    expect(wantsWordsFirst(notFound())).toBe(false);
    expect(wantsWordsFirst(refused({ detail: 'אין הרשאה' }, 403))).toBe(false);
    expect(wantsWordsFirst(noAnswer())).toBe(false);
  });

  it('the small chat falls back to what it always was: an empty box that waits for her, and no error', async () => {
    api.post.mockRejectedValue(refused({ text: ['שדה זה אינו יכול להיות ריק.'] }));
    const { ctx, state, actions, onChanged } = chat();

    expect(await startRefineSummary(ctx, TARGET)).toBe('skipped');

    expect(actions.map((action) => action.type)).toEqual(['summarizing', 'summarySkipped']);
    expect(state()).toEqual(REFINE_START);
    expect(onChanged).not.toHaveBeenCalled();
    expect(refinePlaceholder(state())).toBe('מה לא היה טוב כאן?');
  });

  it('and her first line then opens the thread as before — POST refine/ with her words', async () => {
    api.post.mockRejectedValueOnce(refused({ detail: 'חסר טקסט' }));
    const { ctx, state } = chat();
    await startRefineSummary(ctx, TARGET);

    api.post.mockResolvedValueOnce({ data: answered({ turns: [{ role: 'operator', text: 'המחיר לא נכון' }, { role: 'system', text: 'הבנתי.' }] }) });
    expect(await sendRefine(ctx, TARGET, 'המחיר לא נכון')).toBe('sent');

    const [url, body] = api.post.mock.calls[1];
    expect(url).toBe('/wahub/refine/');
    expect(body).toEqual({ contact: 12, message_ids: [105, 106], text: 'המחיר לא נכון' });
    expect(state().threadId).toBe(9);
    expect(state().bubbles.map((bubble) => bubble.role)).toEqual(['operator', 'system']);
  });

  it('no refine/ at all (404): "עוד לא זמין", as before', async () => {
    api.post.mockRejectedValue(notFound());
    const { ctx, state } = chat();
    expect(await startRefineSummary(ctx, TARGET)).toBe('unavailable');
    expect(state().phase).toBe('unavailable');
  });
});

describe('a summary that does not come', () => {
  it('no answer: said plainly, and the box is hers — a summary is a help, never a gate', async () => {
    api.post.mockRejectedValue(noAnswer());
    const { ctx, state } = chat();

    expect(await startRefineSummary(ctx, TARGET)).toBe('failed');

    expect(state()).toMatchObject({ phase: 'idle', threadId: null, bubbles: [], error: REFINE_TEXT.summaryFailed });
    // She writes; the thread is opened with her words.
    api.post.mockResolvedValueOnce({ data: answered() });
    expect(await sendRefine(ctx, TARGET, 'המחיר לא נכון')).toBe('sent');
    expect(api.post.mock.calls[1][0]).toBe('/wahub/refine/');
    expect(state().error).toBe('');
  });

  it('a refusal that is not about the empty text says its own reason', async () => {
    api.post.mockRejectedValue(refused({ detail: 'רק מנהלים יכולים לדייק את הבוט' }, 403));
    const { ctx, state } = chat();
    expect(await startRefineSummary(ctx, TARGET)).toBe('failed');
    expect(state().phase).toBe('idle');
    expect(state().error).toContain('רק מנהלים');
  });
});

describe('"דיוקים קודמים בשיחה"', () => {
  it('a thread left at the summary, with no word of hers, is not a refinement and is not listed', () => {
    const left = readRefineThread(opening({ thread: 9 }))!;
    const spoken = readRefineThread(answered({ thread: 10 }))!;
    const older = readRefineThread({ thread: 4, reply: 'הבנתי.', turns: [{ role: 'operator', text: 'הבוט שאל על העיר לפני שענה' }, { role: 'system', text: 'הבנתי.' }] })!;
    expect(spokenThreads([left, spoken, older]).map((thread) => thread.id)).toEqual([10, 4]);
  });

  it('an empty line of hers is not a word', () => {
    const empty = readRefineThread(opening({ turns: [{ role: 'operator', text: '  ' }, { role: 'system', text: REPLY, summary: SUMMARY }] }))!;
    expect(spokenThreads([empty])).toEqual([]);
  });

  it('a thread she answered with "כן, בדיוק" is titled by her words and by what the summary took to be wrong', () => {
    expect(threadTitle(readRefineThread(answered())!)).toBe('כן, בדיוק — הבוט הבטיח "אבדוק ואחזור" – הוא לא יכול לחזור.');
    // Nothing looked wrong to the system: what happened says what the thread was about.
    const plain = { ...SUMMARY, suspected_issue: null };
    const quiet = answered({ turns: [{ role: 'system', text: REPLY, summary: plain }, { role: 'operator', text: 'התשובה ארוכה מדי' }, { role: 'system', text: 'הבנתי.' }] });
    expect(threadTitle(readRefineThread(quiet)!)).toBe('התשובה ארוכה מדי — הלקוחה שאלה כמה עולה חוג קפוארה.');
  });

  it('a long line of hers is still cut to one line; a thread she opened herself is titled as it always was', () => {
    const long = 'המחיר שהבוט אמר לא נכון: חוג קפוארה ברמת גן עולה 280 ₪ לחודש ולא 250, וגם דמי הרישום השתנו השנה';
    const cut = threadTitle(readRefineThread(answered({ turns: [{ role: 'system', text: REPLY, summary: SUMMARY }, { role: 'operator', text: long }] }))!);
    expect(cut).toHaveLength(80);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.startsWith('המחיר שהבוט אמר לא נכון')).toBe(true);
    const own = readRefineThread({ thread: 4, reply: 'הבנתי.', turns: [{ role: 'operator', text: 'הבוט שאל על העיר לפני שענה' }, { role: 'system', text: 'הבנתי.' }] })!;
    expect(threadTitle(own)).toBe('הבוט שאל על העיר לפני שענה');
  });

  it('a row that carries no turns at all stays: nothing is known against it', () => {
    const bare = readRefineThread({ thread: 7, reply: 'הבנתי: המחיר לא נכון.', created_at: '2026-10-10T10:00:00+03:00' })!;
    expect(spokenThreads([bare]).map((thread) => thread.id)).toEqual([7]);
  });
});

describe('the calls', () => {
  it('POST refine/ sends the empty text as it is — it is the mark of "the system speaks first"', async () => {
    api.post.mockResolvedValue({ data: opening() });
    const thread = await startWahubRefine({ contact: 12, message_ids: [105, 106], text: '' });
    expect(api.post.mock.calls[0][1]).toEqual({ contact: 12, message_ids: [105, 106], text: '' });
    expect(thread.summary).toEqual(SUMMARY);
  });
});

describe('the box under the small chat', () => {
  it('asks what was wrong at first, and again right after the summary; then for the answer, then for more', () => {
    expect(refinePlaceholder({ needsAnswer: false, threadId: null })).toBe('מה לא היה טוב כאן?');
    const summarized = refineReducer(REFINE_START, { type: 'answered', thread: readRefineThread(opening())! });
    expect(refinePlaceholder(summarized)).toBe('מה לא היה טוב כאן?');
    const asked = refineReducer(REFINE_START, {
      type: 'answered',
      thread: readRefineThread(answered({ needs_answer: true, changes: [] }))!,
    });
    expect(refinePlaceholder(asked)).toBe('התשובה שלך…');
    expect(refinePlaceholder({ needsAnswer: false, threadId: 9 })).toBe('רוצים לדייק עוד? כתבו כאן…');
  });
});
