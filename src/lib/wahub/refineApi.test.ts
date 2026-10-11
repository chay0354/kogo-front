/**
 * The client of "דיוק" and of the auto-apply switch, against the contract
 * (docs/WAHUB-CONTRACT-REFINE.md, א): which door each call knocks on, what it
 * sends, how the answer is read — and what the small chat does with it, step
 * by step. The axios instance is mocked, so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import { fetchWahubReviewSummary } from '../wahubApi';
import { REFINE_START, REFINE_TEXT, changeState, refineReducer, type RefineAction, type RefineChatState } from './refine';
import {
  fetchWahubRefineThread,
  fetchWahubRefineThreads,
  fetchWahubReviewSettings,
  isNotBuiltYet,
  isUnanswered,
  patchWahubReviewSettings,
  sayWahubRefine,
  startWahubRefine,
  undoWahubProposal,
  undoWahubRefine,
} from './refineApi';
import { openRefineThread, sendRefine, undoRefineChange, type RefineFlowContext } from './refineFlow';
import { makeProposal } from './testFixtures';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
});

const CHANGE = {
  proposal_id: 51,
  action: 'update',
  item_id: 7,
  kind_label: 'עובדה',
  title: 'מחיר חוג קפוארה',
  before: { body: 'החוג עולה 250 ₪ לחודש.' },
  after: { body: 'החוג עולה 280 ₪ לחודש.' },
  applied: true,
};

function answer(over: Record<string, unknown> = {}) {
  return {
    thread: 9,
    status: 'open',
    reply: 'הבנתי: המחיר לא נכון. שיניתי: מחיר חוג הקפוארה הוא 280 ₪.',
    needs_answer: false,
    changes: [CHANGE],
    turns: [
      { role: 'operator', text: 'המחיר לא נכון, זה 280', changes: [], created_at: '2026-10-11T13:00:00+03:00' },
      { role: 'system', text: 'הבנתי: המחיר לא נכון. שיניתי: מחיר חוג הקפוארה הוא 280 ₪.', changes: [CHANGE], created_at: '2026-10-11T13:00:20+03:00' },
    ],
    ...over,
  };
}

const notFound = () => ({ response: { status: 404, data: '<!doctype html><title>Not Found</title>' } });
const refused = (detail: string, status = 400) => ({ response: { status, data: { detail } } });
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

const TARGET = { contactId: 12, messageIds: [101, 102, 104] };

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

describe('the calls of "דיוק"', () => {
  it('POST refine/ carries the contact, the marked messages in order, and what she wrote', async () => {
    api.post.mockResolvedValue({ data: answer() });

    const thread = await startWahubRefine({ contact: 12, message_ids: [101, 102, 104], text: '  המחיר לא נכון, זה 280  ' });

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/refine/');
    expect(body).toEqual({ contact: 12, message_ids: [101, 102, 104], text: 'המחיר לא נכון, זה 280' });
    // The server asks the model before it answers: the call is given the time.
    expect(config.timeout).toBeGreaterThanOrEqual(60_000);
    expect(thread.id).toBe(9);
    expect(thread.changes[0]).toMatchObject({ proposal_id: 51, applied: true });
  });

  it('"לתקן" on a shadow reply also names the reply (it was never sent, so it is not a message)', async () => {
    api.post.mockResolvedValue({ data: answer() });
    await startWahubRefine({ contact: 12, message_ids: [101], text: 'לא נכון', shadow_ids: [31] });
    expect(api.post.mock.calls[0][1]).toEqual({ contact: 12, message_ids: [101], text: 'לא נכון', shadow_ids: [31] });
  });

  it('"דיוק" on a proposal sends the proposal and the words — no contact, no messages', async () => {
    api.post.mockResolvedValue({ data: answer() });
    await startWahubRefine({ proposal: 204, text: ' רק כשהלקוח כבר ענה על העיר ' });
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/refine/');
    expect(body).toEqual({ proposal: 204, text: 'רק כשהלקוח כבר ענה על העיר' });
  });

  it('POST refine/{id}/say/ carries the next line', async () => {
    api.post.mockResolvedValue({ data: answer({ reply: 'הבנתי: התכוונת לרמת גן.' }) });
    const thread = await sayWahubRefine(9, ' לא, התכוונתי לרמת גן ');
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/refine/9/say/');
    expect(body).toEqual({ text: 'לא, התכוונתי לרמת גן' });
    expect(thread.reply).toBe('הבנתי: התכוונת לרמת גן.');
  });

  it('POST refine/{id}/undo/ — the thread when the server sends one, nothing otherwise', async () => {
    api.post.mockResolvedValueOnce({ data: answer({ changes: [{ ...CHANGE, applied: false }] }) });
    const thread = await undoWahubRefine(9);
    expect(api.post.mock.calls[0][0]).toBe('/wahub/refine/9/undo/');
    expect(thread?.changes[0].applied).toBe(false);

    api.post.mockResolvedValueOnce({ data: { detail: 'בוטל' } });
    expect(await undoWahubRefine(9)).toBeNull();
  });

  it('GET refine/?contact= lists the conversation\'s earlier threads; GET refine/{id}/ reads one', async () => {
    api.get.mockResolvedValueOnce({ data: [{ id: 4, contact: 12, message_ids: [1], status: 'done', created_at: '2026-10-10T10:00:00+03:00', turns: [] }] });
    const threads = await fetchWahubRefineThreads(12);
    const [url, config] = api.get.mock.calls[0];
    expect(url).toBe('/wahub/refine/');
    expect(config.params).toEqual({ contact: '12' });
    expect(threads.map((thread) => thread.id)).toEqual([4]);

    api.get.mockResolvedValueOnce({ data: answer({ thread: { id: 4, message_ids: [1] } }) });
    const one = await fetchWahubRefineThread(4);
    expect(api.get.mock.calls[1][0]).toBe('/wahub/refine/4/');
    expect(one.message_ids).toEqual([1]);
  });

  it('an answer that is not a thread is a failure, not an empty chat', async () => {
    api.post.mockResolvedValue({ data: { detail: 'ok' } });
    await expect(startWahubRefine({ contact: 12, message_ids: [1], text: 'x' })).rejects.toThrow();
  });

  it('POST review/proposals/{id}/undo/ takes one applied change back', async () => {
    api.post.mockResolvedValueOnce({ data: makeProposal(51, { status: 'undone', status_label: 'בוטל' }) });
    const proposal = await undoWahubProposal(51);
    expect(api.post.mock.calls[0][0]).toBe('/wahub/review/proposals/51/undo/');
    expect(proposal).toMatchObject({ id: 51, status_label: 'בוטל' });

    api.post.mockResolvedValueOnce({ data: { proposal: makeProposal(52, { status: 'undone' }), item: { id: 7 } } });
    expect((await undoWahubProposal(52))?.id).toBe(52);

    api.post.mockResolvedValueOnce({ data: {} });
    expect(await undoWahubProposal(53)).toBeNull();
  });

  it('GET and PATCH settings/review/ read and set the one switch', async () => {
    api.get.mockResolvedValue({ data: { auto_apply: false } });
    expect(await fetchWahubReviewSettings()).toEqual({ auto_apply: false });
    expect(api.get.mock.calls[0][0]).toBe('/wahub/settings/review/');

    api.patch.mockResolvedValue({ data: { auto_apply: true } });
    expect(await patchWahubReviewSettings(true)).toEqual({ auto_apply: true });
    const [url, body] = api.patch.mock.calls[0];
    expect(url).toBe('/wahub/settings/review/');
    expect(body).toEqual({ auto_apply: true });
  });

  it('review/summary/ gives how many were applied by themselves, and where the switch stands', async () => {
    api.get.mockResolvedValueOnce({ data: { pending: 2, applied_7d: 5, rejected_7d: 1, auto_mode: true, auto_applied_7d: 4, auto_apply: true } });
    expect(await fetchWahubReviewSummary()).toMatchObject({ pending: 2, auto_applied_7d: 4, auto_apply: true });

    // A server built before auto-apply: the two are unknown, not zero and off.
    api.get.mockResolvedValueOnce({ data: { pending: 2, applied_7d: 5, rejected_7d: 1, auto_mode: false } });
    const older = await fetchWahubReviewSummary();
    expect(older.auto_applied_7d).toBeUndefined();
    expect(older.auto_apply).toBeUndefined();
  });

  it('tells "not built yet" and "no answer" from an ordinary refusal', () => {
    expect(isNotBuiltYet(notFound())).toBe(true);
    expect(isNotBuiltYet(refused('אין הרשאה', 403))).toBe(false);
    expect(isUnanswered(noAnswer())).toBe(true);
    expect(isUnanswered(notFound())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The small chat, step by step
// ---------------------------------------------------------------------------

describe('writing in the small chat', () => {
  it('the first line opens the thread on the marked messages, with her words', async () => {
    api.post.mockResolvedValue({ data: answer() });
    const { ctx, state, onChanged } = chat();

    const result = await sendRefine(ctx, TARGET, 'המחיר לא נכון, זה 280');

    expect(result).toBe('sent');
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/refine/');
    expect(body).toEqual({ contact: 12, message_ids: [101, 102, 104], text: 'המחיר לא נכון, זה 280' });
    expect(state().threadId).toBe(9);
    expect(state().bubbles.map((bubble) => bubble.role)).toEqual(['operator', 'system']);
    expect(state().bubbles[1].text).toContain('הבנתי');
    expect(state().changes).toHaveLength(1);
    expect(changeState(state().changes[0])).toBe('applied');
    // The knowledge changed: whoever lists it reads again.
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('"לתקן" on a shadow reply: the reply is named beside the customer\'s message', async () => {
    api.post.mockResolvedValue({ data: answer() });
    const { ctx } = chat();
    await sendRefine(ctx, { contactId: 12, messageIds: [101], shadowId: 31 }, 'שיעור ניסיון הוא לא בחינם');
    expect(api.post.mock.calls[0][1]).toEqual({ contact: 12, message_ids: [101], text: 'שיעור ניסיון הוא לא בחינם', shadow_ids: [31] });
  });

  it('while the system is thinking the line shows, and a second Enter sends nothing', async () => {
    let release: (value: unknown) => void = () => {};
    api.post.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { ctx, state } = chat();

    const first = sendRefine(ctx, TARGET, 'המחיר לא נכון');
    expect(state().phase).toBe('thinking');
    expect(state().bubbles).toEqual([{ key: 'p0', role: 'operator', text: 'המחיר לא נכון', pending: true }]);

    expect(await sendRefine(ctx, TARGET, 'המחיר לא נכון')).toBe('failed');
    expect(api.post).toHaveBeenCalledTimes(1);

    release({ data: answer() });
    expect(await first).toBe('sent');
    expect(state().phase).toBe('idle');
  });

  it('an empty line is not sent', async () => {
    const { ctx } = chat();
    expect(await sendRefine(ctx, TARGET, '   ')).toBe('failed');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('every line after the first continues the thread (say/)', async () => {
    api.post.mockResolvedValueOnce({ data: answer() });
    const { ctx, state } = chat();
    await sendRefine(ctx, TARGET, 'המחיר לא נכון, זה 280');

    const corrected = { ...CHANGE, after: { body: 'ברמת גן החוג עולה 280 ₪ לחודש.' } };
    api.post.mockResolvedValueOnce({
      data: answer({
        reply: 'הבנתי: רק ברמת גן. שיניתי: המחיר ברמת גן 280 ₪.',
        changes: [corrected],
        turns: [
          { role: 'operator', text: 'המחיר לא נכון, זה 280', changes: [] },
          { role: 'system', text: 'הבנתי: המחיר לא נכון. שיניתי: מחיר חוג הקפוארה הוא 280 ₪.', changes: [CHANGE] },
          { role: 'operator', text: 'לא, רק ברמת גן', changes: [] },
          { role: 'system', text: 'הבנתי: רק ברמת גן. שיניתי: המחיר ברמת גן 280 ₪.', changes: [corrected] },
        ],
      }),
    });
    expect(await sendRefine(ctx, TARGET, 'לא, רק ברמת גן')).toBe('sent');

    expect(api.post).toHaveBeenCalledTimes(2);
    const [url, body] = api.post.mock.calls[1];
    expect(url).toBe('/wahub/refine/9/say/');
    expect(body).toEqual({ text: 'לא, רק ברמת גן' });
    expect(state().bubbles).toHaveLength(4);
    expect(state().changes).toHaveLength(1);
    expect(state().changes[0].after).toEqual({ body: 'ברמת גן החוג עולה 280 ₪ לחודש.' });
  });

  it('a question: nothing is applied, and her next line is the answer to it', async () => {
    api.post.mockResolvedValueOnce({
      data: answer({
        reply: 'לאיזה סניף הכוונה – רמת גן או יהוד?',
        needs_answer: true,
        changes: [],
        turns: [
          { role: 'operator', text: 'המחיר לא נכון', changes: [] },
          { role: 'system', text: 'לאיזה סניף הכוונה – רמת גן או יהוד?', changes: [] },
        ],
      }),
    });
    const { ctx, state } = chat();
    await sendRefine(ctx, TARGET, 'המחיר לא נכון');

    expect(state().needsAnswer).toBe(true);
    expect(state().changes).toEqual([]);
    expect(state().bubbles[1].text).toBe('לאיזה סניף הכוונה – רמת גן או יהוד?');

    api.post.mockResolvedValueOnce({ data: answer() });
    await sendRefine(ctx, TARGET, 'רמת גן');
    expect(api.post.mock.calls[1][0]).toBe('/wahub/refine/9/say/');
    expect(api.post.mock.calls[1][1]).toEqual({ text: 'רמת גן' });
    expect(state().needsAnswer).toBe(false);
    expect(changeState(state().changes[0])).toBe('applied');
  });

  it('a server without refine/ (404) is "עוד לא זמין" — never the raw error', async () => {
    api.post.mockRejectedValue(notFound());
    const { ctx, state, onChanged } = chat();

    expect(await sendRefine(ctx, TARGET, 'המחיר לא נכון')).toBe('unavailable');

    expect(state().phase).toBe('unavailable');
    expect(state().error).toBe('');
    expect(state().bubbles).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
    // And nothing more is sent from here.
    expect(await sendRefine(ctx, TARGET, 'שוב')).toBe('failed');
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('no answer at all: the outcome is unknown, and she is told to look before sending again', async () => {
    api.post.mockRejectedValue(noAnswer());
    const { ctx, state, onChanged } = chat();

    expect(await sendRefine(ctx, TARGET, 'המחיר לא נכון')).toBe('unknown');

    expect(state().phase).toBe('idle');
    expect(state().error).toBe(REFINE_TEXT.unknown);
    expect(state().bubbles).toEqual([]);
    // The earlier threads are read again: the refinement may be among them.
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('a refusal says the server\'s own reason', async () => {
    api.post.mockRejectedValue(refused('רק מנהל יכול לדייק את הבוט.', 403));
    const { ctx, state } = chat();
    expect(await sendRefine(ctx, TARGET, 'המחיר לא נכון')).toBe('failed');
    expect(state().error).toBe('רק מנהל יכול לדייק את הבוט.');
    expect(state().phase).toBe('idle');
  });

  it('a thread the server no longer finds is a refusal, not "עוד לא זמין"', async () => {
    api.post.mockResolvedValueOnce({ data: answer() });
    const { ctx, state } = chat();
    await sendRefine(ctx, TARGET, 'המחיר לא נכון');
    api.post.mockRejectedValueOnce(notFound());
    expect(await sendRefine(ctx, TARGET, 'ועוד משהו')).toBe('failed');
    expect(state().phase).toBe('idle');
    expect(state().error).toBe(REFINE_TEXT.failed);
  });
});

describe('"דיוק" on a proposal', () => {
  const ON_PROPOSAL = { contactId: 14, messageIds: [], proposalId: 204 };

  it('the first line opens the thread on the proposal itself', async () => {
    const reply = 'הבנתי: הכלל חל רק אחרי שהלקוח ענה. שיניתי: עדכנתי את ההצעה.';
    api.post.mockResolvedValue({
      data: answer({
        reply,
        turns: [
          { role: 'operator', text: 'רק כשהלקוח כבר ענה על העיר', changes: [] },
          { role: 'system', text: reply, changes: [CHANGE] },
        ],
      }),
    });
    const { ctx, state, onChanged } = chat();

    expect(await sendRefine(ctx, ON_PROPOSAL, 'רק כשהלקוח כבר ענה על העיר')).toBe('sent');

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/refine/');
    expect(body).toEqual({ proposal: 204, text: 'רק כשהלקוח כבר ענה על העיר' });
    expect(body).not.toHaveProperty('contact');
    expect(body).not.toHaveProperty('message_ids');
    expect(state().bubbles[1].text).toContain('עדכנתי את ההצעה');
    // The proposal itself changed: its card is read again.
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('a proposal that came from no conversation can be refined all the same', async () => {
    api.post.mockResolvedValue({ data: answer() });
    const { ctx } = chat();
    expect(await sendRefine(ctx, { contactId: null, messageIds: [], proposalId: 204 }, 'לנסח קצר יותר')).toBe('sent');
    expect(api.post.mock.calls[0][1]).toEqual({ proposal: 204, text: 'לנסח קצר יותר' });
  });

  it('the next line continues the same thread', async () => {
    api.post.mockResolvedValue({ data: answer() });
    const { ctx } = chat();
    await sendRefine(ctx, ON_PROPOSAL, 'רק כשהלקוח כבר ענה על העיר');
    await sendRefine(ctx, ON_PROPOSAL, 'וגם על הגיל');
    expect(api.post.mock.calls[1][0]).toBe('/wahub/refine/9/say/');
    expect(api.post.mock.calls[1][1]).toEqual({ text: 'וגם על הגיל' });
  });

  it('with neither a proposal nor a conversation there is nothing to open, and nothing is sent', async () => {
    const { ctx, state } = chat();
    expect(await sendRefine(ctx, { contactId: null, messageIds: [] }, 'משהו')).toBe('failed');
    expect(api.post).not.toHaveBeenCalled();
    expect(state().bubbles).toEqual([]);
  });
});

describe('"בטל" on a change card', () => {
  async function answered(changes: unknown[] = [CHANGE]) {
    api.post.mockResolvedValueOnce({ data: answer({ changes }) });
    const session = chat();
    await sendRefine(session.ctx, TARGET, 'המחיר לא נכון, זה 280');
    api.post.mockClear();
    session.onChanged.mockClear();
    return session;
  }

  it('the only change of the thread: refine/{id}/undo/, and the card is marked "בוטל"', async () => {
    const { ctx, state, onChanged } = await answered();
    api.post.mockResolvedValueOnce({ data: answer({ changes: [{ ...CHANGE, applied: false }] }) });

    expect(await undoRefineChange(ctx, 0)).toBe(true);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/wahub/refine/9/undo/');
    expect(changeState(state().changes[0])).toBe('undone');
    expect(state().undoing).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
    // Taken back once: there is nothing left to take back.
    expect(await undoRefineChange(ctx, 0)).toBe(false);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('one of several: only that card\'s proposal is taken back, the other stays', async () => {
    const { ctx, state } = await answered([CHANGE, { ...CHANGE, proposal_id: 52, title: 'מחיר חוג אקרובטיקה' }]);
    api.post.mockResolvedValueOnce({ data: makeProposal(52, { status: 'undone', status_label: 'בוטל' }) });

    expect(await undoRefineChange(ctx, 1)).toBe(true);

    expect(api.post.mock.calls[0][0]).toBe('/wahub/review/proposals/52/undo/');
    expect(state().changes.map(changeState)).toEqual(['applied', 'undone']);
  });

  it('a refusal leaves the card applied and says why', async () => {
    const { ctx, state, onChanged } = await answered();
    api.post.mockRejectedValueOnce(refused('הרשומה שונתה מאז; אי אפשר לבטל.', 409));

    expect(await undoRefineChange(ctx, 0)).toBe(false);

    expect(changeState(state().changes[0])).toBe('applied');
    expect(state().error).toBe('הרשומה שונתה מאז; אי אפשר לבטל.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a change the server says cannot be taken back is not asked to be', async () => {
    const { ctx } = await answered([{ ...CHANGE, can_undo: false }]);
    expect(await undoRefineChange(ctx, 0)).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a change that was never applied has nothing to take back', async () => {
    const { ctx } = await answered([{ ...CHANGE, applied: false }]);
    expect(await undoRefineChange(ctx, 0)).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('an earlier thread of the same conversation', () => {
  it('is read from GET refine/{id}/ and can be continued with say/', async () => {
    api.get.mockResolvedValue({ data: answer({ thread: { id: 4, message_ids: [1, 2] } }) });
    const { ctx, state } = chat();

    expect(await openRefineThread(ctx, 4)).toBe(true);

    expect(api.get.mock.calls[0][0]).toBe('/wahub/refine/4/');
    expect(state().threadId).toBe(4);
    expect(state().openedMessageIds).toEqual([1, 2]);
    expect(state().bubbles).toHaveLength(2);

    api.post.mockResolvedValue({ data: answer({ thread: { id: 4, message_ids: [1, 2] } }) });
    await sendRefine(ctx, TARGET, 'ועוד דבר');
    expect(api.post.mock.calls[0][0]).toBe('/wahub/refine/4/say/');
  });

  it('one that cannot be read says so and leaves the chat as it was', async () => {
    api.get.mockRejectedValue(refused('לא נמצא', 404));
    const { ctx, state } = chat();
    expect(await openRefineThread(ctx, 4)).toBe(false);
    expect(state().phase).toBe('idle');
    expect(state().threadId).toBeNull();
    expect(state().error).toBe('לא נמצא');
  });
});
