'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchWahubContacts, fetchWahubLeadBoard } from '@/lib/wahubApi';
import { WAHUB_PAGE_SIZE } from '@/lib/wahub/params';
import type { WahubContact, WahubPage } from '@/types/wahub';

export const leadKeys = {
  board: ['wahub', 'leads', 'board'] as const,
  /** The people of one state, or — with no state — whoever a search finds. */
  people: (stage: string | null, search: string) => ['wahub', 'leads', 'people', stage ?? '', search] as const,
  allPeople: ['wahub', 'leads', 'people'] as const,
};

/** The board is re-read this often while its tab is in front. */
const BOARD_INTERVAL_MS = 30_000;
/** A server that has no board yet is asked again only now and then, in case it was just released. */
const MISSING_INTERVAL_MS = 5 * 60_000;

/**
 * The lead board: three groups, their states and counts. `data === null` means
 * the server has no such endpoint yet — the caller shows the screen from before.
 */
export function useLeadBoard(active: boolean) {
  return useQuery({
    queryKey: leadKeys.board,
    queryFn: fetchWahubLeadBoard,
    enabled: active,
    refetchInterval: (query) => (query.state.data === null ? MISSING_INTERVAL_MS : BOARD_INTERVAL_MS),
    staleTime: 10_000,
    retry: false,
  });
}

/**
 * The people in one state (`contacts/?lead_stage=…`), a page at a time, or the
 * people a search finds across all of them. A row that came back without the
 * state it was asked for is left out, so a server that ignores the filter can
 * never fill a state with everybody.
 */
export function useLeadPeople(stage: string | null, search: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: leadKeys.people(stage, search),
    initialPageParam: 1,
    queryFn: ({ pageParam }): Promise<WahubPage<WahubContact>> =>
      fetchWahubContacts({
        view: 'chats',
        leadStage: stage ?? undefined,
        search: search || undefined,
        page: pageParam,
        pageSize: WAHUB_PAGE_SIZE,
      }),
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    enabled: enabled && (stage !== null || Boolean(search)),
    refetchInterval: enabled ? BOARD_INTERVAL_MS : false,
    staleTime: 10_000,
    retry: false,
    // Typing in the search keeps the rows that are there until the new ones land; another state starts from its own.
    placeholderData: (previous, previousQuery) =>
      previousQuery && previousQuery.queryKey[3] === (stage ?? '') ? previous : undefined,
  });
}
