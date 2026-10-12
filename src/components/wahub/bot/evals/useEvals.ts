'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { readableError } from '@/lib/apiError';
import {
  EVALS_TEXT,
  EVAL_RUN_START,
  applyRun,
  evalRunReducer,
  runEvalQueue,
  runQueue,
  type EvalRunAction,
  type EvalRunState,
  type EvalScope,
} from '@/lib/wahub/evals';
import { evalFailureKind, evalsNotBuilt, fetchWahubEvalRun, fetchWahubEvals, runWahubEval } from '@/lib/wahub/evalsApi';
import { createTinyStore } from '@/lib/wahub/tinyStore';
import type { WahubEvalListing, WahubEvalRun } from '@/types/wahubTeach';

export const evalKeys = {
  list: ['wahub', 'evals', 'list'] as const,
  run: (runId: number) => ['wahub', 'evals', 'run', runId] as const,
};

/**
 * Where the screen stands. Kept outside the component: a full run is about a
 * hundred conversations and half an hour, and the sub-tab is sure to be left
 * meanwhile — the run goes on, and is found as it stands on coming back.
 */
interface EvalsUi {
  run: EvalRunState;
  /** The last answer of each conversation this visit played, by scenario — an open row follows it live. */
  played: Record<string, WahubEvalRun>;
  /** The group the list is narrowed to; null for all. */
  group: string | null;
  /** The open row. */
  openId: string | null;
}

const ui = createTinyStore<EvalsUi>({ run: EVAL_RUN_START, played: {}, group: null, openId: null });

/** "עצור" was pressed; and the request in the air, so it can be dropped at once. */
let stopRequested = false;
let inFlight: AbortController | null = null;

function dispatch(action: EvalRunAction): void {
  ui.set((current) => {
    const run = evalRunReducer(current.run, action);
    return run === current.run ? current : { ...current, run };
  });
}

/**
 * "בדוק עכשיו" / "בדוק רק מה שנכשל": the conversations on screen (the chosen
 * group, or all), one after the other. Never started by itself — a run asks
 * the real bot, and costs money.
 */
async function start(queryClient: QueryClient, scope: EvalScope): Promise<void> {
  const listing = queryClient.getQueryData<WahubEvalListing>(evalKeys.list);
  const state = ui.get();
  if (!listing || state.run.phase === 'running') return;
  const queue = runQueue(listing.scenarios, scope, state.group);
  if (!queue.length) return;
  stopRequested = false;
  const controller = new AbortController();
  inFlight = controller;
  dispatch({ type: 'start', queue, scope, group: state.group });
  try {
    await runEvalQueue({
      queue,
      run: (body) => runWahubEval(body, controller.signal),
      dispatch,
      stopped: () => stopRequested,
      classify: evalFailureKind,
      onRun(run) {
        ui.set((current) => ({ ...current, played: { ...current.played, [run.scenario.id]: run } }));
        queryClient.setQueryData<WahubEvalListing>(evalKeys.list, (current) => (current ? applyRun(current, run) : current));
        if (run.done) queryClient.setQueryData(evalKeys.run(run.run_id), run);
      },
    });
  } finally {
    if (inFlight === controller) inFlight = null;
    // The server's own list is the truth; what the screen counted meanwhile gives way to it.
    void queryClient.invalidateQueries({ queryKey: evalKeys.list });
  }
}

/** "עצור": at once. What was checked is kept; the conversation cut in the middle is carried on by the next run. */
function stop(): void {
  if (ui.get().run.phase !== 'running') return;
  stopRequested = true;
  inFlight?.abort();
  dispatch({ type: 'stop' });
}

export type EvalsAvailability = 'loading' | 'ready' | 'unavailable' | 'failed';

export type EvalDetailState =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'failed'; text: string }
  | { state: 'ready'; run: WahubEvalRun };

/** "בדיקות הבוט": the list with its totals, the run under way, and the row that is open. */
export function useEvals() {
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(ui.subscribe, ui.get, ui.get);

  const list = useQuery({
    queryKey: evalKeys.list,
    queryFn: fetchWahubEvals,
    staleTime: 30_000,
    retry: false,
    // A run keeps the list right by itself; reading it again in the middle would only make the figures jump.
    refetchOnWindowFocus: state.run.phase !== 'running',
  });

  let availability: EvalsAvailability = 'ready';
  if (list.isError && evalsNotBuilt(list.error)) availability = 'unavailable';
  else if (list.isPending) availability = 'loading';
  else if (list.isError && !list.data) availability = 'failed';

  // The open row: what this visit played of it, or its last kept run, read when the row is opened.
  const open = state.openId ? (list.data?.scenarios.find((scenario) => scenario.id === state.openId) ?? null) : null;
  const played = open ? state.played[open.id] : undefined;
  const lastRunId = open?.last?.run_id ?? null;
  const usePlayed = Boolean(played && (!played.done || played.run_id === lastRunId || lastRunId == null));
  const kept = useQuery({
    queryKey: evalKeys.run(lastRunId ?? 0),
    queryFn: () => fetchWahubEvalRun(lastRunId as number),
    enabled: open != null && lastRunId != null && !usePlayed,
    staleTime: 5 * 60_000,
    retry: false,
  });

  let detail: EvalDetailState = { state: 'none' };
  if (open && usePlayed && played) detail = { state: 'ready', run: played };
  else if (open && lastRunId != null) {
    if (kept.data) detail = { state: 'ready', run: kept.data };
    else if (kept.isError) detail = { state: 'failed', text: readableError(kept.error, EVALS_TEXT.runFailedToOpen) };
    else detail = { state: 'loading' };
  }

  const actions = useMemo(
    () => ({
      startRun: (scope: EvalScope) => void start(queryClient, scope),
      stopRun: stop,
      setGroup: (group: string | null) => ui.set((current) => ({ ...current, group })),
      open: (id: string | null) => ui.set((current) => ({ ...current, openId: current.openId === id ? null : id })),
    }),
    [queryClient],
  );

  return {
    availability,
    loadError: availability === 'failed' ? readableError(list.error, EVALS_TEXT.loadFailed) : '',
    retry: () => void list.refetch(),
    listing: list.data ?? null,
    run: state.run,
    group: state.group,
    openId: state.openId,
    detail,
    retryDetail: () => void kept.refetch(),
    ...actions,
  };
}
