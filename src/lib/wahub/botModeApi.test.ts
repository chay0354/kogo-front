/**
 * The client of "מי עונה ללקוחות" against the contract
 * (docs/WAHUB-CONTRACT-GO-LIVE.md, ג.1): which door each call knocks on and
 * what it sends — above all, that "כולם" is never asked for without the owner's
 * tick, that a server which has no such endpoint yet is told apart from one
 * that failed, and how a refusal is read. The axios instance is mocked, so
 * nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import { botModeRefusal, fetchWahubBotMode, isUnanswered, setWahubBotFollowups, setWahubBotMode, type BotModeChange } from './botModeApi';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

const BODY = {
  mode: 'test',
  live: false,
  live_since: null,
  chosen_at: null,
  chosen_by: '',
  sending_enabled: false,
  text: 'מצב בדיקה: הבוט החדש עונה רק למספרי הבדיקה (1)',
  warning: '',
  stopped: null,
  test_contacts: 1,
  today: { sent: 0, failed: 0, late: 0, needs_human: 0, fallback: 0, unanswered: 0 },
  last_failure: null,
  followups: { on: false, since: null, turned_on_at: null, by: '', text: 'כבויות', due_now: 0 },
  log: [],
};

const LIVE = { ...BODY, mode: 'all', live: true, live_since: '2026-10-14T09:05:00+00:00', sending_enabled: true };

function refusal(status: number, data: unknown = {}) {
  return Object.assign(new Error(`status ${status}`), { response: { status, data } });
}

describe('GET settings/bot-mode/', () => {
  it('reads who answers', async () => {
    api.get.mockResolvedValue({ data: BODY });
    const state = await fetchWahubBotMode();
    expect(api.get).toHaveBeenCalledWith('/wahub/settings/bot-mode/');
    expect(state?.mode).toBe('test');
    expect(state?.followups.on).toBe(false);
  });

  it('a server from before (404 / 405): null — the card and the switch are then simply not there', async () => {
    api.get.mockRejectedValue(refusal(404));
    expect(await fetchWahubBotMode()).toBeNull();
    api.get.mockRejectedValue(refusal(405));
    expect(await fetchWahubBotMode()).toBeNull();
  });

  it('a server that failed is a failure, never "no card"', async () => {
    api.get.mockRejectedValue(refusal(500));
    await expect(fetchWahubBotMode()).rejects.toThrow();
    api.get.mockRejectedValue(refusal(403));
    await expect(fetchWahubBotMode()).rejects.toThrow();
    api.get.mockRejectedValue(new Error('Network Error'));
    await expect(fetchWahubBotMode()).rejects.toThrow();
  });

  it('an answer that cannot be read is a failure, never a guessed state', async () => {
    api.get.mockResolvedValue({ data: { ...BODY, mode: 'half' } });
    await expect(fetchWahubBotMode()).rejects.toThrow();
    api.get.mockResolvedValue({ data: '<!doctype html><html></html>' });
    await expect(fetchWahubBotMode()).rejects.toThrow();
    api.get.mockResolvedValue({ data: null });
    await expect(fetchWahubBotMode()).rejects.toThrow();
  });
});

describe('POST settings/bot-mode/', () => {
  it('going live sends the mode with its confirmation — and only with the owner\'s tick', async () => {
    api.post.mockResolvedValue({ data: LIVE });
    const state = await setWahubBotMode({ mode: 'all', oldBotDisconnected: true });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/wahub/settings/bot-mode/', { mode: 'all', confirm: 'all' });
    expect(state.live).toBe(true);
  });

  it('without the tick nothing is sent at all', async () => {
    api.post.mockResolvedValue({ data: LIVE });
    for (const change of [{ mode: 'all' }, { mode: 'all', oldBotDisconnected: false }, { mode: 'all', oldBotDisconnected: 'yes' }, { mode: 'all', oldBotDisconnected: 1 }]) {
      await expect(setWahubBotMode(change as unknown as BotModeChange)).rejects.toThrow();
    }
    expect(api.post).not.toHaveBeenCalled();
  });

  it('going back sends the mode alone — no confirmation is asked of the way back', async () => {
    api.post.mockResolvedValue({ data: BODY });
    const state = await setWahubBotMode({ mode: 'test' });
    expect(api.post).toHaveBeenCalledWith('/wahub/settings/bot-mode/', { mode: 'test' });
    expect(state.mode).toBe('test');
  });

  it('the answer is the state as it now stands; one that cannot be read is a failure', async () => {
    api.post.mockResolvedValue({ data: { ok: true } });
    await expect(setWahubBotMode({ mode: 'test' })).rejects.toThrow();
  });

  it('a refusal is thrown as it came, for the screen to read', async () => {
    const error = refusal(409, { detail: 'אי אפשר לעבור ל"כולם" עכשיו', code: 'not_ready', problems: [{ code: 'no_manychat', text: 'השרת לא מחובר ל-ManyChat' }], ...BODY });
    api.post.mockRejectedValue(error);
    await expect(setWahubBotMode({ mode: 'all', oldBotDisconnected: true })).rejects.toBe(error);
  });
});

describe('POST settings/followups/', () => {
  it('turning on sends its confirmation', async () => {
    api.post.mockResolvedValue({ data: { ...BODY, followups: { ...BODY.followups, on: true } } });
    const state = await setWahubBotFollowups(true);
    expect(api.post).toHaveBeenCalledWith('/wahub/settings/followups/', { on: true, confirm: 'on' });
    expect(state.followups.on).toBe(true);
  });

  it('turning off sends the switch alone', async () => {
    api.post.mockResolvedValue({ data: BODY });
    await setWahubBotFollowups(false);
    expect(api.post).toHaveBeenCalledWith('/wahub/settings/followups/', { on: false });
  });

  it('never touches who answers', async () => {
    api.post.mockResolvedValue({ data: BODY });
    await setWahubBotFollowups(true);
    await setWahubBotFollowups(false);
    expect(api.post.mock.calls.every(([url]) => url === '/wahub/settings/followups/')).toBe(true);
  });
});

describe('reading a refusal', () => {
  it('409 not_ready: the reasons in the server\'s words, and the state as it stands — unchanged', () => {
    const read = botModeRefusal(
      refusal(409, {
        detail: 'אי אפשר לעבור ל"כולם" עכשיו — השרת לא יכול לענות ללקוחות',
        code: 'not_ready',
        problems: [
          { code: 'no_claude_key', text: 'אין בשרת מפתח Anthropic — אין בוט חדש שיענה' },
          { code: 'self_call_failed', text: 'השרת לא הצליח לקרוא לעצמו: timeout' },
        ],
        ...BODY,
      }),
    );
    expect(read?.code).toBe('not_ready');
    expect(read?.detail).toBe('אי אפשר לעבור ל"כולם" עכשיו — השרת לא יכול לענות ללקוחות');
    expect(read?.problems.map((problem) => problem.text)).toEqual(['אין בשרת מפתח Anthropic — אין בוט חדש שיענה', 'השרת לא הצליח לקרוא לעצמו: timeout']);
    expect(read?.state?.mode).toBe('test');
  });

  it('400: the code and the sentence, and no state', () => {
    const read = botModeRefusal(refusal(400, { detail: 'מעבר ל"כולם" דורש אישור מפורש', code: 'confirm_required' }));
    expect(read).toEqual({ code: 'confirm_required', detail: 'מעבר ל"כולם" דורש אישור מפורש', problems: [], state: null });
  });

  it('nothing that can be read: null', () => {
    expect(botModeRefusal(refusal(500, '<html>'))).toBeNull();
    expect(botModeRefusal(new Error('Network Error'))).toBeNull();
    expect(botModeRefusal(undefined)).toBeNull();
  });

  it('no answer at all is told apart from a refusal: whether the change was kept is then not known', () => {
    expect(isUnanswered(new Error('timeout of 30000ms exceeded'))).toBe(true);
    expect(isUnanswered(refusal(409))).toBe(false);
    expect(isUnanswered(refusal(500))).toBe(false);
  });
});
