'use client';

import { useCallback, useRef, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import type { DemoInput } from '@/lib/wahub/demo';
import { DemoSendQueue } from '@/lib/wahub/demoSend';
import { simulateWahubInbound } from '@/lib/wahubApi';
import type { WahubContact } from '@/types/wahub';
import type { ContactThread } from './useContactThread';
import { useDemoReply } from './useDemoReply';

interface Options {
  contactId: number | null;
  /** The open conversation is a demo contact's. */
  demo: boolean;
  /** The open conversation, as the tab holds it. */
  threadRef: MutableRefObject<ContactThread | null>;
  onContact: (contact: WahubContact) => void;
}

/**
 * A real conversation with a demo contact (docs/WAHUB-CONTRACT-REAL-DEMO.md, ג):
 * what the owner sends as the customer — words, a recording, a picture, several
 * in a row — and the new bot answering in the conversation. Nothing leaves for
 * WhatsApp; the server refuses all of it for a contact that is not demo.
 */
export function useDemoChat({ contactId, demo, threadRef, onContact }: Options) {
  const openId = useRef(contactId);
  openId.current = contactId;
  const onContactRef = useRef(onContact);
  onContactRef.current = onContact;

  const reply = useDemoReply({
    contactId,
    enabled: demo,
    onMessage: useCallback((id, message) => threadRef.current?.putMessages(id, [message]), [threadRef]),
    onContact,
  });
  const replyRef = useRef(reply);
  replyRef.current = reply;

  const queue = useRef<DemoSendQueue | null>(null);
  if (queue.current === null) {
    queue.current = new DemoSendQueue({
      request: simulateWahubInbound,
      show: (id, bubble) => threadRef.current?.putMessages(id, [bubble]),
      settle: (id, tempId, saved) => threadRef.current?.settleMessage(id, tempId, saved),
      reread: (id) => {
        if (openId.current === id) void threadRef.current?.refreshQuietly();
      },
      onContact: (contact) => onContactRef.current(contact),
      onCustomerStart: (id) => replyRef.current.sendStarted(id),
      onCustomerEnd: (id, stored) => replyRef.current.sendEnded(id, stored),
      onDuplicate: () => toast.warning('לא נרשם: אותה הודעה נכנסה לפני פחות מ-30 שניות.'),
      onError: (error) => toast.error(readableError(error, 'ההודעה לא נרשמה')),
    });
  }

  /** Resolves true when the server kept the message. The bubble is shown before that, and the box is free at once. */
  const send = useCallback((input: DemoInput): Promise<boolean> => {
    const id = openId.current;
    if (id == null || !queue.current) return Promise.resolve(false);
    return queue.current.send(id, input);
  }, []);

  return { send, reply };
}

export type DemoChat = ReturnType<typeof useDemoChat>;
