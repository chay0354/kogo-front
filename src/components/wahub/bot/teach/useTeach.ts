'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { readableError } from '@/lib/apiError';
import { TEACH_TEXT, mergePages, patchPages, pollUntilSettled } from '@/lib/wahub/teach';
import {
  approveWahubTeach,
  fetchWahubTeachCheck,
  fetchWahubTeachPage,
  fetchWahubTeachPreview,
  fetchWahubTeachThread,
  sayWahubTeach,
  startWahubTeach,
  teachAlreadySettled,
  teachNotBuilt,
  teachUnanswered,
  undoWahubTeach,
} from '@/lib/wahub/teachApi';
import { createTinyStore } from '@/lib/wahub/tinyStore';
import type { WahubTeachCheck, WahubTeachPage, WahubTeachPreview, WahubTeachThread } from '@/types/wahubTeach';
import { botKeys } from '../../hooks/useBotQueries';
import type { TeachBusy } from './TeachCard';

export const teachKeys = {
  list: ['wahub', 'teach', 'list'] as const,
  thread: (id: number) => ['wahub', 'teach', 'thread', id] as const,
};

type BusyKind = Exclude<TeachBusy, null>;

/**
 * Where the screen stands. Kept outside the component: the bot takes up to a
 * minute over an explanation, and the sub-tab may be left and opened again
 * meanwhile — what was written, and the answer that is on its way, are still
 * here when it is.
 */
interface TeachUi {
  /** What is in the big box. */
  draft: string;
  /** The thread in the card. */
  openId: number | null;
  /** A new explanation is with the bot. */
  sending: { wrote: string; since: number } | null;
  sendError: string;
  /** The server said it has no "ללמד" when words were sent to it. */
  refused: boolean;
  busy: Record<number, { kind: BusyKind; said: string; at: number }>;
  errors: Record<number, string>;
  /** What he wrote back and could not be sent: it goes back into the short field. */
  unsent: Record<number, string>;
  stalled: Record<number, { preview?: boolean; check?: boolean }>;
  /** Goes up with every new answer of the bot: the card comes in again, and what was open on it closes. */
  version: number;
  askingId: number | null;
  undoingId: number | null;
  rowError: { id: number; text: string } | null;
  /** The last hand-over of words from elsewhere that was put in the box: each is put in once. */
  seeded: number;
}

const START: TeachUi = {
  draft: '',
  openId: null,
  sending: null,
  sendError: '',
  refused: false,
  busy: {},
  errors: {},
  unsent: {},
  stalled: {},
  version: 0,
  askingId: null,
  undoingId: null,
  rowError: null,
  seeded: 0,
};

const ui = createTinyStore<TeachUi>(START);

function patch(change: Partial<TeachUi> | ((current: TeachUi) => Partial<TeachUi>)): void {
  ui.set((current) => ({ ...current, ...(typeof change === 'function' ? change(current) : change) }));
}

function without<T>(record: Record<number, T>, id: number): Record<number, T> {
  if (!(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
}

/** A thread as the server now has it: into the cache, into the list, and everything that lists knowledge reads again. */
function land(queryClient: QueryClient, thread: WahubTeachThread): void {
  queryClient.setQueryData(teachKeys.thread(thread.id), thread);
  queryClient.setQueryData<InfiniteData<WahubTeachPage>>(teachKeys.list, (prev) =>
    prev ? { ...prev, pages: patchPages(prev.pages, thread) } : prev,
  );
  void queryClient.invalidateQueries({ queryKey: teachKeys.list });
  // A change that waits is a proposal; one that was kept or taken back moved the knowledge.
  void queryClient.invalidateQueries({ queryKey: botKeys.proposalsAll });
  void queryClient.invalidateQueries({ queryKey: botKeys.reviewSummary });
  void queryClient.invalidateQueries({ queryKey: botKeys.knowledgeAll });
}

/** What the server holds now, when an answer was lost on the way. Null when that cannot be read either. */
async function reread(queryClient: QueryClient, id: number): Promise<WahubTeachThread | null> {
  try {
    const thread = await fetchWahubTeachThread(id);
    land(queryClient, thread);
    return thread;
  } catch {
    return null;
  }
}

/** The big box: a new explanation, with nothing else. */
async function send(queryClient: QueryClient): Promise<void> {
  const state = ui.get();
  const text = state.draft.trim();
  if (!text || state.sending) return;
  // The card that was open steps aside; it is still in the list.
  patch({ draft: '', sending: { wrote: text, since: Date.now() }, sendError: '', openId: null, askingId: null });
  try {
    const thread = await startWahubTeach(text);
    land(queryClient, thread);
    patch((current) => ({ sending: null, openId: thread.id, version: current.version + 1 }));
  } catch (error) {
    // What he wrote is never lost: it goes back into the box, unless he has written something new meanwhile.
    const back = (current: TeachUi) => (current.draft.trim() ? current.draft : text);
    if (teachNotBuilt(error)) {
      patch((current) => ({ sending: null, draft: back(current), refused: true }));
    } else if (teachUnanswered(error)) {
      patch((current) => ({ sending: null, draft: back(current), sendError: TEACH_TEXT.unknown }));
      void queryClient.invalidateQueries({ queryKey: teachKeys.list });
    } else {
      patch((current) => ({ sending: null, draft: back(current), sendError: readableError(error, TEACH_TEXT.failed) }));
    }
  }
}

function begin(id: number, kind: BusyKind, said = ''): boolean {
  if (ui.get().busy[id]) return false;
  patch((current) => ({
    busy: { ...current.busy, [id]: { kind, said, at: Date.now() } },
    errors: without(current.errors, id),
    unsent: without(current.unsent, id),
  }));
  return true;
}

function end(id: number, change: Partial<TeachUi> | ((current: TeachUi) => Partial<TeachUi>) = {}): void {
  patch((current) => ({ ...(typeof change === 'function' ? change(current) : change), busy: without(current.busy, id) }));
}

/** "מאשר". A second press is harmless on the server, so a lost answer is settled by reading the thread again. */
async function approve(queryClient: QueryClient, id: number): Promise<void> {
  if (!begin(id, 'approving')) return;
  try {
    const thread = await approveWahubTeach(id);
    land(queryClient, thread);
    end(id, (current) => ({ version: current.version + 1 }));
  } catch (error) {
    const lost = teachUnanswered(error) || teachAlreadySettled(error);
    const now = lost ? await reread(queryClient, id) : null;
    if (now?.state === 'applied') return end(id, (current) => ({ version: current.version + 1 }));
    end(id, (current) => ({
      errors: { ...current.errors, [id]: teachUnanswered(error) ? TEACH_TEXT.approveFailed : readableError(error, TEACH_TEXT.approveFailed) },
    }));
  }
}

/** "לא בדיוק…", or the answer to the bot's question. */
async function say(queryClient: QueryClient, id: number, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean || !begin(id, 'saying', clean)) return;
  try {
    const thread = await sayWahubTeach(id, clean);
    land(queryClient, thread);
    end(id, (current) => ({ version: current.version + 1, stalled: without(current.stalled, id) }));
  } catch (error) {
    const unanswered = teachUnanswered(error);
    if (unanswered) await reread(queryClient, id);
    end(id, (current) => ({
      errors: { ...current.errors, [id]: unanswered ? TEACH_TEXT.sayUnknown : readableError(error, TEACH_TEXT.sayFailed) },
      unsent: { ...current.unsent, [id]: clean },
    }));
  }
}

/** "בטל": from the card (the check did not pass), or from a row of the list. */
async function undo(queryClient: QueryClient, id: number, from: 'card' | 'row'): Promise<void> {
  if (!begin(id, 'undoing')) return;
  if (from === 'row') patch({ undoingId: id, rowError: null });
  const done = (change: Partial<TeachUi> = {}) =>
    end(id, (current) => ({ ...change, ...(from === 'row' ? { undoingId: null, askingId: null } : {}), version: current.version + 1 }));
  try {
    const thread = await undoWahubTeach(id);
    land(queryClient, thread);
    done();
  } catch (error) {
    // Nothing left to take back (409), or the answer was lost: the thread as it is now says what happened.
    const now = teachUnanswered(error) || teachAlreadySettled(error) ? await reread(queryClient, id) : null;
    if (now && (now.state === 'undone' || now.state === 'nothing')) return done();
    const text = teachUnanswered(error) ? TEACH_TEXT.undoFailed : readableError(error, TEACH_TEXT.undoFailed);
    if (from === 'row') done({ rowError: { id, text } });
    else end(id, (current) => ({ errors: { ...current.errors, [id]: text } }));
  }
}

const NO_PREVIEW: WahubTeachPreview = { question: '', before: null, after: null, pending: false, note: '' };
const NO_CHECK: WahubTeachCheck = { ran: 0, passed: 0, pending: false, lines: [], summary: '', details: [], technical: null };

/**
 * The parts of the open thread that the server makes a call at a time: the
 * check after an approval first (it asks the bot the very question of the
 * example), then the example. One call at a time, and only for the card on screen.
 */
function useSettle(thread: WahubTeachThread | undefined, busy: boolean): void {
  const queryClient = useQueryClient();
  const stalled = useSyncExternalStore(ui.subscribe, () => (thread ? ui.get().stalled[thread.id] : undefined), () => undefined);
  const id = thread?.id ?? null;
  const needCheck = Boolean(thread?.check?.pending) && !stalled?.check;
  const needPreview = Boolean(thread?.preview?.pending) && !stalled?.preview;

  useEffect(() => {
    if (id == null || busy || (!needCheck && !needPreview)) return;
    let alive = true;
    const merge = (change: (current: WahubTeachThread) => WahubTeachThread) =>
      queryClient.setQueryData<WahubTeachThread>(teachKeys.thread(id), (current) => (current ? change(current) : current));
    const stall = (part: 'preview' | 'check') =>
      patch((current) => ({ stalled: { ...current.stalled, [id]: { ...current.stalled[id], [part]: true } } }));
    void (async () => {
      if (needCheck) {
        const ended = await pollUntilSettled<WahubTeachCheck>({
          ask: async () => (await fetchWahubTeachCheck(id)) ?? NO_CHECK,
          pending: (check) => check.pending,
          onValue: (check) => merge((current) => ({ ...current, check: check === NO_CHECK ? null : check })),
          alive: () => alive,
        });
        if (ended === 'stalled') stall('check');
        // The check moved: this effect is run again for whatever is still missing.
        return;
      }
      const ended = await pollUntilSettled<WahubTeachPreview>({
        ask: async () => (await fetchWahubTeachPreview(id)) ?? NO_PREVIEW,
        pending: (preview) => preview.pending,
        onValue: (preview) => merge((current) => ({ ...current, preview: preview === NO_PREVIEW ? null : preview })),
        alive: () => alive,
      });
      if (ended === 'stalled') stall('preview');
    })();
    return () => {
      alive = false;
    };
  }, [busy, id, needCheck, needPreview, queryClient]);
}

export type TeachAvailability = 'loading' | 'ready' | 'unavailable' | 'failed';

/**
 * "ללמד את הבוט": the list of what was taught, the thread in the card, and the
 * things he can do — write a new explanation, approve, say "לא בדיוק", take a
 * change back, open an earlier one.
 */
export function useTeach() {
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(ui.subscribe, ui.get, () => START);

  const list = useInfiniteQuery({
    queryKey: teachKeys.list,
    queryFn: ({ pageParam }) => fetchWahubTeachPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: WahubTeachPage, pages: WahubTeachPage[]) => (last.more ? pages.length + 1 : undefined),
    staleTime: 15_000,
    retry: false,
  });

  const openId = state.openId;
  const opened = useQuery({
    queryKey: teachKeys.thread(openId ?? 0),
    queryFn: () => fetchWahubTeachThread(openId as number),
    enabled: openId != null,
    staleTime: 30_000,
    retry: false,
  });
  const thread = openId != null ? opened.data : undefined;
  const busy = openId != null ? state.busy[openId] : undefined;
  useSettle(thread, Boolean(busy));

  // The list is the first thing asked of the server: an answer in the shape of "דיוק" says it has no "ללמד" yet.
  const notBuilt = state.refused || (list.isError && teachNotBuilt(list.error));
  let availability: TeachAvailability = 'ready';
  if (notBuilt) availability = 'unavailable';
  else if (list.isPending) availability = 'loading';
  else if (list.isError && !list.data) availability = 'failed';

  const pages = list.data?.pages;
  const rows = useMemo(() => mergePages(pages ?? []), [pages]);

  const actions = useMemo(
    () => ({
      setDraft: (text: string) => patch({ draft: text, sendError: '' }),
      send: () => void send(queryClient),
      approve: (id: number) => void approve(queryClient, id),
      say: (id: number, text: string) => void say(queryClient, id, text),
      undo: (id: number, from: 'card' | 'row') => void undo(queryClient, id, from),
      open: (id: number | null) =>
        patch((current) => ({ openId: current.openId === id ? null : id, askingId: null, version: current.version + 1 })),
      close: () => patch({ openId: null }),
      askUndo: (id: number | null) => patch({ askingId: id, rowError: null }),
      /**
       * Words handed in from elsewhere (a check that did not pass): into the box, for him to finish.
       * True when they were put in; false for a hand-over that was already taken (the sub-tab was only opened again).
       */
      seed: (text: string, nonce: number): boolean => {
        if (!text || ui.get().seeded === nonce) return false;
        patch({ draft: text, sendError: '', openId: null, askingId: null, seeded: nonce });
        return true;
      },
    }),
    [queryClient],
  );

  const retryOpen = useCallback(() => void opened.refetch(), [opened]);

  return {
    availability,
    loadError: availability === 'failed' ? readableError(list.error, TEACH_TEXT.listFailed) : '',
    retryList: () => void list.refetch(),
    draft: state.draft,
    sending: state.sending,
    sendError: state.sendError,
    openId,
    thread,
    opening: openId != null && opened.isPending,
    openError: openId != null && opened.isError && !opened.data ? readableError(opened.error, TEACH_TEXT.openFailed) : '',
    retryOpen,
    busy: (busy?.kind ?? null) as TeachBusy,
    said: busy?.said ?? '',
    saidAt: busy?.at ?? 0,
    cardError: openId != null ? (state.errors[openId] ?? '') : '',
    unsent: openId != null ? (state.unsent[openId] ?? '') : '',
    previewStalled: Boolean(openId != null && state.stalled[openId]?.preview),
    checkStalled: Boolean(openId != null && state.stalled[openId]?.check),
    version: state.version,
    rows,
    count: pages?.[0]?.count ?? rows.length,
    more: Boolean(list.hasNextPage),
    loadingMore: list.isFetchingNextPage,
    loadMore: () => void list.fetchNextPage(),
    askingId: state.askingId,
    undoingId: state.undoingId,
    rowError: state.rowError,
    ...actions,
  };
}
