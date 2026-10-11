'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { REPLY_DELAY_MS } from '@/lib/wahub/demo';
import { DemoReplyRunner, type DemoReplyState } from '@/lib/wahub/demoReply';
import { replyWahubDemo } from '@/lib/wahubApi';
import type { WahubContact, WahubMessage } from '@/types/wahub';
import { botKeys } from './useBotQueries';

interface Options {
  contactId: number | null;
  /** The open conversation is a demo contact's. For anyone else nothing here runs. */
  enabled: boolean;
  /** The new bot's message, written into the conversation (`post`). */
  onMessage: (contactId: number, message: WahubMessage) => void;
  /** The contact as it stands after the answer. */
  onContact: (contact: WahubContact) => void;
}

const IDLE: DemoReplyState = { armed: false, inFlight: false };

/**
 * The new bot answering a demo conversation: three seconds after the last
 * message the owner typed as the customer, or on "ענה עכשיו". One call at a
 * time per contact (docs/WAHUB-CONTRACT-REAL-DEMO.md, הבהרה 9) — the clock of
 * a conversation is kept for as long as the page is open, so leaving it and
 * coming back mid-answer cannot start a second call. The switch "הבוט החדש
 * עונה בשיחה" is on for every demo contact until it is turned off.
 */
export function useDemoReply({ contactId, enabled, onMessage, onContact }: Options) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<DemoReplyState>(IDLE);
  const [auto, setAutoState] = useState(true);
  const runners = useRef(new Map<number, DemoReplyRunner>());
  const openId = useRef<number | null>(null);
  openId.current = enabled ? contactId : null;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onContactRef = useRef(onContact);
  onContactRef.current = onContact;

  /** The clock of one demo conversation, made the first time it is needed. */
  const runnerOf = useCallback(
    (id: number): DemoReplyRunner => {
      const known = runners.current.get(id);
      if (known) return known;
      const made = new DemoReplyRunner({
        delayMs: REPLY_DELAY_MS,
        onChange: (next) => {
          if (openId.current === id) setState(next);
        },
        run: async (reason) => {
          try {
            const result = await replyWahubDemo(id, true);
            if (result.contact) onContactRef.current(result.contact);
            if (result.message) onMessageRef.current(id, result.message);
            if (result.error) {
              toast.error(`הבוט החדש לא ענה: ${result.error}`);
            } else if (!result.shadow && reason === 'manual') {
              toast.message('אין הודעות חדשות לענות עליהן.');
            }
            // The proposal under the customer's message ("למה"): read again now.
            void queryClient.invalidateQueries({ queryKey: botKeys.contactShadow(id) });
          } catch (error) {
            toast.error(readableError(error, 'הבוט החדש לא ענה'));
          }
        },
      });
      runners.current.set(id, made);
      return made;
    },
    [queryClient],
  );

  // The conversation on screen changed: show its own clock.
  useEffect(() => {
    const runner = enabled && contactId != null ? runners.current.get(contactId) : undefined;
    setState(runner ? runner.state : IDLE);
    setAutoState(runner ? runner.autoOn : true);
  }, [contactId, enabled]);

  // Leaving the page: every clock stops.
  useEffect(() => {
    const all = runners.current;
    return () => {
      all.forEach((runner) => runner.dispose());
      all.clear();
    };
  }, []);

  const current = useCallback(() => (openId.current != null ? runnerOf(openId.current) : null), [runnerOf]);

  const setAuto = useCallback(
    (on: boolean) => {
      setAutoState(on);
      current()?.setAuto(on);
    },
    [current],
  );
  const replyNow = useCallback(() => current()?.replyNow(), [current]);
  /** A customer message left for the server; `id` is the conversation it was typed in, which may no longer be the open one. */
  const sendStarted = useCallback((id: number) => runnerOf(id).sendStarted(), [runnerOf]);
  const sendEnded = useCallback((id: number, stored: boolean) => runnerOf(id).sendEnded(stored), [runnerOf]);

  return useMemo(
    () => ({ auto, setAuto, armed: state.armed, inFlight: state.inFlight, replyNow, sendStarted, sendEnded }),
    [auto, replyNow, sendEnded, sendStarted, setAuto, state.armed, state.inFlight],
  );
}

export type DemoReply = ReturnType<typeof useDemoReply>;
