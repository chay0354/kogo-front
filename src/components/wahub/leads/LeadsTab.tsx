'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { LEADS_TWO_PANE_FROM, defaultStage, findStage, stageRows } from '@/lib/wahub/leadStage';
import type { WahubContact, WahubLeadBoard, WahubQueue, WahubStatus } from '@/types/wahub';
import { useElementWidth } from '../hooks/useElementWidth';
import { leadKeys, useLeadBoard, useLeadPeople } from '../hooks/useLeadQueries';
import { useNow } from '../hooks/useNow';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import { wahubKeys } from '../hooks/useWahubQueries';
import { ErrorState } from '../shared/bits';
import { RowsSkeleton } from '../shared/loading';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import LeadBoardView, { NO_PEOPLE, type LeadPeopleState } from './LeadBoard';
import LeadQueues from './LeadQueues';
import NewLeadForm from './NewLeadForm';

const SEARCH_DELAY_MS = 300;

interface LeadsTabProps {
  /** The tab is the one on screen. Out of view it keeps what it has and reads nothing. */
  active: boolean;
  live: WahubLiveHandle;
  /** The work queue of the screen from before the lead states (a server that has no board yet). */
  queue: WahubQueue;
  /** The lead state the address asks for; null is the board alone. */
  stage: string | null;
  status: WahubStatus | undefined;
  onQueue: (queue: WahubQueue) => void;
  onStage: (stage: string | null) => void;
  onOpenChat: (id: number) => void;
  onOpenSettings: () => void;
}

/** The board on its way: the three groups, each with a few rows, where they will stand. */
export function BoardSkeleton() {
  return (
    <div className={cx(s.pg, s.leadsScreen)} aria-busy="true" aria-label="טוען את הלידים">
      <div className={s.leadsBar}>
        <span className={cx(s.skeleton, s.leadsSearch, s.skBar)} />
      </div>
      <div className={cx(s.leadsGrid, s.leadsTwo)}>
        <div className={s.leadsStages}>
          {[7, 3].map((rows) => (
            <div key={rows} className={cx(s.card, s.cardFlush)}>
              <RowsSkeleton rows={rows} />
            </div>
          ))}
        </div>
        <div className={cx(s.card, s.cardFlush, s.leadsPeople)}>
          <RowsSkeleton rows={6} tall />
        </div>
      </div>
    </div>
  );
}

/** The board with its reading: which state is open, its people page by page, the search, "ליד חדש". */
function LeadBoardScreen({
  board,
  refreshing,
  active,
  stage,
  onStage,
  onOpenChat,
}: {
  board: WahubLeadBoard;
  refreshing: boolean;
  active: boolean;
  stage: string | null;
  onStage: (stage: string | null) => void;
  onOpenChat: (id: number) => void;
}) {
  const now = useNow(60_000);
  const queryClient = useQueryClient();
  const { ref, width } = useElementWidth<HTMLDivElement>();
  // Unmeasured (the first paint) counts as wide, like the conversations screen.
  const twoPane = width === null || width >= LEADS_TWO_PANE_FROM;

  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  /** What the reader did with "סגור": opened it, folded it, or — null — left it to open by itself. */
  const [closedChoice, setClosedChoice] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const searching = Boolean(searchQuery);
  // The state the address names; with none, a wide screen opens on the first one that has someone to handle.
  const asked = findStage(board, stage);
  const selectedKey = searching ? null : asked ? asked.stage.key : twoPane ? defaultStage(board) : null;
  // "סגור" starts folded; a state of its own on show opens it, until the reader folds it again.
  const closedOpen = closedChoice ?? findStage(board, selectedKey)?.group.key === 'closed';

  const query = useLeadPeople(selectedKey, searchQuery, active);
  const rows = useMemo(() => stageRows(query.data?.pages, selectedKey), [query.data, selectedKey]);
  const people: LeadPeopleState =
    !searching && selectedKey === null
      ? NO_PEOPLE
      : {
          status: query.data ? 'ready' : query.isError ? 'error' : 'loading',
          rows,
          total: query.data?.pages[0]?.count ?? null,
          hasMore: Boolean(query.hasNextPage),
          loadingMore: query.isFetchingNextPage,
          refreshing: Boolean(query.data) && query.isFetching && !query.isFetchingNextPage,
          stale: Boolean(query.data) && query.isPlaceholderData,
          error: query.isError ? readableError(query.error, '') : '',
        };

  return (
    <div ref={ref}>
      <LeadBoardView
        board={board}
        refreshing={refreshing}
        now={now}
        twoPane={twoPane}
        search={search}
        searching={searching}
        selectedKey={selectedKey}
        closedOpen={closedOpen}
        people={people}
        creating={creating}
        newLeadForm={
          creating ? (
            <NewLeadForm
              onClose={() => setCreating(false)}
              onCreated={(contact: WahubContact) => {
                toast.success(`הליד נוסף${contact.name ? `: ${contact.name}` : ''}`);
                void queryClient.invalidateQueries({ queryKey: leadKeys.board });
                void queryClient.invalidateQueries({ queryKey: leadKeys.allPeople });
                void queryClient.invalidateQueries({ queryKey: wahubKeys.summary });
              }}
              onOpenExisting={onOpenChat}
            />
          ) : undefined
        }
        onSearch={setSearch}
        onStage={onStage}
        onToggleClosed={() => setClosedChoice(!closedOpen)}
        onToggleCreate={() => setCreating((value) => !value)}
        onMore={() => void query.fetchNextPage()}
        onRetryPeople={() => void query.refetch()}
        onOpenChat={onOpenChat}
      />
    </div>
  );
}

/**
 * The leads tab. On a server that knows the lead states it is the board
 * (docs/WAHUB-CONTRACT-LEAD-STAGES.md, ב); on one that does not yet — no
 * `leads/board/` — it is the screen of work queues from before, untouched.
 */
export default function LeadsTab({ active, live, queue, stage, status, onQueue, onStage, onOpenChat, onOpenSettings }: LeadsTabProps) {
  const board = useLeadBoard(active);

  if (board.data === undefined) {
    if (board.isError) {
      return (
        <div className={s.card}>
          <ErrorState
            title="לא הצלחנו לטעון את הלידים"
            text={readableError(board.error, '')}
            onRetry={() => void board.refetch()}
          />
        </div>
      );
    }
    return <BoardSkeleton />;
  }

  if (board.data === null) {
    return (
      <LeadQueues
        live={live}
        queue={queue}
        status={status}
        onQueue={onQueue}
        onOpenChat={onOpenChat}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <LeadBoardScreen
      board={board.data}
      refreshing={board.isFetching}
      active={active}
      stage={stage}
      onStage={onStage}
      onOpenChat={onOpenChat}
    />
  );
}
