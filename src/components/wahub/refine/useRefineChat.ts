'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { REFINE_START, refineReducer, type RefineAction, type RefineChatState } from '@/lib/wahub/refine';
import { fetchWahubRefineThreads, isNotBuiltYet } from '@/lib/wahub/refineApi';
import {
  openRefineThread,
  sendRefine,
  undoRefineChange,
  type RefineFlowContext,
  type RefineSendResult,
} from '@/lib/wahub/refineFlow';
import { useKnowledgeCache, useProposalsCache } from '../hooks/useBotQueries';
import type { RefineTarget } from './RefineContext';

export const refineKeys = {
  /** The earlier threads of one conversation. */
  threads: (contactId: number | null) => ['wahub', 'refine', 'threads', contactId ?? 0] as const,
  /** "אישור אוטומטי של תיקונים". */
  settings: ['wahub', 'settings', 'review'] as const,
};

/**
 * The small chat of "דיוק" for one opening: where it stands, the earlier
 * threads of the same conversation, and the three things the operator can do —
 * write a line, take a change back, open an earlier thread.
 */
export function useRefineChat(target: RefineTarget) {
  const queryClient = useQueryClient();
  const proposals = useProposalsCache();
  const knowledge = useKnowledgeCache();
  const { contactId, messageIds, shadowId, proposalId, onSent } = target;
  // The earlier threads are a conversation's. A thread on a proposal has none to list.
  const listed = contactId != null && proposalId == null;

  // Held in a ref as well as in state: a second Enter must find "thinking" before the screen is drawn again.
  const [state, setState] = useState<RefineChatState>(REFINE_START);
  const stateRef = useRef(state);
  const dispatch = useCallback((action: RefineAction) => {
    stateRef.current = refineReducer(stateRef.current, action);
    setState(stateRef.current);
  }, []);

  const threads = useQuery({
    queryKey: refineKeys.threads(contactId),
    queryFn: () => fetchWahubRefineThreads(contactId as number),
    enabled: listed,
    staleTime: 10_000,
    retry: false,
  });

  // The list is the first thing asked of the server: a 404 there says the server has no "דיוק" yet.
  const notBuilt = threads.isError && isNotBuiltYet(threads.error);
  useEffect(() => {
    if (notBuilt) dispatch({ type: 'unavailable' });
    else if (threads.isSuccess) dispatch({ type: 'available' });
  }, [dispatch, notBuilt, threads.isSuccess]);

  const ctx = useMemo<RefineFlowContext>(
    () => ({
      getState: () => stateRef.current,
      dispatch,
      onChanged: () => {
        // A refinement may have changed the knowledge, made a proposal, or both.
        proposals.invalidate();
        knowledge.invalidate();
        void queryClient.invalidateQueries({ queryKey: refineKeys.threads(contactId) });
      },
    }),
    [contactId, dispatch, knowledge, proposals, queryClient],
  );

  const sentOnce = useRef(false);
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;

  const send = useCallback(
    async (text: string): Promise<RefineSendResult> => {
      // Only a thread opened here, on what was marked, is "the first line" — not a line added to an earlier thread.
      const opening = stateRef.current.threadId == null;
      const result = await sendRefine(ctx, { contactId, messageIds, shadowId, proposalId }, text);
      if (result === 'sent' && opening && !sentOnce.current) {
        sentOnce.current = true;
        onSentRef.current?.();
      }
      return result;
    },
    [contactId, ctx, messageIds, proposalId, shadowId],
  );
  const undo = useCallback((index: number) => undoRefineChange(ctx, index), [ctx]);
  const openThread = useCallback((id: number) => openRefineThread(ctx, id), [ctx]);
  const newThread = useCallback(() => dispatch({ type: 'reset' }), [dispatch]);
  const retry = useCallback(() => void threads.refetch(), [threads]);

  return {
    state,
    threads: threads.data ?? [],
    checking: threads.isFetching,
    send,
    undo,
    openThread,
    newThread,
    retry,
  };
}
