'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWhatsAppAutomations } from '@/lib/whatsappApi';
import {
  fetchWahubContacts,
  fetchWahubMessageMedia,
  fetchWahubQuickReplies,
  fetchWahubStatus,
  fetchWahubSummary,
  fetchWahubTags,
  fetchWahubUnregisteredLeads,
} from '@/lib/wahubApi';
import type { WahubContact } from '@/types/wahub';
import { menuBadgeCount } from '@/lib/wahub/boxes';

export const wahubKeys = {
  summary: ['wahub', 'summary'] as const,
  status: ['wahub', 'status'] as const,
  tags: ['wahub', 'tags'] as const,
  quickReplies: ['wahub', 'quick-replies'] as const,
  automations: ['wahub', 'automations'] as const,
  /** The "שאלו ולא נרשמו" list, one entry per range and per "רק חמים". */
  unregistered: (days: number, hot: boolean) => ['wahub', 'today', 'unregistered', days, hot ? 1 : 0] as const,
  /** The short-lived address of a message's recording or picture. */
  media: (messageId: number) => ['wahub', 'media', messageId] as const,
  /** The people in a live test (the settings list). */
  liveTestContacts: ['wahub', 'live-test', 'contacts'] as const,
};

/** The address is good for an hour (הבהרה 2); it is asked for again a little before that. */
const MEDIA_FRESH_MS = 50 * 60_000;

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

/**
 * Who asked and did not register (stage 3). Read only while the card is open —
 * closed, the card shows the summary's figures and asks the server for nothing.
 */
export function useUnregisteredLeads(days: number, hot: boolean, enabled: boolean) {
  return useQuery({
    queryKey: wahubKeys.unregistered(days, hot),
    queryFn: () => fetchWahubUnregisteredLeads({ days, hot }),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 10_000,
    retry: false,
  });
}

/**
 * The signed address of a message's file, asked for when the bubble is drawn
 * and kept for most of its hour. One request per message, however many times
 * the conversation is drawn again.
 */
export function useMessageMedia(messageId: number, enabled: boolean) {
  return useQuery({
    queryKey: wahubKeys.media(messageId),
    queryFn: () => fetchWahubMessageMedia(messageId),
    enabled: enabled && messageId > 0,
    staleTime: MEDIA_FRESH_MS,
    gcTime: MEDIA_FRESH_MS,
    retry: false,
  });
}

/**
 * Who the new bot answers for real. Asked with `live_test=1`; a server that
 * does not know the filter answers with everyone, so the flag is checked here
 * as well — the list is never wider than the people marked.
 */
export function useLiveTestContacts(enabled: boolean) {
  return useQuery({
    queryKey: wahubKeys.liveTestContacts,
    queryFn: async (): Promise<WahubContact[]> => {
      const page = await fetchWahubContacts({ view: 'chats', liveTest: true, pageSize: 100 });
      return page.results.filter((contact) => contact.live_test === true);
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 10_000,
    retry: false,
  });
}
