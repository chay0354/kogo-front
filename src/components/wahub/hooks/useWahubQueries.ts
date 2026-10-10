'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWhatsAppAutomations } from '@/lib/whatsappApi';
import {
  fetchWahubQuickReplies,
  fetchWahubStatus,
  fetchWahubSummary,
  fetchWahubTags,
} from '@/lib/wahubApi';
import { menuBadgeCount } from '@/lib/wahub/boxes';

export const wahubKeys = {
  summary: ['wahub', 'summary'] as const,
  status: ['wahub', 'status'] as const,
  tags: ['wahub', 'tags'] as const,
  quickReplies: ['wahub', 'quick-replies'] as const,
  automations: ['wahub', 'automations'] as const,
};

/** The figures of the "היום" tab and of the menu badge. Re-read on a timer while the tab is in view. */
export function useWahubSummary(
  options: { enabled?: boolean; intervalMs?: number; quietOnError?: boolean } = {},
) {
  const interval = options.intervalMs ?? 30_000;
  return useQuery({
    queryKey: wahubKeys.summary,
    queryFn: fetchWahubSummary,
    enabled: options.enabled ?? true,
    // The menu is on every screen: when the server does not answer, it stops
    // asking on a timer and tries again when the window is next looked at.
    refetchInterval: (query) => (options.quietOnError && query.state.status === 'error' ? false : interval),
    staleTime: 10_000,
    retry: false,
  });
}

/**
 * The number beside "וואטסאפ ולידים" in the menu: waiting for an answer, plus
 * asking for a person. Re-read every 30 seconds; zero (or no answer) shows nothing.
 */
export function useWahubBadge(enabled: boolean): number {
  const { data } = useWahubSummary({ enabled, intervalMs: 30_000, quietOnError: true });
  return enabled ? menuBadgeCount(data) : 0;
}

export function useWahubStatus() {
  return useQuery({
    queryKey: wahubKeys.status,
    queryFn: fetchWahubStatus,
    refetchInterval: 60_000,
    staleTime: 20_000,
    retry: false,
  });
}

export function useWahubTags() {
  return useQuery({ queryKey: wahubKeys.tags, queryFn: fetchWahubTags, staleTime: 60_000, retry: 1 });
}

export function useWahubQuickReplies() {
  return useQuery({
    queryKey: wahubKeys.quickReplies,
    queryFn: fetchWahubQuickReplies,
    staleTime: 60_000,
    retry: 1,
  });
}

/** The automations ManyChat already has — the existing list, read only when a menu asks for it. */
export function useWahubAutomations(enabled: boolean) {
  return useQuery({
    queryKey: wahubKeys.automations,
    queryFn: fetchWhatsAppAutomations,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
