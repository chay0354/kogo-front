/**
 * One change of "מי עונה ללקוחות", from the press to the state on screen
 * (docs/WAHUB-CONTRACT-GO-LIVE.md, ג.1): what is shown after the server
 * answered, after it refused, and after it did not answer at all — the case in
 * which nobody knows whether "כולם" was turned on, and nothing may be guessed.
 * The server is a function handed in; nothing here reaches one.
 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { WHO_ANSWERS_TEXT, readBotMode } from '@/lib/wahub/botMode';
import type { WahubBotMode } from '@/types/wahubBotMode';
import { applyBotModeChange, botModeKeys } from './useBotMode';
import { automationKeys } from './useLeadsAutomation';
import { wahubKeys } from './useWahubQueries';

const RAW = {
  mode: 'test',
  live: false,
  live_since: null,
  sending_enabled: true,
  text: 'מצב בדיקה: הבוט החדש עונה רק למספרי הבדיקה (מספר בדיקה אחד)',
  warning: '',
  stopped: null,
  test_contacts: 1,
  today: { sent: 0, failed: 0, late: 0, needs_human: 0, fallback: 0, unanswered: 0 },
  last_failure: null,
  followups: { on: false, since: null, turned_on_at: null, by: '', text: 'כבויות', due_now: 0 },
  log: [],
};

const TEST = readBotMode(RAW) as WahubBotMode;
const LIVE = readBotMode({ ...RAW, mode: 'all', live: true, live_since: '2026-10-14T09:05:00+00:00' }) as WahubBotMode;

function refusal(status: number, data: unknown) {
  return Object.assign(new Error(`status ${status}`), { response: { status, data } });
}

/** A cache that holds "בדיקה בלבד", and remembers what it was asked to read again. */
function start() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(botModeKeys.state, TEST);
  const invalidated = vi.spyOn(client, 'invalidateQueries');
  const again = () => invalidated.mock.calls.map(([filters]) => (filters as { queryKey: readonly unknown[] }).queryKey);
  const shown = () => client.getQueryData<WahubBotMode | null>(botModeKeys.state);
  return { client, again, shown };
}

describe('a change that went through', () => {
  it('what is shown is what the server answered', async () => {
    const { client, shown } = start();
    const outcome = await applyBotModeChange(client, () => Promise.resolve(LIVE), 'נכשל');
    expect(outcome).toEqual({ ok: true, problems: [], message: '', unknown: false });
    expect(shown()).toEqual(LIVE);
  });

  it('the state is read again — and so are the status and the leads card, which read from it', async () => {
    const { client, again } = start();
    await applyBotModeChange(client, () => Promise.resolve(LIVE), 'נכשל');
    expect(again()).toEqual([botModeKeys.state, wahubKeys.status, automationKeys.status]);
  });

  it('nothing is shown before the server has answered', async () => {
    const { client, shown } = start();
    let answer: (state: WahubBotMode) => void = () => {};
    const call = vi.fn(() => new Promise<WahubBotMode>((resolve) => (answer = resolve)));
    const pending = applyBotModeChange(client, call, 'נכשל');
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    // The server was asked, and has not answered: the screen still says what it said.
    expect(shown()).toEqual(TEST);
    answer(LIVE);
    await pending;
    expect(shown()).toEqual(LIVE);
  });
});

describe('the server cannot go live (409)', () => {
  const NOT_READY = refusal(409, {
    ...RAW,
    detail: 'אי אפשר לעבור ל"כולם" עכשיו — השרת לא יכול לענות ללקוחות',
    code: 'not_ready',
    problems: [
      { code: 'no_claude_key', text: 'אין בשרת מפתח Anthropic — אין בוט חדש שיענה' },
      { code: 'self_call_failed', text: 'השרת לא הצליח לקרוא לעצמו: לא התקבלה תשובה בזמן' },
    ],
  });

  it('its reasons, in its own words — and its sentence over them', async () => {
    const { client } = start();
    const outcome = await applyBotModeChange(client, () => Promise.reject(NOT_READY), 'נכשל');
    expect(outcome.ok).toBe(false);
    expect(outcome.unknown).toBe(false);
    expect(outcome.message).toBe('אי אפשר לעבור ל"כולם" עכשיו — השרת לא יכול לענות ללקוחות');
    expect(outcome.problems.map((problem) => problem.text)).toEqual(['אין בשרת מפתח Anthropic — אין בוט חדש שיענה', 'השרת לא הצליח לקרוא לעצמו: לא התקבלה תשובה בזמן']);
  });

  it('the state stays what the server says it is: still "בדיקה בלבד"', async () => {
    const { client, shown, again } = start();
    await applyBotModeChange(client, () => Promise.reject(NOT_READY), 'נכשל');
    expect(shown()?.mode).toBe('test');
    expect(shown()?.live).toBe(false);
    expect(again()).toContainEqual(botModeKeys.state);
  });
});

describe('the server did not answer', () => {
  it('it is said that nobody knows whether the change was kept — and the state on screen is not touched', async () => {
    const { client, shown } = start();
    const outcome = await applyBotModeChange(client, () => Promise.reject(new Error('timeout of 30000ms exceeded')), 'ההדלקה לא נשמרה. נסו שוב.');
    expect(outcome).toEqual({ ok: false, problems: [], message: WHO_ANSWERS_TEXT.unknown, unknown: true });
    // Neither "it worked" nor "it failed" is shown: what was there stays until the server is read again.
    expect(shown()).toEqual(TEST);
  });

  it('…and the server is asked how it stands', async () => {
    const { client, again } = start();
    await applyBotModeChange(client, () => Promise.reject(new Error('Network Error')), 'נכשל');
    expect(again()[0]).toEqual(botModeKeys.state);
  });

  it('an answer that cannot be read is the same: not known', async () => {
    const { client, shown } = start();
    const outcome = await applyBotModeChange(client, () => Promise.reject(new Error('the answer does not say who answers the customers')), 'נכשל');
    expect(outcome.unknown).toBe(true);
    expect(shown()).toEqual(TEST);
  });
});

describe('any other refusal', () => {
  it('the server\'s sentence when it is Hebrew', async () => {
    const { client } = start();
    const outcome = await applyBotModeChange(client, () => Promise.reject(refusal(403, { detail: 'רק מנהלים יכולים לשנות את זה.' })), 'ההדלקה לא נשמרה. נסו שוב.');
    expect(outcome).toEqual({ ok: false, problems: [], message: 'רק מנהלים יכולים לשנות את זה.', unknown: false });
  });

  it('the screen\'s own sentence when it is not — an English "Not found." is not shown', async () => {
    const { client } = start();
    const outcome = await applyBotModeChange(client, () => Promise.reject(refusal(500, { detail: 'Internal Server Error' })), 'ההדלקה לא נשמרה. נסו שוב.');
    expect(outcome.message).toBe('ההדלקה לא נשמרה. נסו שוב.');
    expect(outcome.unknown).toBe(false);
  });

  it('a refusal with no state in it leaves the screen as it was', async () => {
    const { client, shown } = start();
    await applyBotModeChange(client, () => Promise.reject(refusal(400, { detail: 'mode: test או all.', code: 'bad_mode' })), 'נכשל');
    expect(shown()).toEqual(TEST);
  });
});
