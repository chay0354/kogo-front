'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { failureStatus, fetchWahubContacts } from '@/lib/wahubApi';
import { appendPage, dedupeContacts, sortChats } from '@/lib/wahub/live';
import { WAHUB_PAGE_SIZE, contactsParams } from '@/lib/wahub/params';
import type { WahubContact, WahubContactsQuery } from '@/types/wahub';
import type { WahubLiveHandle } from './useWahubLive';

export type ListStatus = 'loading' | 'refreshing' | 'ready' | 'error';

interface ListState {
  items: WahubContact[];
  status: ListStatus;
  error: string;
  hasMore: boolean;
  /** How many pages of the server's list are on screen. */
  pages: number;
  loadingMore: boolean;
  /** The server's count for the whole list, as of the last read. */
  total: number | null;
}

const INITIAL: ListState = {
  items: [],
  status: 'loading',
  error: '',
  hasMore: false,
  pages: 0,
  loadingMore: false,
  total: null,
};

/** A quiet refresh reads back no more than this many pages; the rest are a "load more" away. */
const SILENT_REFRESH_MAX_PAGES = 3;

interface Options {
  /** What to list. The page is this hook's business; leave it out. */
  query: WahubContactsQuery;
  enabled: boolean;
  live: WahubLiveHandle;
  /** The conversations list is kept in order of the last message; the leads list is left as the server sent it. */
  sorted: boolean;
  /** A contact a quiet refresh must not drop — the conversation that is open. */
  keepId?: number | null;
}

/**
 * A list of contacts read page by page, that other code may then change in
 * place (a live update, a mark that was just saved) without reading it again.
 *
 * `itemsRef` always holds the list as of the last change, including changes
 * React has not drawn yet — every merge starts from it, so two changes in the
 * same moment never work from the same stale copy.
 */
export function usePagedContacts({ query, enabled, live, sorted, keepId = null }: Options) {
  const [state, setState] = useState<ListState>(INITIAL);
  const itemsRef = useRef<WahubContact[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);
  const dirty = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;
  const keepIdRef = useRef(keepId);
  keepIdRef.current = keepId;
  const queryKey = JSON.stringify(contactsParams(query));

  const order = useCallback((items: WahubContact[]) => (sorted ? sortChats(items) : items), [sorted]);

  const load = useCallback(
    async (mode: 'fresh' | 'silent') => {
      generation.current += 1;
      const mine = generation.current;
      if (mode === 'fresh') {
        setState((prev) => ({ ...prev, status: prev.items.length ? 'refreshing' : 'loading', error: '' }));
      }
      // Counting changes starts from a cursor, so the list is read after one is in hand.
      await live.whenReady();
      if (mine !== generation.current) return;
      const snapshot = live.snapshot();
      const pageCount =
        mode === 'silent' ? Math.min(Math.max(stateRef.current.pages, 1), SILENT_REFRESH_MAX_PAGES) : 1;
      try {
        const first = await fetchWahubContacts({ ...queryRef.current, page: 1, pageSize: WAHUB_PAGE_SIZE });
        let results = first.results;
        let hasMore = Boolean(first.next);
        let pages = 1;
        for (let page = 2; page <= pageCount && hasMore; page += 1) {
          // A page that is gone because the list got shorter is not a failure.
          const more = await fetchWahubContacts({ ...queryRef.current, page, pageSize: WAHUB_PAGE_SIZE }).catch(
            () => null,
          );
          if (!more) {
            hasMore = false;
            break;
          }
          results = results.concat(more.results);
          hasMore = Boolean(more.next);
          pages = page;
        }
        if (mine !== generation.current) return;

        let items = dedupeContacts(results);
        const keep = keepIdRef.current;
        if (mode === 'silent' && keep != null && !items.some((contact) => contact.id === keep)) {
          const held = itemsRef.current.find((contact) => contact.id === keep);
          if (held) items = [...items, held];
        }
        items = order(items);
        dirty.current = false;
        itemsRef.current = items;
        setState({
          items,
          status: 'ready',
          error: '',
          hasMore,
          pages,
          loadingMore: false,
          total: first.count,
        });
        live.rewind(snapshot);
      } catch (error) {
        if (mine !== generation.current) return;
        // A quiet refresh that failed leaves what is on screen exactly as it was.
        if (mode === 'silent') return;
        itemsRef.current = [];
        setState({ ...INITIAL, status: 'error', error: readableError(error, 'לא הצלחנו לטעון את הרשימה') });
      }
    },
    [live, order],
  );

  useEffect(() => {
    if (!enabled) return;
    void load('fresh');
    // `queryKey` is the query as text: the list is read again whenever what it lists changes.
  }, [enabled, queryKey, load]);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (current.loadingMore || !current.hasMore || current.status !== 'ready') return;
    const mine = generation.current;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      // When rows have left the list since it was read, the server's pages have
      // shifted up: the last page on screen is read again with the next one, so
      // nobody who slid into it is skipped.
      const pagesToRead =
        dirty.current && current.pages >= 1 ? [current.pages, current.pages + 1] : [current.pages + 1];
      const answers = await Promise.all(
        pagesToRead.map((page) =>
          fetchWahubContacts({ ...queryRef.current, page, pageSize: WAHUB_PAGE_SIZE }).catch((error) => {
            if (failureStatus(error) === 404) return null; // past the end
            throw error;
          }),
        ),
      );
      if (mine !== generation.current) return;
      const last = answers[answers.length - 1];
      const fresh = answers.flatMap((answer) => answer?.results ?? []);
      const items = order(appendPage(itemsRef.current, fresh));
      itemsRef.current = items;
      setState((prev) => ({
        ...prev,
        items,
        pages: last ? prev.pages + 1 : prev.pages,
        hasMore: Boolean(last?.next),
        loadingMore: false,
        total: last?.count ?? prev.total,
      }));
    } catch (error) {
      if (mine !== generation.current) return;
      setState((prev) => ({ ...prev, loadingMore: false }));
      toast.error(readableError(error, 'לא הצלחנו לטעון עוד'));
    }
  }, [order]);

  /** Change the list in place. The function gets the list as it stands right now. */
  const update = useCallback((change: (items: WahubContact[]) => WahubContact[]) => {
    const next = change(itemsRef.current);
    if (next === itemsRef.current) return;
    itemsRef.current = next;
    setState((prev) => ({ ...prev, items: next }));
  }, []);

  const find = useCallback(
    (id: number) => itemsRef.current.find((contact) => contact.id === id),
    [],
  );

  const reload = useCallback(() => load('fresh'), [load]);
  const refreshQuietly = useCallback(() => load('silent'), [load]);
  /** Rows left the list without it being read again; the next "load more" allows for the shift. */
  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);

  return {
    items: state.items,
    status: state.status,
    error: state.error,
    hasMore: state.hasMore,
    loadingMore: state.loadingMore,
    total: state.total,
    itemsRef,
    update,
    find,
    reload,
    refreshQuietly,
    loadMore,
    markDirty,
  };
}

export type PagedContacts = ReturnType<typeof usePagedContacts>;
