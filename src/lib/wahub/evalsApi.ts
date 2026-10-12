import api from '../api';
import type { WahubEvalListing, WahubEvalRun } from '@/types/wahubTeach';
import { readEvalListing, readEvalRun, type EvalFailureKind } from './evals';

/**
 * The calls of "בדיקות הבוט", one function per endpoint of
 * docs/WAHUB-CONTRACT-BOT-EVALS.md. Nothing here decides anything.
 */

const BASE = '/wahub';

/** One request plays as many turns as fit in about 45 seconds, and may take 50. */
export const EVAL_RUN_TIMEOUT_MS = 90_000;

/** The server answered, but not as a server that has the checks would. */
export class EvalsNotBuilt extends Error {
  constructor() {
    super('evals: the server was built before "בדיקות הבוט"');
    this.name = 'EvalsNotBuilt';
  }
}

/** GET bot/evals/ — every written conversation with its last result, and the totals. */
export async function fetchWahubEvals(): Promise<WahubEvalListing> {
  const res = await api.get(`${BASE}/bot/evals/`);
  const listing = readEvalListing(res.data);
  if (!listing) throw new EvalsNotBuilt();
  return listing;
}

/**
 * POST bot/evals/run/ — plays ONE conversation, or carries on one that
 * answered `running` (`run_id`). A conversation of several turns does not fit
 * in one request: the screen sends again until `done`. Nothing is sent to anyone.
 */
export async function runWahubEval(body: { scenario_id: string; run_id?: number }, signal?: AbortSignal): Promise<WahubEvalRun> {
  const payload: Record<string, unknown> = { scenario_id: body.scenario_id };
  if (body.run_id != null) payload.run_id = body.run_id;
  const res = await api.post(`${BASE}/bot/evals/run/`, payload, { timeout: EVAL_RUN_TIMEOUT_MS, signal });
  const run = readEvalRun(res.data);
  if (!run) throw new EvalsNotBuilt();
  return run;
}

/** GET bot/evals/runs/{id}/ — a kept run in full, for opening a result without playing it again. */
export async function fetchWahubEvalRun(runId: number): Promise<WahubEvalRun> {
  const res = await api.get(`${BASE}/bot/evals/runs/${runId}/`);
  const run = readEvalRun(res.data);
  if (!run) throw new EvalsNotBuilt();
  return run;
}

// ---------------------------------------------------------------------------
// Reading a failure
// ---------------------------------------------------------------------------

interface ApiFailure {
  response?: { status?: number };
}

/** The server has no checks yet: the door is missing, or it answered something else. */
export function evalsNotBuilt(error: unknown): boolean {
  if (error instanceof EvalsNotBuilt) return true;
  const status = (error as ApiFailure)?.response?.status;
  return status === 404 || status === 405;
}

/**
 * How a request for one conversation failed: no answer at all (`offline`), the
 * user may not (`denied`), the server has no such door (`missing`), or it
 * answered and said no (`refused` — a run it no longer has, a server error).
 */
export function evalFailureKind(error: unknown): EvalFailureKind {
  if (error instanceof EvalsNotBuilt) return 'missing';
  const status = (error as ApiFailure)?.response?.status;
  if (status == null) return 'offline';
  if (status === 401 || status === 403) return 'denied';
  return status === 404 || status === 405 ? 'missing' : 'refused';
}
