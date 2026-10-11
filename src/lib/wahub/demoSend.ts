import type { WahubContact, WahubMessage } from '@/types/wahub';
import type { WahubSimulateResult } from '../wahubApi';
import { simulateInboundBody, type DemoInput } from './demo';
import { makeOptimisticDemoMessage } from './messages';

/**
 * What the owner "sends" into a demo conversation, the way a messaging app
 * sends: the bubble is on screen the moment Enter is pressed, the box is free
 * for the next line at once, and the lines reach the server one after the
 * other, in the order they were typed — however fast they were fired.
 *
 * Plain state, no React, so the order and the bookkeeping can be tested.
 */

export interface DemoSendDeps {
  /** POST contacts/{id}/simulate-inbound/. */
  request: (contactId: number, input: DemoInput) => Promise<WahubSimulateResult>;
  /** The made-up bubble goes into the conversation… */
  show: (contactId: number, bubble: WahubMessage) => void;
  /** …and gives way to the server's copy, or simply goes (null). */
  settle: (contactId: number, tempId: number, saved: WahubMessage | null) => void;
  /** The server kept the message without handing it back (an older server): read the conversation. */
  reread: (contactId: number) => void;
  onContact: (contact: WahubContact) => void;
  /** A message of the customer's left for the server / landed (or was refused): the new bot's clock follows these. */
  onCustomerStart: (contactId: number) => void;
  onCustomerEnd: (contactId: number, stored: boolean) => void;
  /** The server dropped the line as a repeat. */
  onDuplicate: () => void;
  onError: (error: unknown) => void;
  now?: () => Date;
}

/** There is something to send: words, or a file that is not empty. */
export function demoInputReady(input: DemoInput): boolean {
  if (input.kind === 'text') return simulateInboundBody(input.text, input.sender) !== null;
  return input.file.size > 0;
}

export class DemoSendQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private lastTempId = 0;

  constructor(private readonly deps: DemoSendDeps) {}

  /** Resolves true when the server kept the message, false when it must be sent again. Never rejects. */
  send(contactId: number, input: DemoInput): Promise<boolean> {
    if (!demoInputReady(input)) return Promise.resolve(false);
    const now = this.deps.now ? this.deps.now() : new Date();
    // Below zero and falling, so two lines typed in the same millisecond still keep their order.
    const tempId = Math.min(-now.getTime(), this.lastTempId - 1);
    this.lastTempId = tempId;
    const fromCustomer = input.kind !== 'text' || input.sender === 'customer';
    const shown = input.kind === 'text' ? { ...input, text: input.text.trim() } : input;
    this.deps.show(contactId, makeOptimisticDemoMessage(shown, tempId, now));
    if (fromCustomer) this.deps.onCustomerStart(contactId);
    const job = this.chain.then(() => this.deliver(contactId, input, tempId, fromCustomer));
    this.chain = job;
    return job;
  }

  private async deliver(contactId: number, input: DemoInput, tempId: number, fromCustomer: boolean): Promise<boolean> {
    let stored = false;
    try {
      const result = await this.deps.request(contactId, input);
      if (result.contact) this.deps.onContact(result.contact);
      stored = result.stored;
      if (stored) {
        this.deps.settle(contactId, tempId, result.message);
        if (!result.message) this.deps.reread(contactId);
      } else {
        // One copy of the same line within thirty seconds (the inbound rule).
        this.deps.settle(contactId, tempId, null);
        this.deps.onDuplicate();
      }
    } catch (error) {
      this.deps.settle(contactId, tempId, null);
      this.deps.onError(error);
    } finally {
      if (fromCustomer) this.deps.onCustomerEnd(contactId, stored);
    }
    return stored;
  }
}
