'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  applyLeadChange,
  changeFailedText,
  changeSavedText,
  changedLead,
  leadView,
  parseLeadsView,
  type LeadChange,
} from '@/lib/wahub/leadsV2';
import { actOnWahubWaitingEntry, type WaitingAction } from '@/lib/wahub/futureLeadsApi';
import {
  closeWahubLead,
  fetchWahubLead,
  fetchWahubLeads,
  reopenWahubLead,
  setWahubLeadOwner,
  snoozeWahubLead,
} from '@/lib/wahub/leadsV2Api';
import type { WahubLeadDetail, WahubLeadRow, WahubLeadsPage, WahubLeadsView } from '@/types/wahub';
import type { WahubLiveHandle } from '../../hooks/useWahubLive';
import { wahubKeys } from '../../hooks/useWahubQueries';

/**
 * The reading and the saving of the leads tab, version 2
 * (docs/WAHUB-CONTRACT-LEADS-V2.md, ד). The lists are read a page at a time by
 * the server's cursor and again every half minute while the tab is in front; a
 * change is shown the moment it is made, taken back if the server refuses, and
 * followed by a fresh read either way.
 */

export const leadsKeys = {
  all: ['wahub', 'leads2'] as const,
  lists: ['wahub', 'leads2', 'list'] as const,
  /** One list: which of the three, the state it is narrowed to, and the search. */
  list: (view: WahubLeadsView, stage: string | null, q: string) => ['wahub', 'leads2', 'list', view, stage ?? '', q] as const,
  detail: (id: number) => ['wahub', 'leads2', 'detail', id] as const,
  /** The few lines of "מחכים לך" on the day's tab. */
  glance: ['wahub', 'leads2', 'glance'] as const,
};

/** A list is read again this often while its tab is in front. */
const LIST_INTERVAL_MS = 30_000;
/** A server that has no `leads/` yet is asked again only now and then, in case it was just released. */
const MISSING_INTERVAL_MS = 5 * 60_000;

export type LeadsListData = InfiniteData<WahubLeadsPage | null, unknown>;

/** The server answered that it has no `leads/` at all: the tab shows the board from before. */
export function isOldServer(data: LeadsListData | undefined): boolean {
  return data !== undefined && data.pages[0] === null;
}

/**
 * One list of leads, a page at a time. A first page of `null` means the server
 * has no such endpoint yet (see `isOldServer`).
 */
export function useLeadsList(view: WahubLeadsView, stage: string | null, q: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: leadsKeys.list(view, stage, q),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchWahubLeads({ owner: view, stage, q, cursor: pageParam }),
    getNextPageParam: (last) => last?.next_cursor ?? undefined,
    enabled,
    refetchInterval: (query) => (isOldServer(query.state.data) ? MISSING_INTERVAL_MS : LIST_INTERVAL_MS),
    staleTime: 10_000,
    retry: false,
    // Narrowing a list (a state, a word typed) keeps the rows that are there until the new ones land;
    // another list starts from its own.
    placeholderData: (previous, previousQuery) => (previousQuery && previousQuery.queryKey[3] === view ? previous : undefined),
  });
}

/** One lead with everything a press opens. Read again while it is open, so a step the bot just took shows up. */
export function useLeadDetail(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: leadsKeys.detail(id ?? 0),
    queryFn: () => fetchWahubLead(id as number),
    enabled: enabled && id != null,
    refetchInterval: enabled && id != null ? LIST_INTERVAL_MS : false,
    staleTime: 5_000,
    retry: false,
  });
}

/**
 * "מחכים לך" at a glance, for the day's tab: the first page of the list that
 * waits for the office, with the three numbers. `null`: a server without
 * `leads/` — the day's tab then shows the card it showed before.
 */
export function useLeadsGlance(enabled = true) {
  return useQuery({
    queryKey: leadsKeys.glance,
    queryFn: () => fetchWahubLeads({ owner: 'office' }),
    enabled,
    refetchInterval: (query) => (query.state.data === null ? MISSING_INTERVAL_MS : LIST_INTERVAL_MS),
    staleTime: 10_000,
    retry: false,
  });
}

/** The lists are not read again more often than this because of the live update. */
const LIVE_REFRESH_GAP_MS = 10_000;

/**
 * A message that just came in can move a lead from one list to another. The
 * section's live update says which contacts changed; the lists on screen are
 * then read again, quietly — at most once in ten seconds.
 */
export function useLeadsLiveRefresh(live: WahubLiveHandle, active: boolean) {
  const queryClient = useQueryClient();
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      const now = Date.now();
      if (now - last.current < LIVE_REFRESH_GAP_MS) return;
      last.current = now;
      void queryClient.invalidateQueries({ queryKey: leadsKeys.all });
    };
    const offBatch = live.subscribe((batch) => {
      if (batch.contacts.length) refresh();
    });
    const offResync = live.onResync(refresh);
    return () => {
      offBatch();
      offResync();
    };
  }, [active, live, queryClient]);
}

function request(id: number, change: LeadChange): Promise<WahubLeadDetail | null> {
  switch (change.kind) {
    case 'owner':
      return setWahubLeadOwner(id, change.owner);
    case 'snooze':
      return snoozeWahubLead(id, change.until, change.note);
    case 'close':
      return closeWahubLead(id, change.reason);
    case 'reopen':
      return reopenWahubLead(id);
  }
}

/**
 * Every change a person makes to a lead, saved the same way: shown at once in
 * every list that is held and in the open details, put back — with the reason,
 * in Hebrew — if the server refuses, and read again from the server whichever
 * way it went. `busy` names the change that is on its way for a lead, so its
 * button can say so and a second press is not sent.
 */
export function useLeadChanges() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Record<number, LeadChange['kind']>>({});
  const inFlight = useRef(new Set<number>());

  const change = useCallback(
    async (lead: WahubLeadRow, what: LeadChange): Promise<boolean> => {
      const id = lead.contact_id;
      if (inFlight.current.has(id)) return false;
      inFlight.current.add(id);
      setBusy((prev) => ({ ...prev, [id]: what.kind }));

      // A read that is on its way would put the old rows back over the change.
      await queryClient.cancelQueries({ queryKey: leadsKeys.all });
      const lists = queryClient.getQueriesData<LeadsListData>({ queryKey: leadsKeys.lists });
      const detailKey = leadsKeys.detail(id);
      const detail = queryClient.getQueryData<WahubLeadDetail>(detailKey);
      const restore: Array<[QueryKey, unknown]> = [...lists, [detailKey, detail]];

      // The list the lead is counted in: its own to say, or — for one with nobody's step — the list it stands in.
      const viewOf = (key: QueryKey) => parseLeadsView(String(key[3] ?? ''));
      const holder = lists.find(([, data]) => data?.pages.some((page) => page?.results.some((row) => row.contact_id === id)));
      const from = leadView(lead) ?? (holder ? viewOf(holder[0]) : null);
      for (const [key, data] of lists) {
        if (!data) continue;
        queryClient.setQueryData<LeadsListData>(key, { ...data, pages: applyLeadChange(data.pages, viewOf(key), lead, what, from) });
      }
      if (detail) queryClient.setQueryData<WahubLeadDetail>(detailKey, changedLead(detail, what));

      try {
        await request(id, what);
        // A lead that stays open shows the change itself — its state, its next step, the button that turned
        // over. Only one that left the screen is worth a word (and on a phone a word covers "חזרה" while it is up).
        if (what.kind === 'close' || what.kind === 'reopen') toast.success(changeSavedText(what, lead));
        return true;
      } catch (error) {
        for (const [key, data] of restore) queryClient.setQueryData(key, data);
        toast.error(readableError(error, changeFailedText(what)));
        return false;
      } finally {
        inFlight.current.delete(id);
        setBusy((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // The server has the last word: where the lead now stands, its next step, the three numbers.
        void queryClient.invalidateQueries({ queryKey: leadsKeys.all });
        void queryClient.invalidateQueries({ queryKey: wahubKeys.summary });
      }
    },
    [queryClient],
  );

  return { change, busy };
}

/**
 * "טופל" / "להסיר מהרשימה" on a waiting-list entry whose place was freed
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.4). Nothing is shown before the
 * server has answered — where the lead stands afterwards is its to say — and
 * the lists and the open details are read again either way. `busy` names the
 * press that is on its way, so its button can say so and a second one is not sent.
 */
export function useWaitingActions() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<{ entryId: number; action: WaitingAction } | null>(null);
  const inFlight = useRef(false);

  const act = useCallback(
    async (entryId: number, action: WaitingAction): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy({ entryId, action });
      try {
        await actOnWahubWaitingEntry(entryId, action);
        // The block that was pressed goes with the entry: a word says what became of it.
        toast.success(action === 'handled' ? 'סומן כטופל' : 'הוסר מרשימת ההמתנה');
        return true;
      } catch (error) {
        toast.error(readableError(error, action === 'handled' ? 'הסימון לא נשמר' : 'לא הוסר מרשימת ההמתנה'));
        return false;
      } finally {
        inFlight.current = false;
        setBusy(null);
        void queryClient.invalidateQueries({ queryKey: leadsKeys.all });
        void queryClient.invalidateQueries({ queryKey: wahubKeys.summary });
      }
    },
    [queryClient],
  );

  return { act, busy };
}
