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
  setWahubLiveTest,
  setWahubNeedsHuman,
  serverAnswered,
  takeoverWahubContact,
} from '@/lib/wahubApi';
import { applyFollowupPatch } from '@/lib/wahub/followup';
import { israelToday } from '@/lib/wahub/format';
import type { FutureOutcome, HandToBotOutcome } from '@/lib/wahub/futureLeads';
import { addWahubNote, closeWahubConversation, handWahubToBot, setWahubFuture } from '@/lib/wahub/futureLeadsApi';
import { joinFailedText, noteFailedText } from '@/lib/wahub/waitingList';
import { addWahubWaitingEntry, deleteWahubNote, editWahubNote } from '@/lib/wahub/waitingListApi';
import type { WahubContact, WahubFollowupPatch, WahubNote, WahubTag, WahubUnderstood } from '@/types/wahub';
import type { WahubLiveHandle } from './useWahubLive';

/** Where a tab keeps its contacts: read one as it stands now, and put a newer copy in its place. */
export interface ContactStore {
  get(id: number): WahubContact | undefined;
  put(contact: WahubContact): void;
}

interface RunOptions {
  /** How the contact will read once saved — shown at once, taken back if the save fails. */
  optimistic?: (contact: WahubContact) => WahubContact;
  /** The contact as it now stands — or null when the answer carried none (the live update then brings it). */
  request: () => Promise<WahubContact | null>;
  /** Said when the server gives no reason of its own. */
  failure: string;
  /** Said when the server did not answer at all, so what happened is not known. Without it: `failure`. */
  unknown?: string;
  /**
   * Where the reason goes when the change was asked from a box of its own (the clock's bubble, the note):
   * said there, beside what was typed, rather than in a word that floats over the page.
   */
  report?: (reason: string) => void;
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
    async (id: number, options: RunOptions): Promise<boolean> => {
      const before = storeRef.current.get(id);
      const turn = (latest.current.get(id) ?? 0) + 1;
      latest.current.set(id, turn);
      inFlight.current.set(id, (inFlight.current.get(id) ?? 0) + 1);
      const snapshot = live.snapshot();
      if (before && options.optimistic) storeRef.current.put(options.optimistic(before));
      try {
        const saved = await options.request();
        // An older answer must not overwrite a newer press on the same contact.
        if (saved && latest.current.get(id) === turn) {
          storeRef.current.put(saved);
          onSavedRef.current?.(saved);
        }
        return true;
      } catch (error) {
        if (before && options.optimistic && latest.current.get(id) === turn) storeRef.current.put(before);
        const reason = options.unknown && !serverAnswered(error) ? options.unknown : readableError(error, options.failure);
        if (options.report) options.report(reason);
        else toast.error(reason);
        return false;
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
      /** Live test on or off. It tags the person in ManyChat, so nothing is shown before the server has answered. */
      liveTest(id: number, on: boolean) {
        return run(id, {
          request: () => setWahubLiveTest(id, on),
          failure: on ? 'הבדיקה החיה לא הופעלה' : 'הבדיקה החיה לא כובתה',
        });
      },

      // ✓, the clock and the note (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.3–ג.6). The first three may reach
      // ManyChat — the conversation goes back to the bot, or the bot is silenced — so, like a takeover,
      // nothing is shown until the server has answered.

      /** "✓ סגירת שיחה". All or nothing: a refusal means nothing changed. */
      close(id: number) {
        return run(id, {
          request: () => closeWahubConversation(id),
          failure: 'השיחה לא נסגרה',
          unknown: 'לא ידוע אם השיחה נסגרה. בדקו את מצב השיחה לפני שמנסים שוב.',
        });
      },

      /** "הבוט ימשיך לטפל": what the bot understood — or, in words, why the conversation was not handed over. */
      async handToBot(id: number): Promise<HandToBotOutcome> {
        // Filled by the request and by the refusal; read once both are over.
        const got: { understood: WahubUnderstood | null; reason: string } = { understood: null, reason: '' };
        await run(id, {
          request: async () => {
            const result = await handWahubToBot(id);
            got.understood = result.understood;
            return result.contact;
          },
          failure: 'השיחה לא הועברה לבוט',
          unknown: 'לא ידוע אם השיחה עברה לבוט. בדקו את מצב השיחה לפני שמנסים שוב.',
          report: (said) => {
            got.reason = said;
          },
        });
        return got.understood ? { understood: got.understood } : { error: got.reason || 'השיחה לא הועברה לבוט' };
      },

      /** "ליד עתידי שלי": saved — with whether the bot was silenced — or, in words, why it was not. */
      async future(id: number, due: string, reason: string): Promise<FutureOutcome> {
        const got: { mute: { muted: boolean; detail: string } | null; reason: string } = { mute: null, reason: '' };
        await run(id, {
          request: async () => {
            const result = await setWahubFuture(id, due, reason);
            got.mute = result.mute;
            return result.contact;
          },
          failure: 'הליד העתידי לא נשמר',
          unknown: 'לא ידוע אם הליד העתידי נשמר. בדקו בראש השיחה לפני ששומרים שוב.',
          report: (said) => {
            got.reason = said;
          },
        });
        return got.mute ?? { error: got.reason || 'הליד העתידי לא נשמר' };
      },

      /** A note about the customer. The note itself comes back, so it can stand in the conversation at once. */
      async note(id: number, text: string): Promise<{ note: WahubNote } | { error: string }> {
        const got: { note: WahubNote | null; reason: string } = { note: null, reason: '' };
        await run(id, {
          request: async () => {
            const result = await addWahubNote(id, text);
            got.note = result.note;
            return result.contact;
          },
          failure: 'הפתק לא נשמר',
          unknown: 'לא ידוע אם הפתק נשמר. בדקו בשיחה לפני ששומרים שוב.',
          report: (said) => {
            got.reason = said;
          },
        });
        return got.note ? { note: got.note } : { error: got.reason || 'הפתק לא נשמר' };
      },

      // Editing and deleting a note, and adding to a waiting list (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז.2, ז.5).
      // Each is asked from a box of its own, so the reason for a refusal is said there, in the screen's words.

      /** A note with other words. It comes back as the server now has it — in its place, marked "נערך". */
      async editNote(id: number, noteId: number, text: string): Promise<{ note: WahubNote } | { error: string }> {
        const got: { note: WahubNote | null; reason: string } = { note: null, reason: '' };
        await run(id, {
          request: async () => {
            try {
              const result = await editWahubNote(id, noteId, text);
              got.note = result.note;
              return result.contact;
            } catch (error) {
              got.reason = noteFailedText(error, 'הפתק לא נשמר');
              throw error;
            }
          },
          failure: 'הפתק לא נשמר',
          report: () => {},
        });
        return got.note ? { note: got.note } : { error: got.reason || 'הפתק לא נשמר' };
      },

      /** A note deleted for good. Resolves '' once it is gone, or why it is not. */
      async deleteNote(id: number, noteId: number): Promise<string> {
        const got = { reason: '' };
        const gone = await run(id, {
          request: async () => {
            try {
              return (await deleteWahubNote(id, noteId)).contact;
            } catch (error) {
              got.reason = noteFailedText(error, 'הפתק לא נמחק');
              throw error;
            }
          },
          failure: 'הפתק לא נמחק',
          report: () => {},
        });
        return gone ? '' : got.reason || 'הפתק לא נמחק';
      },

      /** "להוסיף לרשימת המתנה": resolves '' once the person is on the lesson's list, or why they are not. */
      async joinWaitingList(id: number, lessonId: string, child: string): Promise<string> {
        const got = { reason: '' };
        const joined = await run(id, {
          request: async () => {
            try {
              return (await addWahubWaitingEntry(id, lessonId, child)).contact;
            } catch (error) {
              got.reason = joinFailedText(error);
              throw error;
            }
          },
          failure: 'הלקוח לא נוסף לרשימת ההמתנה',
          report: () => {},
        });
        return joined ? '' : got.reason || 'הלקוח לא נוסף לרשימת ההמתנה';
      },
    }),
    [isPending, run],
  );
}

export type ContactMutations = ReturnType<typeof useContactMutations>;
