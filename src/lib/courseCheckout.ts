/**
 * The course widget paying on Tranzila's page (COURSE_HOSTED_PAGE_ENABLED on
 * the server, apps/customers/course_checkout.py).
 *
 * The widget asks for the page once it has its pending payments. With the
 * server's switch off it is told to keep its own card form, exactly as
 * before. With it on it shows Tranzila's page — which only checks the card and
 * saves it — and asks the server every few seconds how the checkout stands;
 * the server charges the whole cart once, from the saved card.
 */

export type CheckoutStart =
  | { kind: 'hosted'; checkoutId: string; url: string }
  | { kind: 'card_form' }
  | { kind: 'error'; message: string };

export function readCheckoutStart(data: unknown): CheckoutStart {
  const d = (data ?? {}) as { use_card_form?: boolean; checkout_id?: string; url?: string; error?: string };
  if (d.use_card_form) return { kind: 'card_form' };
  if (d.checkout_id && d.url) return { kind: 'hosted', checkoutId: d.checkout_id, url: d.url };
  return { kind: 'error', message: d.error || 'לא ניתן לפתוח את עמוד התשלום כרגע. נסו שוב בעוד רגע.' };
}

/** Where the widget goes for each server status of a checkout. */
export type CheckoutOutcome = 'waiting' | 'paid' | 'declined' | 'pending' | 'failed';

export function checkoutOutcome(status: string | undefined): CheckoutOutcome {
  switch (status) {
    case 'completed':
      return 'paid';
    case 'declined':
      return 'declined';
    // The card may be charged, or a person has to look: never "failed", never
    // an invitation to pay again.
    case 'uncertain':
    case 'review':
      return 'pending';
    case 'failed':
    case 'replaced':
      return 'failed';
    default:
      // page_open / verified / charging — still on its way.
      return 'waiting';
  }
}

/** The card passed Tranzila's check and the server is charging it: show the working panel. */
export function cardAccepted(status: string | undefined): boolean {
  return status === 'verified' || status === 'charging';
}

/** The checkout's answer, as the "checking the payment" screen reads it. */
export function checkoutSettlement(status: string | undefined): 'completed' | 'failed' | 'processing' {
  const outcome = checkoutOutcome(status);
  if (outcome === 'paid') return 'completed';
  if (outcome === 'declined' || outcome === 'failed') return 'failed';
  return 'processing';
}

/** The message the result page inside Tranzila's frame sends up. */
export type CheckoutFrameMessage = {
  type: 'kogo-course-checkout';
  checkoutId: string;
  result: 'ok' | 'fail';
  index: string;
  code: string;
};

export function readFrameMessage(data: unknown, checkoutId: string): CheckoutFrameMessage | null {
  const d = data as Partial<CheckoutFrameMessage> | null;
  if (!d || d.type !== 'kogo-course-checkout') return null;
  if (!checkoutId || d.checkoutId !== checkoutId) return null;
  return {
    type: 'kogo-course-checkout',
    checkoutId,
    result: d.result === 'ok' ? 'ok' : 'fail',
    index: /^\d+$/.test(String(d.index ?? '')) ? String(d.index) : '',
    code: /^\d+$/.test(String(d.code ?? '')) ? String(d.code) : '',
  };
}

export const CHECKOUT_POLL_MS = 3000;
// From the card's approval to a settled checkout, including one retry of the
// report (15 s on the server). Past it, the screen that keeps asking takes over.
export const HOSTED_CHARGE_DEADLINE_MS = 60_000;
