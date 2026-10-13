import api from '../api';
import type { WahubBotMode, WahubBotModeProblem } from '@/types/wahubBotMode';
import { readBotMode, readProblems } from './botMode';

/**
 * The calls of "מי עונה ללקוחות" — one function per endpoint of
 * docs/WAHUB-CONTRACT-GO-LIVE.md (ג.1). Kept beside the section's other calls
 * rather than inside them. Nothing here decides anything; the one thing it
 * guards is that "כולם" is never asked for without the owner's own tick.
 */

const BASE = '/wahub';

interface ApiFailure {
  response?: { status?: number; data?: unknown };
}

function statusOf(error: unknown): number | null {
  return (error as ApiFailure)?.response?.status ?? null;
}

function read(data: unknown): WahubBotMode {
  const state = readBotMode(data);
  if (!state) throw new Error('the answer does not say who answers the customers');
  return state;
}

/**
 * GET settings/bot-mode/ — who answers, since when, the day's numbers, the
 * switch of the comings back and the last changes. Null when the server has no
 * such endpoint yet (404 / 405): the card and the switch are then simply not
 * there. An answer that cannot be read is a failure, never an empty card.
 */
export async function fetchWahubBotMode(): Promise<WahubBotMode | null> {
  let data: unknown;
  try {
    data = (await api.get(`${BASE}/settings/bot-mode/`)).data;
  } catch (error) {
    const status = statusOf(error);
    if (status === 404 || status === 405) return null;
    throw error;
  }
  return read(data);
}

/**
 * What is asked of the server. Going to `all` carries the owner's tick —
 * "ניתקתי את הבוט הישן ב-ManyChat" — as a plain `true`: without it the request
 * cannot even be written.
 */
export type BotModeChange = { mode: 'test' } | { mode: 'all'; oldBotDisconnected: true };

/**
 * POST settings/bot-mode/ — `{"mode": "all", "confirm": "all"}` or
 * `{"mode": "test"}`. Answers with the state as it now stands. Refuses, before
 * anything is sent, a change to `all` that does not carry the tick.
 */
export async function setWahubBotMode(change: BotModeChange): Promise<WahubBotMode> {
  if (change.mode === 'all') {
    if ((change as { oldBotDisconnected?: unknown }).oldBotDisconnected !== true) {
      throw new Error('going live needs the tick: the old bot is disconnected');
    }
    return read((await api.post(`${BASE}/settings/bot-mode/`, { mode: 'all', confirm: 'all' })).data);
  }
  return read((await api.post(`${BASE}/settings/bot-mode/`, { mode: 'test' })).data);
}

/**
 * POST settings/followups/ — `{"on": true, "confirm": "on"}` or
 * `{"on": false}`. The same body comes back.
 */
export async function setWahubBotFollowups(on: boolean): Promise<WahubBotMode> {
  const body = on ? { on: true, confirm: 'on' } : { on: false };
  return read((await api.post(`${BASE}/settings/followups/`, body)).data);
}

export interface BotModeRefusal {
  /** `not_ready`, `confirm_required`, `bad_mode`, `bad_value` — or empty. */
  code: string;
  /** The server's sentence, when it sent one. */
  detail: string;
  /** Why the server cannot answer customers right now (409 `not_ready`). */
  problems: WahubBotModeProblem[];
  /** The state as it stands — a 409 carries the usual body beside its reasons. */
  state: WahubBotMode | null;
}

/** What the server said when it refused a change. Null when it said nothing that can be read (or did not answer). */
export function botModeRefusal(error: unknown): BotModeRefusal | null {
  const data = (error as ApiFailure)?.response?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const body = data as Record<string, unknown>;
  return {
    code: typeof body.code === 'string' ? body.code : '',
    detail: typeof body.detail === 'string' ? body.detail.trim() : '',
    problems: readProblems(body.problems),
    state: readBotMode(body),
  };
}

/** No answer at all — a dropped line, a timeout. Whether the server kept the change is then not known. */
export function isUnanswered(error: unknown): boolean {
  return !(error as ApiFailure)?.response;
}
