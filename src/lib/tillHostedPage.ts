import type { PaymentInitiationResponse, StoreInvoice } from '@/types/store';

/**
 * The till's first answer for a card sale (store/payment/initiate/): the
 * child's saved card was charged, Tranzila's hosted page was opened for this
 * checkout, or the hosted page is off and the card is typed instead.
 *
 * The hosted page (TRANZILA_TERMINAL — cogolive) takes the card, Bit and
 * Apple Pay on Tranzila's side; the card never passes through us.
 */
export type TillInitiateOutcome =
  | { kind: 'paid'; invoice?: StoreInvoice }
  | { kind: 'hosted_page'; url: string; invoiceId: string }
  | { kind: 'type_card'; message?: string }
  | { kind: 'failed'; message: string };

export const HOSTED_PAGE_MISSING = 'עמוד התשלום לא נפתח. נסו שוב, או הקלידו את הכרטיס.';

export function readTillInitiateOutcome(response: PaymentInitiationResponse): TillInitiateOutcome {
  if (response.use_direct_card) {
    return { kind: 'type_card', message: response.error };
  }
  if (response.requires_iframe) {
    // Without the invoice the till could never learn that the customer paid.
    if (response.iframe_url && response.invoice_id) {
      return { kind: 'hosted_page', url: response.iframe_url, invoiceId: response.invoice_id };
    }
    return { kind: 'failed', message: HOSTED_PAGE_MISSING };
  }
  if (response.success) {
    return { kind: 'paid', invoice: response.invoice };
  }
  return { kind: 'failed', message: response.error || 'התשלום נכשל' };
}

/**
 * A hosted-page sale is paid once the server completed its invoice — which it
 * does only after finding the charge on the terminal's own report.
 */
export function hostedPagePaid(invoice: Pick<StoreInvoice, 'payment_status'> | null | undefined): boolean {
  return invoice?.payment_status === 'completed';
}
