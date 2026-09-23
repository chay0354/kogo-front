import api from '@/lib/api';
import type { CartItem, CustomerInfo, StoreInvoice } from '@/types/store';

/**
 * The till's typed-card charge (store/payment/charge-card/) — the business
 * terminal, the same path as "חיוב מוצר בכרטיס" in the settings.
 *
 * One checkout carries one key for every try until a card is plainly declined,
 * so a second click, a retry after a lost answer, or a double submit cannot
 * charge the customer twice: the server answers a repeat without charging.
 */

export interface TillCardDetails {
  card_number: string;
  expiry_month: number;
  expiry_year: number;
  cvv: string;
  card_holder_id: string;
}

export type TillChargeOutcome =
  | { kind: 'paid'; invoice?: StoreInvoice; alreadyPaid: boolean }
  | { kind: 'declined'; message: string }
  | { kind: 'uncertain'; message: string; invoiceNumber?: string };

export const UNCERTAIN_FALLBACK = 'לא ידוע אם החיוב עבר. בדקו בטרנזילה לפני שמנסים שוב.';

export function newCheckoutKey(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `till-${uuid}`.slice(0, 64);
}

interface ChargeAnswer {
  success?: boolean;
  already_paid?: boolean;
  uncertain?: boolean;
  error?: string;
  invoice?: StoreInvoice;
  invoice_number?: string;
}

/** What the till should do with an answer — or with no answer at all. */
export function readTillChargeOutcome(answer: ChargeAnswer | null | undefined): TillChargeOutcome {
  if (!answer) {
    // No answer reached us: the card may have been charged. Never a decline.
    return { kind: 'uncertain', message: UNCERTAIN_FALLBACK };
  }
  if (answer.success) {
    return { kind: 'paid', invoice: answer.invoice, alreadyPaid: Boolean(answer.already_paid) };
  }
  if (answer.uncertain) {
    return { kind: 'uncertain', message: answer.error || UNCERTAIN_FALLBACK, invoiceNumber: answer.invoice_number };
  }
  return { kind: 'declined', message: answer.error || 'התשלום נכשל' };
}

export async function chargeTillCard(body: {
  items: CartItem[];
  child_id?: string;
  customer_info?: CustomerInfo;
  card_details: TillCardDetails;
  idempotency_key: string;
}): Promise<TillChargeOutcome> {
  try {
    const { data } = await api.post('/store/payment/charge-card/', body);
    return readTillChargeOutcome(data);
  } catch (err: unknown) {
    const response = (err as { response?: { data?: ChargeAnswer } }).response;
    return readTillChargeOutcome(response ? response.data ?? { success: false } : null);
  }
}
