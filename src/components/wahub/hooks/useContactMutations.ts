'use client';

import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  analyzeWahubContact,
  patchWahubFollowup,
  putWahubTags,
  recheckWahubContact,
  releaseWahubContact,
  renameWahubContact,
  setWahubNeedsHuman,
  takeoverWahubContact,
} from '@/lib/wahubApi';
import { applyFollowupPatch } from '@/lib/wahub/followup';
import { israelToday } from '@/lib/wahub/format';
import type { WahubContact, WahubFollowupPatch, WahubTag } from '@/types/wahub';
import type { WahubLiveHandle } from './useWahubLive';

/** Where a tab keeps its contacts: read one as it stands now, and put a newer copy in its place. */
export interface ContactStore {
  get(id: number): WahubContact | undefined;
  put(contact: WahubContact): void;
}

interface RunOptions {
  /** How the contact will read once saved — shown at once, taken back if the save fails. */
  optimistic?: (contact: WahubContact) => WahubContact;
  request: () => Promise<WahubContact>;
  /** Said when the server gives no reason of its own. */
  failure: string;
}

/**
 * Every change a person makes to a contact, saved the same way.
 *
 * The change is shown the moment it is made. If the server refuses, what was
 * there before is put back and the reason is said in Hebrew — a mark that was
 * not saved must never look saved. While a save is on its way the live update
 * leaves that contact alone, and once it has landed the poll is asked to repeat
 * everything since the save began, so nothing that happened meanwhile is lost.
 */
export function useContactMutations(store: ContactStore, live: WahubLiveHandle, onSaved?: (contact: WahubContact) => void) {
  const storeRef = useRef(store);
  storeRef.current = store;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const inFlight = useRef(new Map<number, number>());
  const latest = useRef(new Map<number, number>());

  const run = useCallback(
    async (id: number, options: RunOptions): Promise<WahubContact | null> => {
      const before = storeRef.current.get(id);
      const turn = (latest.current.get(id) ?? 0) + 1;
      latest.current.set(id, turn);
      inFlight.current.set(id, (inFlight.current.get(id) ?? 0) + 1);
      const snapshot = live.snapshot();
      if (before && options.optimistic) storeRef.current.put(options.optimistic(before));
      try {
        const saved = await options.request();
        // An older answer must not overwrite a newer press on the same contact.
        if (latest.current.get(id) === turn) {
          storeRef.current.put(saved);
          onSavedRef.current?.(saved);
        }
        return saved;
      } catch (error) {
        if (before && options.optimistic && latest.current.get(id) === turn) storeRef.current.put(before);
        toast.error(readableError(error, options.failure));
        return null;
      } finally {
        const left = (inFlight.current.get(id) ?? 1) - 1;
        if (left <= 0) inFlight.current.delete(id);
        else inFlight.current.set(id, left);
        live.rewind(snapshot);
      }
    },
    [live],
  );

  const isPending = useCallback((id: number) => inFlight.current.has(id), []);

  return useMemo(
    () => ({
      isPending,

      followup(id: number, patch: WahubFollowupPatch) {
        return run(id, {
          optimistic: (contact) => applyFollowupPatch(contact, patch, israelToday()),
          request: () => patchWahubFollowup(id, patch),
          failure: 'השינוי לא נשמר',
        });
      },

      tags(id: number, tags: WahubTag[]) {
        return run(id, {
          optimistic: (contact) => ({ ...contact, tags }),
          request: () => putWahubTags(id, tags.map((tag) => tag.id)),
          failure: 'התגיות לא נשמרו',
        });
      },

      rename(id: number, name: string) {
        return run(id, {
          optimistic: (contact) => ({ ...contact, name }),
          request: () => renameWahubContact(id, name),
          failure: 'השם לא נשמר',
        });
      },

      /** "טופל": the request for a person was dealt with. */
      resolveNeedsHuman(id: number) {
        return run(id, {
          optimistic: (contact) => ({
            ...contact,
            chat: { ...contact.chat, needs_human: false, needs_human_reason: '', needs_human_at: null },
          }),
          request: () => setWahubNeedsHuman(id, { needs_human: false }),
          failure: 'הסימון לא נשמר',
        });
      },

      // These four reach outside Kogo (ManyChat, the summary) or read the
      // registrations again. Their result is not ours to assume, so nothing is
      // shown until the server has answered.
      takeover(id: number) {
        return run(id, { request: () => takeoverWahubContact(id), failure: 'לא הצלחנו לקחת את השיחה' });
      },
      release(id: number) {
        return run(id, { request: () => releaseWahubContact(id), failure: 'לא הצלחנו להחזיר את השיחה לבוט' });
      },
      recheck(id: number) {
        return run(id, { request: () => recheckWahubContact(id), failure: 'הבדיקה מול המערכת נכשלה' });
      },
      analyze(id: number) {
        return run(id, { request: () => analyzeWahubContact(id), failure: 'הסיכום נכשל' });
      },
    }),
    [isPending, run],
  );
}

export type ContactMutations = ReturnType<typeof useContactMutations>;
