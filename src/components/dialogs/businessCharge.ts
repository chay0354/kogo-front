import { VAT_RATE } from '@/app/(crm)/rentals/tenancyUtils';
import { whatsAppNumber } from '@/app/(crm)/rentals/signingUtils';

// ---------------------------------------------------------------------------
// The rules of the business-charge dialog — pure, so businessCharge.test.ts
// pins them down: what a typed sum means with and without VAT, and the
// WhatsApp link the office sends the payment page with.
// ---------------------------------------------------------------------------

/** 18 — the rate as a whole percent, so the sums below stay in whole agorot. */
export const VAT_PERCENT = Math.round(VAT_RATE * 100);

/** What the typed sum is: the total the customer pays, or the price before VAT. */
export type VatMode = 'gross' | 'net';

/** All in agorot (integers), so they add up exactly. */
export interface ChargeBreakdown {
  net: number;
  vat: number;
  gross: number;
}

/** Half up, on integers — the same rounding the documents use (NewDocumentDialog/utils.ts). */
function divRoundHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/**
 * A typed sum in agorot, or null when it is not a positive plain number.
 * Read from the digits themselves, so 4.24 is 424 and 1.005 is 101 — no float
 * in between. A comma is refused rather than guessed at (1,200 or 12,5?).
 */
export function parseAmountAgorot(raw: string | null | undefined): number | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(String(raw ?? '').trim());
  if (!match || !(match[1] || match[2])) return null;
  const fraction = (match[2] ?? '').padEnd(3, '0');
  const agorot = Number(match[1] || '0') * 100 + Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
  return Number.isSafeInteger(agorot) && agorot > 0 ? agorot : null;
}

/**
 * Before VAT, the VAT and the total for a typed sum. The total is what the
 * server is sent and what the customer is charged; the document it issues
 * splits it the same way (prices include VAT: net = total × 100 / 118).
 */
export function chargeBreakdown(raw: string | null | undefined, mode: VatMode): ChargeBreakdown | null {
  const entered = parseAmountAgorot(raw);
  if (entered === null) return null;
  if (mode === 'net') {
    const vat = divRoundHalfUp(entered * VAT_PERCENT, 100);
    return { net: entered, vat, gross: entered + vat };
  }
  const net = divRoundHalfUp(entered * 100, 100 + VAT_PERCENT);
  return { net, vat: entered - net, gross: entered };
}

/** Agorot as the API's amount: '118.00'. */
export function agorotAmount(agorot: number): string {
  return (agorot / 100).toFixed(2);
}

/** Agorot as the screen shows money: '₪1,180.00'. */
export function agorotShekels(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- WhatsApp ----

/** The short message the office sends with the payment link, in its own WhatsApp. */
export function chargeWhatsAppMessage({
  customerName,
  amount,
  url,
}: {
  customerName?: string | null;
  /** As it reads on screen, e.g. '₪118.00'. */
  amount?: string | null;
  url: string;
}): string {
  const name = (customerName ?? '').trim();
  const sum = (amount ?? '').trim();
  return [
    name ? `שלום ${name},` : 'שלום,',
    `מצורף קישור לתשלום מאובטח${sum ? ` על סך ${sum}` : ''}:`,
    url,
    'תודה, קוגומלו',
  ].join('\n');
}

/**
 * A wa.me link with the message typed in and waiting — nothing is sent until
 * the office user presses send there. A mobile number (05X…) opens the
 * customer's chat as 9725X…; without one WhatsApp asks whom to send it to.
 */
export function chargeWhatsAppUrl(phone: string | null | undefined, message: string): string {
  return `https://wa.me/${whatsAppNumber(phone) ?? ''}?text=${encodeURIComponent(message)}`;
}

// ---- copying the link ----

/**
 * Copies text, and says whether it worked. The clipboard API is missing on an
 * insecure page and can be refused; `fallback` (select the field and ask the
 * browser to copy it) is tried then.
 */
export async function copyText(
  text: string,
  fallback: () => boolean,
  clipboard: Pick<Clipboard, 'writeText'> | null | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      /* refused — try the old way */
    }
  }
  try {
    return fallback();
  } catch {
    return false;
  }
}
