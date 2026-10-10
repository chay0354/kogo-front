'use client';

import { useEffect, useMemo, useRef } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchWahubContactShadow,
  fetchWahubFromKogo,
  fetchWahubKnowledge,
  fetchWahubKnowledgeHistory,
  fetchWahubOfficeHoursNow,
  fetchWahubProposals,
  fetchWahubReviewSummary,
  fetchWahubShadowBad,
  fetchWahubShadowRecent,
  fetchWahubShadowSummary,
  type WahubKnowledgeQuery,
} from '@/lib/wahubApi';
import type { WahubKnowledgeItem, WahubKnowledgeProposal, WahubShadowReply } from '@/types/wahub';

/**
 * The reads of the "הבוט" tab, the shadow rows in a conversation and the
 * floating button. One key per endpoint, so a save can put the fresh copy
 * straight into the cache or ask for the list again.
 */
export const botKeys = {
  knowledge: (query: WahubKnowledgeQuery = {}) => ['wahub', 'knowledge', query] as const,
  knowledgeAll: ['wahub', 'knowledge'] as const,
  history: (id: number) => ['wahub', 'knowledge', 'history', id] as const,
  fromKogo: ['wahub', 'knowledge', 'from-kogo'] as const,
  officeNow: ['wahub', 'knowledge', 'office-now'] as const,
  contactShadow: (contactId: number) => ['wahub', 'shadow', 'contact', contactId] as const,
  shadowRecent: ['wahub', 'shadow', 'recent'] as const,
  shadowBad: ['wahub', 'shadow', 'bad'] as const,
  shadowSummary: ['wahub', 'shadow', 'summary'] as const,
  proposals: (status: string) => ['wahub', 'review', 'proposals', status] as const,
  proposalsAll: ['wahub', 'review', 'proposals'] as const,
  reviewSummary: ['wahub', 'review', 'summary'] as const,
};

// ---------- knowledge ----------

export function useWahubKnowledge(query: WahubKnowledgeQuery = {}, enabled = true) {
  return useQuery({
    queryKey: botKeys.knowledge(query),
    queryFn: () => fetchWahubKnowledge(query),
    enabled,
    staleTime: 30_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });
}

export function useWahubKnowledgeHistory(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: botKeys.history(id ?? 0),
    queryFn: () => fetchWahubKnowledgeHistory(id as number),
    enabled: enabled && id != null,
    staleTime: 10_000,
    retry: false,
  });
}

export function useWahubFromKogo(enabled: boolean) {
  return useQuery({
    queryKey: botKeys.fromKogo,
    queryFn: fetchWahubFromKogo,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useWahubOfficeHoursNow(enabled = true) {
  return useQuery({
    queryKey: botKeys.officeNow,
    queryFn: fetchWahubOfficeHoursNow,
    enabled,
    refetchInterval: 60_000,
    staleTime: 20_000,
    retry: false,
  });
}

/** Put a saved item into every knowledge list in the cache that holds it (or should). */
export function useKnowledgeCache() {
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      put(item: WahubKnowledgeItem) {
        queryClient.setQueriesData<WahubKnowledgeItem[]>({ queryKey: botKeys.knowledgeAll, exact: false }, (prev) => {
          if (!Array.isArray(prev)) return prev;
          const index = prev.findIndex((entry) => entry.id === item.id);
          if (index === -1) return [...prev, item];
          const next = prev.slice();
          next[index] = item;
          return next;
        });
      },
      invalidate() {
        void queryClient.invalidateQueries({ queryKey: botKeys.knowledgeAll });
        void queryClient.invalidateQueries({ queryKey: botKeys.officeNow });
      },
    }),
    [queryClient],
  );
}

// ---------- shadow ----------

/**
 * The shadow replies of the open conversation. Read when it opens, then every
 * so often while it is in view; and again at once when the messages moved,
 * because a reply follows a new customer message by a minute or so.
 */
export function useContactShadow(contactId: number | null, enabled: boolean, messagesVersion: number) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: botKeys.contactShadow(contactId ?? 0),
    queryFn: () => fetchWahubContactShadow(contactId as number),
    enabled: enabled && contactId != null,
    refetchInterval: enabled ? 20_000 : false,
    staleTime: 5_000,
    retry: false,
  });
  // The first version seen for a conversation is its opening; the read on mount covers that one.
  const seen = useRef<{ contactId: number | null; version: number }>({ contactId: null, version: 0 });
  useEffect(() => {
    if (!enabled || contactId == null) return;
    const previous = seen.current;
    seen.current = { contactId, version: messagesVersion };
    if (previous.contactId === contactId && previous.version !== messagesVersion && messagesVersion > 0) {
      void queryClient.invalidateQueries({ queryKey: botKeys.contactShadow(contactId) });
    }
  }, [contactId, enabled, messagesVersion, queryClient]);
  return query;
}

export function useShadowRecent(enabled: boolean) {
  return useQuery({
    queryKey: botKeys.shadowRecent,
    queryFn: () => fetchWahubShadowRecent(),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useShadowBad(enabled: boolean) {
  return useQuery({
    queryKey: botKeys.shadowBad,
    queryFn: fetchWahubShadowBad,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useShadowSummary(enabled: boolean) {
  return useQuery({
    queryKey: botKeys.shadowSummary,
    queryFn: fetchWahubShadowSummary,
    enabled,
    refetchInterval: 60_000,
    staleTime: 20_000,
    retry: false,
  });
}

/** A verdict just set: into every cached list that holds the reply. */
export function useShadowCache() {
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      patch(id: number, change: (reply: WahubShadowReply) => WahubShadowReply) {
        queryClient.setQueriesData<WahubShadowReply[]>({ queryKey: ['wahub', 'shadow'], exact: false }, (prev) =>
          Array.isArray(prev) ? prev.map((reply) => (reply.id === id ? change(reply) : reply)) : prev,
        );
      },
      invalidateSummary() {
        void queryClient.invalidateQueries({ queryKey: botKeys.shadowSummary });
        void queryClient.invalidateQueries({ queryKey: botKeys.shadowBad });
      },
    }),
    [queryClient],
  );
}

// ---------- review ----------

/** The figures behind the floating button. Read every half minute for as long as the section is open. */
export function useReviewSummary(enabled = true) {
  return useQuery({
    queryKey: botKeys.reviewSummary,
    queryFn: fetchWahubReviewSummary,
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  });
}

export function useProposals(status: 'pending' | '' , enabled: boolean) {
  return useQuery({
    queryKey: botKeys.proposals(status || 'all'),
    queryFn: () => fetchWahubProposals(status),
    enabled,
    refetchInterval: status === 'pending' && enabled ? 30_000 : false,
    staleTime: 10_000,
    retry: false,
  });
}

/** A decision just made: into every cached list of proposals, and the counts asked for again. */
export function useProposalsCache() {
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      patch(id: number, change: (proposal: WahubKnowledgeProposal) => WahubKnowledgeProposal) {
        queryClient.setQueriesData<WahubKnowledgeProposal[]>({ queryKey: botKeys.proposalsAll, exact: false }, (prev) =>
          Array.isArray(prev) ? prev.map((proposal) => (proposal.id === id ? change(proposal) : proposal)) : prev,
        );
      },
      snapshot(): Array<[readonly unknown[], WahubKnowledgeProposal[] | undefined]> {
        return queryClient
          .getQueriesData<WahubKnowledgeProposal[]>({ queryKey: botKeys.proposalsAll, exact: false })
          .map(([key, data]) => [key, data]);
      },
      restore(snapshot: Array<[readonly unknown[], WahubKnowledgeProposal[] | undefined]>) {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      },
      bumpPending(delta: number) {
        queryClient.setQueryData(botKeys.reviewSummary, (prev: { pending: number } | undefined) =>
          prev ? { ...prev, pending: Math.max(0, prev.pending + delta) } : prev,
        );
      },
      invalidate() {
        void queryClient.invalidateQueries({ queryKey: botKeys.proposalsAll });
        void queryClient.invalidateQueries({ queryKey: botKeys.reviewSummary });
      },
    }),
    [queryClient],
  );
}
