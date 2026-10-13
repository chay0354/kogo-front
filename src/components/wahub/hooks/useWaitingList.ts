'use client';

import { useCallback, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  notifyFailure,
  notifyOutcome,
  previewAskingAgain,
  type NotifyOpen,
  type NotifyOutcome,
} from '@/lib/wahub/waitingList';
import { fetchWahubNotifyPreview, fetchWahubWaitingLessons, fetchWahubWaitingList, sendWahubNotify } from '@/lib/wahub/waitingListApi';
import { wahubKeys } from './useWahubQueries';

/**
 * The reading of the full waiting list and of the lessons that can be chosen
 * for it, and the telling of a customer that a place was freed
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז).
 *
 * The keys stand under the leads' own (`['wahub', 'leads2', …]`), so whatever
 * reads the leads again — a change to a lead, a message that just came in —
 * reads these again with them.
 */
export const waitingKeys = {
  all: ['wahub', 'leads2', 'waiting'] as const,
  list: ['wahub', 'leads2', 'waiting', 'list'] as const,
  lessons: (contactId: number | null, q: string, branch: string) => ['wahub', 'leads2', 'waiting', 'lessons', contactId ?? 0, q, branch] as const,
};

/** The list is read again this often while its screen is in front. */
const LIST_INTERVAL_MS = 30_000;
/** A server without a waiting list is asked again only now and then, in case it was just released. */
const MISSING_INTERVAL_MS = 5 * 60_000;

/**
 * Everybody who waits, by lesson. `null`: the server has no waiting list — nothing of it is offered.
 * `live`: the screen that shows it is in front, so it is kept fresh; elsewhere it is read once and kept
 * (the conversations only ask it what the server can do).
 */
export function useWaitingList(enabled: boolean, live = false) {
  return useQuery({
    queryKey: waitingKeys.list,
    queryFn: () => fetchWahubWaitingList(),
    enabled,
    refetchInterval: (query) => (!live ? false : query.state.data === null ? MISSING_INTERVAL_MS : LIST_INTERVAL_MS),
    staleTime: live ? 10_000 : 5 * 60_000,
    retry: false,
  });
}

/**
 * The lessons somebody can be put on the list of, narrowed by what was typed and by a branch. While the next
 * answer is on its way the rows that are there stay. `null`: the server cannot list them.
 */
export function useLessonOptions(contactId: number | null, q: string, branch: string, enabled: boolean) {
  return useQuery({
    queryKey: waitingKeys.lessons(contactId, q, branch),
    queryFn: () => fetchWahubWaitingLessons({ q, branch, contact: contactId }),
    enabled: enabled && contactId != null,
    staleTime: 0,
    gcTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

function statusOf(error: unknown): number | null {
  return (error as { response?: { status?: number } })?.response?.status ?? null;
}

/**
 * "להודיע ללקוח" on an entry whose place was freed (ז.4). A press first reads what would go out — the wording,
 * how, and why not when it would not; only the second press sends.
 *
 * One message, never two: while a send is on its way nothing else can be pressed (and a second press that got
 * through anyway is dropped here); a send that was never answered is not tried again by itself — it may have
 * gone out; and a customer who was already told of this place is told again only after the question was
 * answered, with `again`.
 */
export function useNotify() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<NotifyOpen | null>(null);
  const held = useRef<NotifyOpen | null>(null);
  held.current = open;
  /** Goes up whenever the block is opened or closed, so a reading knows whether it is still the one waited for. */
  const turn = useRef(0);
  const sending = useRef(false);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['wahub', 'leads2'] });
    void queryClient.invalidateQueries({ queryKey: wahubKeys.summary });
  }, [queryClient]);

  const start = useCallback(
    async (entryId: number) => {
      if (sending.current) return;
      const mine = ++turn.current;
      setOpen({ entryId, step: { step: 'loading' } });
      try {
        const preview = await fetchWahubNotifyPreview(entryId);
        if (turn.current !== mine) return;
        setOpen(
          preview
            ? { entryId, step: { step: 'ready', preview, sending: false } }
            : { entryId, step: { step: 'held', text: 'אי אפשר להודיע ללקוח מכאן כרגע.' } },
        );
      } catch (error) {
        if (turn.current !== mine) return;
        if (statusOf(error) === 404) {
          setOpen(null);
          toast.error('הרשומה כבר לא ברשימת ההמתנה.');
          refresh();
          return;
        }
        setOpen({ entryId, step: { step: 'held', text: readableError(error, 'לא הצלחנו לבדוק מה ייצא ללקוח. נסו שוב.') } });
      }
    },
    [refresh],
  );

  const send = useCallback(async () => {
    const now = held.current;
    if (!now || now.step.step !== 'ready' || now.step.sending || !now.step.preview.can || sending.current) return;
    sending.current = true;
    const { entryId } = now;
    const { preview } = now.step;
    setOpen({ entryId, step: { step: 'ready', preview, sending: true } });
    let outcome: NotifyOutcome;
    try {
      outcome = notifyOutcome(await sendWahubNotify(entryId, preview.needs_again));
    } catch (error) {
      outcome = notifyFailure(error);
    } finally {
      sending.current = false;
    }
    switch (outcome.kind) {
      case 'sent':
        toast.success(outcome.text);
        setOpen(null);
        break;
      case 'gone':
        toast.error(outcome.text);
        setOpen(null);
        break;
      case 'busy':
        toast.message(outcome.text);
        setOpen(null);
        break;
      case 'ask':
        setOpen({ entryId, step: { step: 'ready', preview: previewAskingAgain(preview, outcome.at, outcome.by), sending: false } });
        break;
      case 'held':
        setOpen({ entryId, step: { step: 'held', text: outcome.text } });
        break;
    }
    // Whichever way it went, the entry is read again: "הודענו ללקוח", a place that was taken, a line that moved.
    refresh();
  }, [refresh]);

  /** Puts the block away — but not from under a send that is on its way. */
  const close = useCallback(() => {
    if (sending.current) return;
    turn.current += 1;
    setOpen(null);
  }, []);

  return { open, start, send, close };
}

export type Notify = ReturnType<typeof useNotify>;
