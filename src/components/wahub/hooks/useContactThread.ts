'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  fetchWahubContact,
  fetchWahubMessages,
  isWindowClosed,
  markWahubRead,
  sendWahubFlow,
  sendWahubOpening,
  sendWahubText,
  serverAnswered,
} from '@/lib/wahubApi';
import { attachmentFailure, sendAttachment } from '@/lib/wahub/attachmentSend';
import { openingOutcomeOf, type OpenerKind, type OpeningOutcome } from '@/lib/wahub/composer';
import { logMoved, mergeContactIntoDetail, messagesMoved } from '@/lib/wahub/live';
import {
  changedMessages,
  dropOptimistic,
  firstServerMessageId,
  lastServerMessageId,
  makeOptimisticMessage,
  mergeMessages,
  newMessages,
  oldestWaitingRecordingId,
  settleOptimistic,
} from '@/lib/wahub/messages';
import type { WahubContact, WahubContactDetail, WahubMessage } from '@/types/wahub';
import { LIVE_INTERVAL_MS } from './useWahubLive';

export type ThreadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ThreadState {
  contactId: number | null;
  /** The contact with its log and the children found in Kogo. Its `messages` are kept apart, below. */
  contact: WahubContactDetail | null;
  messages: WahubMessage[];
  hasOlder: boolean;
  status: ThreadStatus;
  error: string;
  loadingOlder: boolean;
  sending: boolean;
  /** Goes up each time earlier messages are added above, so the view can hold its place. */
  olderLoads: number;
}

const EMPTY: ThreadState = {
  contactId: null,
  contact: null,
  messages: [],
  hasOlder: false,
  status: 'idle',
  error: '',
  loadingOlder: false,
  sending: false,
  olderLoads: 0,
};

interface Options {
  contactId: number | null;
  /** The conversation is in front of the user: poll it, and count what arrives as read. */
  active: boolean;
  /** The contact as the list already has it, so the header shows before the messages do. */
  seed?: WahubContact;
  /** A newer copy of the contact came back from the server (after read, send, …). */
  onContact: (contact: WahubContact) => void;
  /** The name written on a message the office sends, until the server's copy replaces it. */
  senderName?: string | null;
  /**
   * A change to this contact is being saved right now. A quiet re-read then
   * leaves the contact's own fields as the screen has them — the save's answer
   * is on its way and must not be preceded by an older picture.
   */
  isSaving?: (id: number) => boolean;
}

/**
 * One open conversation: its messages, kept live.
 *
 * New messages are asked for by id ("anything after the last one I have?"), so
 * a poll can never skip one or bring one twice. A message the office sends is
 * shown at once and replaced by the server's copy when it answers.
 */
export function useContactThread({ contactId, active, seed, onContact, senderName = null, isSaving }: Options) {
  const [state, setState] = useState<ThreadState>(EMPTY);
  const ref = useRef<ThreadState>(EMPTY);
  const generation = useRef(0);
  const polling = useRef(false);
  const reading = useRef(new Set<number>());
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;
  const onContactRef = useRef(onContact);
  onContactRef.current = onContact;
  const activeRef = useRef(active);
  activeRef.current = active;
  const seedRef = useRef(seed);
  seedRef.current = seed;

  const commit = useCallback((change: (prev: ThreadState) => ThreadState) => {
    const next = change(ref.current);
    ref.current = next;
    setState(next);
  }, []);

  const markRead = useCallback(async (id: number) => {
    // One at a time per conversation; moving to another one must not wait for this.
    if (reading.current.has(id)) return;
    reading.current.add(id);
    try {
      const contact = await markWahubRead(id);
      onContactRef.current(contact);
    } catch {
      // Not worth a message: the count is corrected by the next read that works.
    } finally {
      reading.current.delete(id);
    }
  }, []);

  /** Read the whole contact again and lay it over what is shown. Messages are merged, never replaced. */
  const refresh = useCallback(
    async (mode: 'open' | 'quiet') => {
      const id = ref.current.contactId;
      if (id == null) return;
      const mine = generation.current;
      try {
        const detail = await fetchWahubContact(id);
        if (mine !== generation.current) return;
        const saving = mode === 'quiet' && isSavingRef.current?.(id) === true;
        commit((prev) => ({
          ...prev,
          contact:
            saving && prev.contact
              ? {
                  ...prev.contact,
                  events: detail.events,
                  // The notes come only with the whole contact, like the log they are part of.
                  notes: detail.notes ?? prev.contact.notes,
                  kogo: { ...prev.contact.kogo, children: detail.kogo.children },
                }
              : { ...detail, messages: [] },
          messages: mergeMessages(prev.messages, detail.messages),
          // Once earlier messages were loaded, the answer about "the last 50" no longer applies.
          hasOlder: mode === 'open' || prev.olderLoads === 0 ? detail.has_older : prev.hasOlder,
          status: 'ready',
          error: '',
        }));
        if (mode === 'open') {
          // The lists carry the contact without its messages and its log.
          const { messages: _messages, events: _events, has_older: _hasOlder, ...contact } = detail;
          onContactRef.current(contact);
        }
        // Opening a conversation marks it read. A quiet re-read only does so when something is unread.
        const inView = activeRef.current && document.visibilityState === 'visible';
        if (inView && (mode === 'open' || detail.chat.unread_count > 0)) void markRead(id);
      } catch (error) {
        if (mine !== generation.current) return;
        if (mode === 'quiet') return;
        commit((prev) => ({
          ...prev,
          status: 'error',
          error: readableError(error, 'לא הצלחנו לטעון את השיחה'),
        }));
      }
    },
    [commit, markRead],
  );

  // Opening a conversation.
  useEffect(() => {
    generation.current += 1;
    if (contactId == null) {
      ref.current = EMPTY;
      setState(EMPTY);
      return;
    }
    const seeded = seedRef.current && seedRef.current.id === contactId ? seedRef.current : null;
    const next: ThreadState = {
      ...EMPTY,
      contactId,
      contact: seeded ? { ...seeded, messages: [], events: [], has_older: false } : null,
      status: 'loading',
    };
    ref.current = next;
    setState(next);
    void refresh('open');
  }, [contactId, refresh]);

  /** "Anything after the last message I have?" */
  const poll = useCallback(async () => {
    const current = ref.current;
    if (current.contactId == null || current.status !== 'ready' || polling.current) return;
    const id = current.contactId;
    const mine = generation.current;
    const after = lastServerMessageId(current.messages);
    polling.current = true;
    try {
      if (after == null) {
        // Nothing to count from yet: read the conversation itself.
        await refresh('quiet');
        return;
      }
      // A recording still waiting for its transcript is read again with the new messages:
      // the server writes the words on it later, and its id is behind "the last one I have".
      const waiting = oldestWaitingRecordingId(current.messages, Date.now());
      const from = waiting != null && waiting - 1 < after ? waiting - 1 : after;
      const page = await fetchWahubMessages(id, { after: from });
      if (mine !== generation.current) return;
      const fresh = newMessages(ref.current.messages, page.messages);
      const moved = changedMessages(ref.current.messages, page.messages);
      if (!moved.length) return;
      commit((prev) => ({ ...prev, messages: mergeMessages(prev.messages, moved) }));
      if (!fresh.length) return;
      const gotInbound = fresh.some((message) => message.direction === 'in');
      if (gotInbound && activeRef.current && document.visibilityState === 'visible') void markRead(id);
    } catch {
      // The strip at the top of the page already says the connection is down.
    } finally {
      polling.current = false;
    }
  }, [commit, markRead, refresh]);

  // Every three seconds while the conversation is in view; at once on return.
  useEffect(() => {
    if (!active || contactId == null) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    const timer = window.setInterval(tick, LIVE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh('quiet');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, contactId, poll, refresh]);

  /** The contact changed somewhere (a live update, a save). Keep the conversation in step. */
  const putContact = useCallback(
    (contact: WahubContact) => {
      if (ref.current.contactId !== contact.id || !ref.current.contact) return;
      commit((prev) => (prev.contact ? { ...prev, contact: mergeContactIntoDetail(prev.contact, contact) } : prev));
    },
    [commit],
  );

  /**
   * The live update named this conversation. If a message came or went, ask for
   * it now rather than at the next tick. If something that is written to the
   * log changed (a mark set elsewhere, a re-check, a handover), read the whole
   * contact — its log and the children found in Kogo only come that way.
   */
  const onLiveContact = useCallback(
    (contact: WahubContact) => {
      const held = ref.current.contact;
      if (ref.current.contactId !== contact.id) return;
      const readAll = !held || logMoved(held, contact);
      const askForMessages = !held || messagesMoved(held, contact);
      putContact(contact);
      if (readAll) void refresh('quiet');
      else if (askForMessages) void poll();
    },
    [poll, putContact, refresh],
  );

  /**
   * Messages that came back from a request of the screen's own (a demo message
   * the owner typed, the new bot's answer): into the conversation now, not at
   * the next poll. The poll brings the same ids later and they are drawn once.
   */
  const putMessages = useCallback(
    (contactId: number, incoming: ReadonlyArray<WahubMessage>) => {
      if (!incoming.length || ref.current.contactId !== contactId) return;
      commit((prev) => ({ ...prev, messages: mergeMessages(prev.messages, incoming) }));
    },
    [commit],
  );

  /**
   * The bubble the screen made up for a demo message gives way to the server's
   * copy — or simply goes, when the server did not keep the message.
   */
  const settleMessage = useCallback(
    (contactId: number, tempId: number, saved: WahubMessage | null) => {
      if (ref.current.contactId !== contactId) return;
      commit((prev) => ({
        ...prev,
        messages: saved ? settleOptimistic(prev.messages, tempId, saved) : dropOptimistic(prev.messages, tempId),
      }));
    },
    [commit],
  );

  const loadOlder = useCallback(async () => {
    const current = ref.current;
    if (current.contactId == null || current.loadingOlder || !current.hasOlder) return;
    const before = firstServerMessageId(current.messages);
    if (before == null) return;
    const id = current.contactId;
    const mine = generation.current;
    commit((prev) => ({ ...prev, loadingOlder: true }));
    try {
      const page = await fetchWahubMessages(id, { before, limit: 50 });
      if (mine !== generation.current) return;
      commit((prev) => ({
        ...prev,
        messages: mergeMessages(prev.messages, page.messages),
        hasOlder: page.has_older,
        loadingOlder: false,
        olderLoads: prev.olderLoads + 1,
      }));
    } catch (error) {
      if (mine !== generation.current) return;
      commit((prev) => ({ ...prev, loadingOlder: false }));
      toast.error(readableError(error, 'לא הצלחנו לטעון הודעות קודמות'));
    }
  }, [commit]);

  /**
   * Send free text. Resolves true when the server took the message (whether or
   * not it then reached WhatsApp), false when it must be typed again.
   */
  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const current = ref.current;
      const id = current.contactId;
      if (id == null || current.sending) return false;
      const mine = generation.current;
      const tempId = -Date.now();
      const bubble = makeOptimisticMessage(text, tempId, new Date(), senderName);
      commit((prev) => ({ ...prev, messages: mergeMessages(prev.messages, [bubble]), sending: true }));
      try {
        const result = await sendWahubText(id, text);
        onContactRef.current(result.contact);
        if (mine === generation.current) {
          commit((prev) => ({
            ...prev,
            messages: settleOptimistic(prev.messages, tempId, result.message),
            sending: false,
          }));
        }
        if (result.message.status === 'failed') {
          toast.error(`ההודעה לא נשלחה${result.message.error ? `: ${result.message.error}` : ''}`);
        }
        return true;
      } catch (error) {
        if (mine === generation.current) {
          commit((prev) => ({ ...prev, messages: dropOptimistic(prev.messages, tempId), sending: false }));
        }
        if (isWindowClosed(error)) {
          // The 24 hours ran out while the box was open: lock it now.
          const held = ref.current.contact;
          if (held && held.id === id) {
            onContactRef.current({ ...held, chat: { ...held.chat, can_free_text: false } });
          }
          toast.error(readableError(error, 'עברו 24 שעות מההודעה האחרונה של הלקוח. אפשר לשלוח רק תבנית'));
        } else if (!serverAnswered(error)) {
          toast.error('לא ידוע אם ההודעה נשלחה. בדקו בשיחה לפני ששולחים שוב.');
          void poll();
        } else {
          toast.error(readableError(error, 'ההודעה לא נשלחה'));
        }
        return false;
      }
    },
    [commit, poll, senderName],
  );

  /** Send a ManyChat automation ("תבנית"). */
  const sendFlow = useCallback(
    async (automationId: string): Promise<boolean> => {
      const current = ref.current;
      const id = current.contactId;
      if (id == null || current.sending) return false;
      const mine = generation.current;
      commit((prev) => ({ ...prev, sending: true }));
      try {
        const result = await sendWahubFlow(id, automationId);
        onContactRef.current(result.contact);
        if (mine === generation.current) {
          commit((prev) => ({
            ...prev,
            messages: mergeMessages(prev.messages, [result.message]),
            sending: false,
          }));
        }
        if (result.message.status === 'failed') {
          toast.error(`התבנית לא נשלחה${result.message.error ? `: ${result.message.error}` : ''}`);
        }
        return true;
      } catch (error) {
        if (mine === generation.current) commit((prev) => ({ ...prev, sending: false }));
        if (!serverAnswered(error)) {
          toast.error('לא ידוע אם התבנית נשלחה. בדקו בשיחה לפני ששולחים שוב.');
          void poll();
        } else {
          toast.error(readableError(error, 'התבנית לא נשלחה'));
        }
        return false;
      }
    },
    [commit, poll],
  );

  /** The 24 hours ran out while the box was open: lock it now. */
  const lockWindow = useCallback((id: number) => {
    const held = ref.current.contact;
    if (held && held.id === id) onContactRef.current({ ...held, chat: { ...held.chat, can_free_text: false } });
  }, []);

  /**
   * "פתיחת שיחה" / "המשך שיחה" (lib/wahub/composer.ts): sent at once, no step
   * to confirm. Resolves what to say under the buttons — the line itself lands
   * in the conversation either way; nothing is said twice in a toast.
   */
  const sendOpening = useCallback(
    async (kind: OpenerKind): Promise<OpeningOutcome> => {
      const current = ref.current;
      const id = current.contactId;
      if (id == null || current.sending) return { ok: false, text: '' };
      const mine = generation.current;
      commit((prev) => ({ ...prev, sending: true }));
      try {
        const result = await sendWahubOpening(id, kind);
        onContactRef.current(result.contact);
        if (mine === generation.current) {
          commit((prev) => ({ ...prev, messages: mergeMessages(prev.messages, [result.message]), sending: false }));
        }
        return openingOutcomeOf(result.message);
      } catch (error) {
        if (mine === generation.current) commit((prev) => ({ ...prev, sending: false }));
        if (!serverAnswered(error)) {
          void poll();
          return { ok: false, text: 'לא ידוע אם ההודעה נשלחה. בדקו בשיחה לפני ששולחים שוב.' };
        }
        return { ok: false, text: readableError(error, 'ההודעה לא נשלחה') };
      }
    },
    [commit, poll],
  );

  /**
   * A picture, a video or a document, with the box's words as its caption — in
   * three steps (docs/WAHUB-CONTRACT.md, "צירוף קבצים"): the server checks it
   * and hands out an address, the browser uploads it there, the server sends
   * it. `onPhase` says which step is on. Resolves true when the server took the
   * message (whether or not it then reached WhatsApp), false when it must be sent again.
   */
  const sendMedia = useCallback(
    async (file: File, caption: string, onPhase?: (phase: 'upload' | 'send') => void): Promise<boolean> => {
      const current = ref.current;
      const id = current.contactId;
      if (id == null || current.sending) return false;
      const mine = generation.current;
      commit((prev) => ({ ...prev, sending: true }));
      try {
        const result = await sendAttachment(id, file, caption, onPhase);
        onContactRef.current(result.contact);
        if (mine === generation.current) {
          commit((prev) => ({ ...prev, messages: mergeMessages(prev.messages, [result.message]), sending: false }));
        }
        if (result.message.status === 'failed') {
          toast.error(`הקובץ לא נשלח${result.message.error ? `: ${result.message.error}` : ''}`);
        }
        return true;
      } catch (failure) {
        if (mine === generation.current) commit((prev) => ({ ...prev, sending: false }));
        const said = attachmentFailure(failure);
        if (said.windowClosed) lockWindow(id);
        if (said.unknown) void poll();
        toast.error(said.text);
        return false;
      }
    },
    [commit, lockWindow, poll],
  );

  const retry = useCallback(() => {
    if (ref.current.contactId == null) return;
    commit((prev) => ({ ...prev, status: 'loading', error: '' }));
    void refresh('open');
  }, [commit, refresh]);

  const composerSends: ComposerSends = { sendOpening, sendMedia };

  return {
    contactId: state.contactId,
    contact: state.contact,
    messages: state.messages,
    hasOlder: state.hasOlder,
    status: state.status,
    error: state.error,
    loadingOlder: state.loadingOlder,
    sending: state.sending,
    olderLoads: state.olderLoads,
    stateRef: ref,
    putContact,
    onLiveContact,
    putMessages,
    settleMessage,
    loadOlder,
    send,
    sendFlow,
    // Optional in the type: a thread made by hand (a test, a screen of its own) need not carry them, and the box
    // then offers what it always did.
    ...(composerSends as Partial<ComposerSends>),
    refreshQuietly: useCallback(() => refresh('quiet'), [refresh]),
    retry,
  };
}

/** What the writing box sends beyond words and a template (15.10.2026): an opener, and a file. */
interface ComposerSends {
  sendOpening: (kind: OpenerKind) => Promise<OpeningOutcome>;
  sendMedia: (file: File, caption: string, onPhase?: (phase: 'upload' | 'send') => void) => Promise<boolean>;
}

export type ContactThread = ReturnType<typeof useContactThread>;
