'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { readableError } from '@/lib/apiError';
import { heldStripText } from '@/lib/wahub/leadsAutomation';
import { knowsListsApart, leadRows, leadsLayout, leadsPanes, leadTitle, stageOptions, stuckFirst, type LeadChange } from '@/lib/wahub/leadsV2';
import { isLeadGone } from '@/lib/wahub/leadsV2Api';
import { PHONE_MEDIA_QUERY } from '@/lib/wahub/screens';
import type { WahubLeadRow, WahubLeadsView, WahubStatus } from '@/types/wahub';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useLeadsAutomation } from '../../hooks/useLeadsAutomation';
import { useNow } from '../../hooks/useNow';
import { useNotify, useWaitingList } from '../../hooks/useWaitingList';
import type { WahubLiveHandle } from '../../hooks/useWahubLive';
import LessonPicker from '../../shared/LessonPicker';
import { cx } from '../../shared/tones';
import LeadDetails from './LeadDetails';
import LeadsList from './LeadsList';
import type { NotifyControls } from './WaitingBits';
import WaitingListScreen from './WaitingListScreen';
import l from './leads.module.css';
import { useLeadChanges, useLeadDetail, useLeadsList, useLeadsLiveRefresh, useWaitingActions } from './useLeads';

const SEARCH_DELAY_MS = 300;

/** What the address holds for this tab. A change names only what it changes. */
export interface LeadsAddress {
  owner?: WahubLeadsView;
  stage?: string | null;
  lead?: number | null;
  /** The full waiting list stands in place of the lists. */
  waiting?: boolean;
}

export interface LeadsScreenProps {
  /** The tab is the one on screen. Out of view it keeps what it has and reads nothing. */
  active: boolean;
  live: WahubLiveHandle;
  /** Which of the three lists is in front. */
  view: WahubLeadsView;
  /** The state the list is narrowed to; null is all of them. */
  stage: string | null;
  /** The lead whose details are open; null is the list alone. */
  leadId: number | null;
  /** The full waiting list stands in place of the lists (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז.1). */
  waiting?: boolean;
  status: WahubStatus | undefined;
  onAddress: (patch: LeadsAddress) => void;
  onOpenChat: (id: number) => void;
  /** To the card "חזרה אוטומטית ללידים" in the settings. */
  onOpenAutomation?: () => void;
}

/**
 * The leads tab, version 2 (docs/WAHUB-CONTRACT-LEADS-V2.md, ה), with its
 * reading: which list is in front, the state and the search it is narrowed
 * by, its rows page by page — and the details of the lead that was pressed,
 * beside the list on a desktop and in place of it on a phone
 * (lib/wahub/screens.ts: one screen at a time, with a way back that the
 * browser's own "back" follows, because the open lead is in the address).
 *
 * The list and the details each scroll by themselves; the page does not.
 */
export default function LeadsScreen({ active, live, view, stage, leadId, waiting = false, status, onAddress, onOpenChat, onOpenAutomation }: LeadsScreenProps) {
  const now = useNow(60_000);
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const layout = leadsLayout(width, phone);
  const panes = leadsPanes(layout, leadId);

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    // A search that was cleared is gone at once: the list that was in front is back without a wait.
    if (!search.trim()) {
      setQ('');
      return undefined;
    }
    const timer = window.setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  // The whole list of the tab in front: its numbers, the states it holds, and — with nothing chosen — its rows.
  const base = useLeadsList(view, null, '', active);
  const basePage = base.data?.pages[0] ?? null;
  // A search looks through every list at once, whatever tab is in front (owner, 13.10.2026: "שיהיה קל מאוד
  // לחפש") — on a server that can (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1.3: `owner=all`). One built before it
  // refuses that word, so there the search stays inside the list in front, as it always did.
  const everywhere = Boolean(q) && knowsListsApart(basePage?.counts);
  const narrowed = Boolean(stage) || Boolean(q);
  const narrow = useLeadsList(everywhere ? 'all' : view, everywhere ? null : stage, q, active && narrowed);
  const list = narrowed ? narrow : base;
  useLeadsLiveRefresh(live, active);

  // Comings back whose time has come and did not go out (docs/WAHUB-CONTRACT-LEADS-V2.md, י): one quiet strip at
  // the head of the bot's list. Read only while that list is in front; a server without it has no strip.
  const automation = useLeadsAutomation(active && view === 'bot');
  const held = view === 'bot' ? heldStripText(automation.data) : '';

  // The order is the server's — but for "נתקע בהרשמה", which always stands at the head of "מחכים לך". A search's
  // results keep the server's own order: who was found by name or phone first.
  const rows = useMemo(() => {
    const read = leadRows(list.data?.pages);
    return view === 'office' && !everywhere ? stuckFirst(read) : read;
  }, [everywhere, list.data, view]);
  const baseRows = useMemo(() => leadRows(base.data?.pages), [base.data]);
  const firstPage = list.data?.pages[0] ?? basePage;
  // What the search brought beside its rows: people among the conversations who are no leads, customers in Kogo
  // with no conversation.
  const searchPage = everywhere ? (narrow.data?.pages[0] ?? null) : null;
  const stages = useMemo(
    () => stageOptions(basePage?.stages ?? firstPage?.stages, baseRows, Boolean(base.data) && !base.hasNextPage, stage),
    [base.data, base.hasNextPage, basePage, baseRows, firstPage, stage],
  );

  // The lead that was pressed: its name and its next step come at once from the row; the rest waits for its read.
  const detail = useLeadDetail(leadId, active);
  const seed = useMemo(
    () => (leadId == null ? null : rows.find((row) => row.contact_id === leadId) ?? baseRows.find((row) => row.contact_id === leadId) ?? null),
    [baseRows, leadId, rows],
  );
  const lead: WahubLeadRow | null = leadId == null ? null : detail.data ?? seed;
  const gone = detail.isError && isLeadGone(detail.error);

  const { change, busy } = useLeadChanges();
  // A waiting-list entry: "טופל" once its place was freed, "להסיר מהרשימה" while it stands — and adding one by hand.
  const waitingList = useWaitingActions();
  // The full waiting list (ז.1): its numbers are the quiet way in, above the lists; its lessons are the screen
  // that stands in their place. Null: a server without a waiting list — there is no way in, and no screen.
  const waitingPage = useWaitingList(active, active);
  const knowsWaiting = waitingPage.data !== null;
  const showWaiting = waiting && knowsWaiting;
  // An address that names the waiting list on a server that has none is put right: the lists are what is shown.
  useEffect(() => {
    if (active && waiting && waitingPage.data === null) onAddress({ waiting: false });
  }, [active, onAddress, waiting, waitingPage.data]);
  // "להודיע ללקוח" (ז.4): one block at a time, in a lead's details or in the full list.
  const { open: telling, start: startTelling, send: sendTelling, close: closeTelling } = useNotify();
  const notify = useMemo<NotifyControls>(
    () => ({ open: telling, onStart: (entryId) => void startTelling(entryId), onSend: () => void sendTelling(), onClose: closeTelling }),
    [closeTelling, sendTelling, startTelling, telling],
  );
  // "להוסיף לרשימת המתנה" (ז.2): the window where a lesson is chosen, for the lead whose details are open. Only
  // on a server that lists the lessons — the one that counts the list by lesson is that server.
  const canAddWaiting = waitingPage.data?.counted === true;
  const [picker, setPicker] = useState<{ contactId: number; name: string } | null>(null);
  const lastOpened = useRef<number | null>(null);
  if (leadId != null) lastOpened.current = leadId;

  const close = useCallback(() => onAddress({ lead: null }), [onAddress]);

  const onChange = useCallback(
    (target: WahubLeadRow, what: LeadChange) => {
      // A lead that leaves the list takes its details with it — at once, like the row.
      if (what.kind === 'close' || what.kind === 'reopen') onAddress({ lead: null });
      return change(target, what);
    },
    [change, onAddress],
  );

  // The details close on Escape, like anything that lies beside or over the page.
  const open = active && leadId != null && !picker;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, open]);

  // Back at the list, the keyboard is where it was: on the row that was opened.
  const wasOpen = useRef(false);
  const frame = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (wasOpen.current && leadId == null && lastOpened.current != null) {
      frame.current?.querySelector<HTMLElement>(`[data-lead="${lastOpened.current}"]`)?.focus({ preventScroll: true });
    }
    wasOpen.current = leadId != null;
  }, [leadId]);

  const setFrame = useCallback(
    (element: HTMLDivElement | null) => {
      frame.current = element;
      ref(element);
    },
    [ref],
  );

  return (
    <div ref={setFrame} className={l.screen} data-active={active ? '' : undefined} data-layout={layout}>
      {/* Out of view the list is hidden, not removed: its place in the scroll is still there on the way back. */}
      <div className={cx(l.main, (!panes.list || showWaiting) && l.hidden)}>
        <LeadsList
          view={view}
          counts={(everywhere ? basePage?.counts : firstPage?.counts) ?? null}
          stage={stage}
          stages={stages}
          search={search}
          status={list.data ? 'ready' : list.isError ? 'error' : 'loading'}
          error={list.isError ? readableError(list.error, '') : ''}
          rows={rows}
          stale={Boolean(list.data) && list.isPlaceholderData}
          hasMore={Boolean(list.hasNextPage)}
          loadingMore={list.isFetchingNextPage}
          refreshing={Boolean(list.data) && list.isFetching && !list.isFetchingNextPage && !list.isPlaceholderData}
          selectedId={leadId}
          now={now}
          sendingOn={status ? status.sending_enabled : null}
          held={held}
          onHeld={onOpenAutomation}
          everywhere={everywhere}
          found={q}
          extras={searchPage ? { contacts: searchPage.contacts ?? [], customers: searchPage.customers ?? [], customers_more: Boolean(searchPage.customers_more) } : null}
          onOpenChat={onOpenChat}
          waitingList={waitingPage.data ? waitingPage.data.counts : null}
          waitingPeople={basePage?.counts.waiting ?? null}
          waitingAct={basePage?.counts.waiting_act ?? null}
          onWaitingList={() => onAddress({ waiting: true, lead: null })}
          onView={(next) => onAddress({ owner: next, stage: null, lead: null })}
          onStage={(next) => onAddress({ stage: next })}
          onSearch={setSearch}
          onOpen={(id) => onAddress({ lead: id })}
          onMore={() => void list.fetchNextPage()}
          onRetry={() => void list.refetch()}
        />
      </div>

      {/* The full waiting list, in place of the lists — with its own way back to them. */}
      {showWaiting && (
        <div className={cx(l.main, !panes.list && l.hidden)}>
          <WaitingListScreen
            status={waitingPage.data ? 'ready' : waitingPage.isError ? 'error' : 'loading'}
            error={waitingPage.isError ? readableError(waitingPage.error, '') : ''}
            page={waitingPage.data ?? null}
            people={basePage?.counts.waiting ?? null}
            act={basePage?.counts.waiting_act ?? null}
            now={now}
            refreshing={Boolean(waitingPage.data) && waitingPage.isFetching}
            busy={waitingList.busy}
            notify={notify}
            onBack={() => onAddress({ waiting: false })}
            onAct={(entryId, action) => void waitingList.act(entryId, action)}
            onOpenChat={onOpenChat}
            onRetry={() => void waitingPage.refetch()}
          />
        </div>
      )}

      {panes.details && (
        <LeadDetails
          lead={lead}
          details={detail.data?.details ?? null}
          status={gone ? 'gone' : detail.data ? 'ready' : detail.isError ? 'error' : 'loading'}
          error={detail.isError && !gone ? readableError(detail.error, '') : ''}
          now={now}
          sendingOn={status ? status.sending_enabled : null}
          cover={panes.cover}
          // Open from the closed list: closed, whatever its state is called. Among a search's results each row
          // says which list it stands in.
          closed={everywhere ? rows.find((row) => row.contact_id === leadId)?.list === 'closed' : view === 'closed' && rows.some((row) => row.contact_id === leadId)}
          busy={lead ? busy[lead.contact_id] ?? null : null}
          onClose={close}
          onRetry={() => void detail.refetch()}
          onOpenChat={onOpenChat}
          onChange={onChange}
          onWaiting={(entryId, action) => void waitingList.act(entryId, action)}
          waitingBusy={waitingList.busy}
          notify={notify}
          onAddWaiting={canAddWaiting && lead ? () => setPicker({ contactId: lead.contact_id, name: leadTitle(lead) }) : undefined}
        />
      )}

      {/* Over the whole page, and so outside the columns: each of them is a ground of its own for what lies in it. */}
      {active && picker && (
        <LessonPicker
          key={picker.contactId}
          contactId={picker.contactId}
          name={picker.name}
          onJoin={(lessonId, child) => waitingList.join(picker.contactId, lessonId, child)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
