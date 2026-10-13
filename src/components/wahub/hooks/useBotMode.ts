'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readableError } from '@/lib/apiError';
import { FOLLOWUPS_TEXT, WHO_ANSWERS_TEXT, botModeInterval } from '@/lib/wahub/botMode';
import { botModeRefusal, fetchWahubBotMode, isUnanswered, setWahubBotFollowups, setWahubBotMode } from '@/lib/wahub/botModeApi';
import { hebrewOr } from '@/lib/wahub/leadsAutomation';
import type { WahubBotMode, WahubBotModeProblem } from '@/types/wahubBotMode';
import { automationKeys } from './useLeadsAutomation';
import { wahubKeys } from './useWahubQueries';

/**
 * The reading and the changing of "מי עונה ללקוחות"
 * (docs/WAHUB-CONTRACT-GO-LIVE.md, ג): one request, shared by the card at the
 * top of the settings, the row in "מצב המערכת" and the switch of the comings
 * back to the leads.
 */

export const botModeKeys = {
  state: ['wahub', 'bot-mode'] as const,
};

/**
 * GET settings/bot-mode/. `data === null`: the server has no such endpoint —
 * whoever reads it shows nothing at all. Read again by itself: every half
 * minute while the bot answers everybody, every minute otherwise.
 */
export function useBotMode(enabled = true) {
  return useQuery({
    queryKey: botModeKeys.state,
    queryFn: fetchWahubBotMode,
    enabled,
    refetchInterval: (query) => botModeInterval(query.state.data),
    staleTime: 10_000,
    retry: false,
  });
}

export type BotModeBusy = 'all' | 'test' | 'followups';

export interface BotModeOutcome {
  ok: boolean;
  /** Why the server cannot answer customers right now (409 `not_ready`), in its own words. */
  problems: WahubBotModeProblem[];
  /** Anything else that went wrong, in one Hebrew sentence. Empty when it went through. */
  message: string;
  /** The server did not answer: whether it kept the change is not known. The state is read again. */
  unknown: boolean;
}

const DONE: BotModeOutcome = { ok: true, problems: [], message: '', unknown: false };

export interface BotModeChanges {
  /** What is on its way to the server right now; null when nothing is. */
  busy: BotModeBusy | null;
  /** "להדליק לכולם" — only with the owner's tick. */
  goLive: (tick: { oldBotDisconnected: true }) => Promise<BotModeOutcome>;
  backToTest: () => Promise<BotModeOutcome>;
  setFollowups: (on: boolean) => Promise<BotModeOutcome>;
}

/**
 * The three changes. Nothing is shown before the server has answered: the
 * state on screen is always what the server last said. One change at a time —
 * a second press while one is on its way does nothing.
 */
export function useBotModeChanges(): BotModeChanges {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<BotModeBusy | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (kind: BotModeBusy, call: () => Promise<WahubBotMode>, fallback: string): Promise<BotModeOutcome> => {
      if (inFlight.current) return { ok: false, problems: [], message: '', unknown: false };
      inFlight.current = true;
      setBusy(kind);
      try {
        // A read that is on its way would put the old state back over the answer.
        await queryClient.cancelQueries({ queryKey: botModeKeys.state });
        const state = await call();
        queryClient.setQueryData<WahubBotMode | null>(botModeKeys.state, state);
        return DONE;
      } catch (error) {
        const refusal = botModeRefusal(error);
        // A refusal carries the state as it stands: it is shown as it is.
        if (refusal?.state) queryClient.setQueryData<WahubBotMode | null>(botModeKeys.state, refusal.state);
        if (refusal && refusal.problems.length > 0) {
          return { ok: false, problems: refusal.problems, message: hebrewOr(refusal.detail, ''), unknown: false };
        }
        // No answer: the server may or may not have kept the change. Said as it is, and the state is read again.
        if (isUnanswered(error)) return { ok: false, problems: [], message: WHO_ANSWERS_TEXT.unknown, unknown: true };
        return { ok: false, problems: [], message: hebrewOr(readableError(error, fallback), fallback), unknown: false };
      } finally {
        inFlight.current = false;
        setBusy(null);
        // The server has the last word, whichever way it went — and the cards beside this one read from it too.
        void queryClient.invalidateQueries({ queryKey: botModeKeys.state });
        void queryClient.invalidateQueries({ queryKey: wahubKeys.status });
        void queryClient.invalidateQueries({ queryKey: automationKeys.status });
      }
    },
    [queryClient],
  );

  const goLive = useCallback(
    (tick: { oldBotDisconnected: true }) => run('all', () => setWahubBotMode({ mode: 'all', ...tick }), WHO_ANSWERS_TEXT.goLiveFailed),
    [run],
  );
  const backToTest = useCallback(() => run('test', () => setWahubBotMode({ mode: 'test' }), WHO_ANSWERS_TEXT.backFailed), [run]);
  const setFollowups = useCallback(
    (on: boolean) => run('followups', () => setWahubBotFollowups(on), on ? FOLLOWUPS_TEXT.onFailed : FOLLOWUPS_TEXT.offFailed),
    [run],
  );

  return { busy, goLive, backToTest, setFollowups };
}
