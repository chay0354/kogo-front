'use client';

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { fetchWahubContacts } from '@/lib/wahubApi';
import { patchContactsInPlace, sortChats } from '@/lib/wahub/live';
import { applyOverdue, knowsOverdue } from '@/lib/wahub/overdue';
import { WAHUB_MAX_PAGE_SIZE } from '@/lib/wahub/params';
import type { WahubContact, WahubOverdueRow } from '@/types/wahub';
import type { ContactThread } from './useContactThread';
import type { WahubLiveHandle } from './useWahubLive';

/** The words of a mark that is not late yet are read again this often, while such a mark is on screen. */
export const WAIT_REFRESH_MS = 60_000;

interface Options {
  /** The conversations tab is the one on screen. */
  active: boolean;
  live: WahubLiveHandle;
  /** Who is past three office hours as of the last poll; null on a server that does not say. */
  overdue: ReadonlyArray<WahubOverdueRow> | null;
  /** The conversations on screen. */
  items: ReadonlyArray<WahubContact>;
  /** Change the list in place (usePagedContacts). */
  update: (change: (items: WahubContact[]) => WahubContact[]) => void;
  /** A change to this contact is being saved right now: it is left alone. */
  isPending: (id: number) => boolean;
  /** A search is on: its results keep their own order, and nobody is pinned. */
  searchRef: MutableRefObject<string>;
  openIdRef: MutableRefObject<number | null>;
  threadRef: MutableRefObject<ContactThread | null>;
}

/**
 * Keeps "how long they wait" true on a list that nobody is touching
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.2.5). A conversation crosses the three
 * office hours by the clock alone — no message, no press — so:
 *
 *  - every poll names who is past the line now; they are marked, given the
 *    fresh words of their mark, and the list is put back in the server's order
 *    — which brings them to its head. Somebody the poll no longer names goes
 *    back to their place;
 *  - the words of a mark that is not late yet ("מחכה 40 דק׳") are the server's
 *    too — it alone knows the office's hours — and nothing sends them again by
 *    itself. While such a mark is on screen, the conversations that wait for a
 *    person are read once a minute and laid over the rows that are there. No
 *    row is added and none is dropped by it.
 *
 * The open conversation is kept in step with its row. On a server built before
 * all this nothing here ever runs.
 */
export function useWaitMarks({ active, live, overdue, items, update, isPending, searchRef, openIdRef, threadRef }: Options): void {
  // What the poll said: over the list, and over the open conversation.
  useEffect(() => {
    if (!overdue) return;
    const options = { skip: isPending };
    update((list) => {
      const laid = applyOverdue(list, overdue, options);
      return laid === list ? list : sortChats(laid, !searchRef.current);
    });
    const open = threadRef.current?.stateRef.current.contact;
    if (open) {
      const [laid] = applyOverdue([open], overdue, options);
      if (laid !== open) threadRef.current?.putContact(laid);
    }
  }, [isPending, overdue, searchRef, threadRef, update]);

  const reading = useRef(false);
  const refresh = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    // Whatever the poll brings while this read is out is asked for again afterwards, so an older picture never stays.
    const snapshot = live.snapshot();
    try {
      // Everybody who waits for a person stands in "פתוחות" (ט.2.2), whatever box is in front.
      const page = await fetchWahubContacts({ view: 'chats', box: 'open', page: 1, pageSize: WAHUB_MAX_PAGE_SIZE });
      const fresh = page.results.filter((contact) => !isPending(contact.id));
      update((list) => {
        const next = patchContactsInPlace(list, fresh);
        return next === list ? list : sortChats(next, !searchRef.current);
      });
      const mine = fresh.find((contact) => contact.id === openIdRef.current);
      if (mine) threadRef.current?.putContact(mine);
      live.rewind(snapshot);
    } catch {
      // The marks stay as they were; the next minute asks again.
    } finally {
      reading.current = false;
    }
  }, [isPending, live, openIdRef, searchRef, threadRef, update]);

  // Is there a mark on screen whose words would otherwise stand still?
  const ticking = items.some((contact) => knowsOverdue(contact) && contact.chat.overdue !== true && Boolean(contact.chat.waiting_label));
  useEffect(() => {
    if (!active || !ticking) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, WAIT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh, ticking]);
}
