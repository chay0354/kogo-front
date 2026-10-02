/**
 * What the payment summary and the success screen say about a registration,
 * worked out once from the server's answer.
 *
 * Every figure is the server's own. Nothing is recomputed here except the two
 * the old summary already derived on the page: the price after discounts, and
 * the monthly amount when the server did not send one. The "before" figures the
 * screen counts down from are sums of fields the server sent, never estimates.
 */
import type { AppliedDiscount, PaymentResponse } from './types';

export function formatShekel(value: number): string {
  return `₪${Number(value).toFixed(2)}`;
}

/** The same figure without ".00" on a whole number — "₪350", but "₪262.50". */
export function formatShekelShort(value: number): string {
  const amount = Number(value);
  return Number.isInteger(amount) ? `₪${amount}` : `₪${amount.toFixed(2)}`;
}

function withHanahatPrefix(label: string): string {
  if (!label || label === 'הנחה' || /^הנח[הת]/.test(label)) return label;
  return `הנחת ${label}`;
}

export function discountLineLabel(discount: AppliedDiscount): string {
  const name = (discount.name || '').trim();
  const type = (discount.type || '').toLowerCase();
  const reason = (discount.reason || '').trim();

  if (type === 'early_signup' || /רישום מוקדם/.test(name)) {
    return withHanahatPrefix(name || 'רישום מוקדם');
  }
  if (type === 'second_child' || /ילד שני|הנחת אחים/.test(name)) {
    return withHanahatPrefix(name || 'ילד שני');
  }
  if (type === 'additional_lesson' || /שיעור נוסף/.test(name)) {
    return withHanahatPrefix(name || 'שיעור נוסף');
  }
  return withHanahatPrefix(name || reason || 'הנחה');
}

export function formatStandingOrderStart(isoDate: string): string {
  const [, monthPart, dayPart] = isoDate.split('T')[0].split('-');
  const day = Number(dayPart);
  const month = Number(monthPart);
  if (!day || !month) return isoDate;
  return `${day}.${month}`;
}

export function groupedDiscountLines(
  discounts: AppliedDiscount[] | undefined,
  fallbackAmount: number,
): Array<{ label: string; amount: number }> {
  const items = discounts ?? [];
  if (items.length === 0) {
    return fallbackAmount > 0 ? [{ label: 'הנחה', amount: fallbackAmount }] : [];
  }
  const grouped = new Map<string, number>();
  for (const discount of items) {
    const label = discountLineLabel(discount);
    const amount = Number(discount.value ?? discount.amount ?? 0);
    grouped.set(label, (grouped.get(label) ?? 0) + amount);
  }
  return [...grouped.entries()].map(([label, amount]) => ({ label, amount }));
}

export interface PaymentSummaryModel {
  /** The class price per month, before any discount. */
  base: number;
  hasDiscount: boolean;
  /** Monthly discounts, one line per name. */
  discountLines: Array<{ label: string; amount: number }>;
  /** The class price per month once the discounts are off — the base minus the discount sum. */
  priceAfterDiscount: number;
  /** What the standing order will charge each month. */
  monthly: number;
  /** This month's part, when the signup is mid-month. 0 when there is none. */
  prorated: number;
  prorateLessonsRemaining: number;
  totalLessonsThisMonth: number;
  /** The first month costs less than a full one, and the parent is owed the reason. */
  prorateExplained: boolean;
  /**
   * This charge is this month's part plus the fee, less a paid trial — and the
   * server's figures add up to exactly that. Then the screen may count the
   * charge down from the list price (`listPayNow`), each step a sum of the
   * server's own figures. False for a charge of the fee alone, and whenever
   * the figures do not add up: the screen then shows them at rest.
   */
  countsFromListPrice: boolean;
  /** The full price of a first charge: a month at the list price, and the fee. */
  listPayNow: number;
  registrationFee: number;
  /** No fee on this registration because the child already paid it. */
  feePaidBefore: boolean;
  /** A paid trial taken off this first charge only. */
  trialCredit: number;
  /** What the family paid for that trial. */
  trialPaid: number;
  trialCreditReason: string;
  /** Charged now. */
  payNow: number;
  /** What would be charged now without the trial credit. */
  payNowBeforeCredit: number;
  /** The day the monthly payment begins, when it is still ahead; null when unknown or already here. */
  standingOrderStart: string | null;
  /** That day in words: "מהחודש הבא" for the first of next month, else "מ-1.9"; empty when unknown. */
  monthlyFrom: string;
}

/** The date as the server writes it (YYYY-MM-DD), in the browser's own day. */
function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function paymentSummaryModel(payment: PaymentResponse, today: Date = new Date()): PaymentSummaryModel {
  const base = Number(payment.base_amount);
  const discountAmount = Number(payment.discount_amount);
  const priceAfterDiscount = Math.max(0, base - discountAmount);
  const monthly = Number(payment.monthly_amount ?? priceAfterDiscount);
  const prorated = Number(payment.prorated_amount ?? 0);
  const trialCredit = Number(payment.trial_credit_amount ?? 0);
  const payNow = Number(payment.final_amount);
  const registrationFee = Number(payment.registration_fee ?? 0);
  const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const monthlyStart = payment.subscription_start_date || payment.next_billing_date || null;
  const standingOrderStart = monthlyStart && monthlyStart.split('T')[0] > isoDay(today) ? monthlyStart : null;
  const discountLines = groupedDiscountLines(payment.discounts_applied, discountAmount);
  const lineTotal = discountLines.reduce((sum, line) => sum + line.amount, 0);
  const firstOfNextMonth = isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 1));
  return {
    base,
    hasDiscount: discountAmount > 0,
    discountLines,
    priceAfterDiscount,
    monthly,
    prorated,
    prorateLessonsRemaining: Number(payment.prorate_lessons_remaining ?? 0),
    totalLessonsThisMonth: Number(payment.total_lessons_this_month ?? 0),
    prorateExplained: prorated > 0 && monthly > 0 && prorated < monthly,
    countsFromListPrice: prorated > 0
      && prorated <= monthly + 0.005
      && sameAmount(monthly, priceAfterDiscount)
      && sameAmount(lineTotal, discountAmount)
      && sameAmount(prorated + registrationFee - trialCredit, payNow),
    listPayNow: base + registrationFee,
    registrationFee,
    feePaidBefore: registrationFee === 0 && payment.registration_fee_paid_before === true,
    trialCredit,
    trialPaid: Number(payment.trial_credit_paid ?? 0) || trialCredit,
    trialCreditReason: trialCredit > 0 ? (payment.trial_credit_reason ?? '') : '',
    payNow,
    payNowBeforeCredit: payNow + trialCredit,
    standingOrderStart,
    monthlyFrom: !standingOrderStart
      ? ''
      : standingOrderStart.split('T')[0] === firstOfNextMonth
        ? 'מהחודש הבא'
        : `מ-${formatStandingOrderStart(standingOrderStart)}`,
  };
}
