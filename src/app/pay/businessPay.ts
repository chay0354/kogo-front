import type { PublicPaymentLink } from '@/lib/paymentLinksApi';

// ---------------------------------------------------------------------------
// What a business customer reads on the payment page — pure, so
// businessPay.test.ts pins it down. The page is opened by someone outside the
// office: it says what is asked, for whom and how much, and nothing about how
// the office keeps its books.
// ---------------------------------------------------------------------------

/** Who is asking for the payment, as it is registered — the small line under the card. */
export const BUSINESS_LEGAL_NAME = 'קוגומלו גרופ בע״מ';

export type PayStep = 'loading' | 'closed' | 'error' | 'form' | 'paying' | 'verifying' | 'success' | 'failed' | 'review';

/**
 * A business customer's one-time charge. An older server does not say `kind`;
 * there the locked payer details are what tells it apart from a general link.
 */
export function isBusinessChargeLink(
  link: Pick<PublicPaymentLink, 'payer_details_locked' | 'kind'> | null | undefined,
): boolean {
  return Boolean(link) && (link?.payer_details_locked === true || link?.kind === 'business_charge');
}

export interface BusinessPayDetails {
  /** What the payment is for — once. */
  description: string;
  /** "עבור: …", or '' when the server did not name the customer. */
  customerLine: string;
  /** "חשבונית מס מספר …", or '' when there is none or the description already names it. */
  invoiceLine: string;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The description names this invoice already ("תשלום עבור חשבונית מס 1234"). */
function mentionsInvoice(description: string, invoiceNumber: string): boolean {
  if (!description.includes('חשבונית')) return false;
  return new RegExp(`(^|[^0-9A-Za-z])${escapeRegExp(invoiceNumber)}([^0-9A-Za-z]|$)`).test(description);
}

/**
 * The lines under the heading. The link's title, its description and its one
 * option all carry the same words, so only one of them is shown; and an
 * invoice the description already names is not named a second time.
 */
export function businessPayDetails(
  link: Pick<PublicPaymentLink, 'title' | 'description' | 'customer_name' | 'invoice_number'>,
): BusinessPayDetails {
  const description = (link.description ?? '').trim() || (link.title ?? '').trim();
  const customer = (link.customer_name ?? '').trim();
  const invoice = String(link.invoice_number ?? '').trim();
  return {
    description,
    customerLine: customer ? `עבור: ${customer}` : '',
    invoiceLine: invoice && !mentionsInvoice(description, invoice) ? `חשבונית מס מספר ${invoice}` : '',
  };
}

/** The one line under "התשלום התקבל, תודה!". */
export function businessSuccessLine(documentNumber: string | null | undefined): string {
  const number = (documentNumber ?? '').trim();
  return number ? `מסמך ${number} יישלח אליכם` : 'אישור התשלום יישלח אליכם';
}
