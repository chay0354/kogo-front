/**
 * The rules of a check plan's checks on screen (WS-3, D2): what each check's
 * state is — its tax invoice issued on a day, bounced, replaced — which
 * checks can be marked as bounced and what that will issue, and what the
 * office is told after an action. Pure, for checksTab.test.ts.
 *
 * Every WS-3 field is optional: a check from an older server reads as it did.
 */
import type { BounceCheckAnswer, CheckItemRow, CheckPlanRow } from '@/lib/documentsApi';
import { formatIsraelMoment } from '@/lib/settlements';
import { formatAmount, formatDate } from './utils';

export type CheckItemTone = 'pending' | 'invoiced' | 'cancelled' | 'bounced';

export interface CheckItemState {
  label: string;
  tone: CheckItemTone;
  /** Lines under the label: when it bounced, its credit note, its replacement. */
  details: string[];
}

/** "צ׳ק 1001 · בנק 12 · 1.10.2026 · ₪300" — the check as the office names it. */
export function checkLabel(item: Pick<CheckItemRow, 'check_number' | 'bank' | 'due_date' | 'amount'>): string {
  return [
    item.check_number ? `צ׳ק ${item.check_number}` : 'צ׳ק',
    item.bank ? `בנק ${item.bank}` : '',
    item.due_date ? formatDate(item.due_date) : '',
    formatAmount(Number(item.amount) || 0),
  ].filter(Boolean).join(' · ');
}

export function checkItemState(item: CheckItemRow): CheckItemState {
  if (item.bounced_at) {
    const details = [`חזר ב־${formatIsraelMoment(item.bounced_at).split(' ')[0] || formatDate(item.bounced_at)}`];
    if (item.credit_note_number) details.push(`החשבונית זוכתה ב־${item.credit_note_number}`);
    else if (!item.tax_invoice) details.push('לא הופקה לו חשבונית');
    if (item.replaced_by || item.replaced_by_plan) details.push('הוחלף בצ׳ק חלופי (תוכנית משלו)');
    return { label: 'חזר', tone: 'bounced', details };
  }
  if (item.status === 'pending') return { label: 'ממתין לחשבונית', tone: 'pending', details: [] };
  if (item.status === 'invoiced') {
    const details = item.credit_note_number ? [`זוכתה ב־${item.credit_note_number}`] : [];
    return { label: 'הופקה חשבונית', tone: 'invoiced', details };
  }
  if (item.status === 'cancelled') return { label: 'בוטל', tone: 'cancelled', details: [] };
  return { label: item.status, tone: 'pending', details: [] };
}

/** The line under a check's invoice number: the day it was issued (on or after the check's). */
export function taxInvoiceLine(
  item: Pick<CheckItemRow, 'tax_invoice_date' | 'invoiced_at' | 'bounced_at' | 'credit_note'>,
): string {
  // A check that came back paid nothing; its invoice was credited (the status says so).
  const paidByCheck = !item.bounced_at && !item.credit_note;
  if (item.tax_invoice_date) return `הופקה ${formatDate(item.tax_invoice_date)}${paidByCheck ? ' · שולמה בצ׳ק' : ''}`;
  if (item.invoiced_at) return `הופקה ${formatDate(item.invoiced_at)}`;
  return '';
}

/**
 * A check that can come back: not marked already, and not cancelled (a
 * cancelled check was never deposited). A server from before WS-3 sends no
 * bounced_at at all (it has no such action) — the button is not offered.
 */
export function canBounceCheck(item: Pick<CheckItemRow, 'bounced_at' | 'status'>): boolean {
  return item.bounced_at === null && (item.status === 'pending' || item.status === 'invoiced');
}

/**
 * What marking it bounced issues: a credit note for a check whose tax invoice
 * was issued (emailed to the customer); nothing for one still waiting — it is
 * cancelled and no invoice follows.
 */
export function bounceOutcome(item: Pick<CheckItemRow, 'status' | 'tax_invoice' | 'tax_invoice_number'>): 'credit' | 'cancel' {
  return item.status === 'invoiced' && Boolean(item.tax_invoice || item.tax_invoice_number) ? 'credit' : 'cancel';
}

/** What a cancel will touch: the checks still waiting, and the invoices already issued (not bounced, not credited). */
export function cancelPlanPreview(plan: Pick<CheckPlanRow, 'items'>): { pending: number; invoiced: number } {
  let pending = 0;
  let invoiced = 0;
  for (const item of plan.items ?? []) {
    if (item.bounced_at) continue;
    if (item.status === 'pending') pending += 1;
    else if (item.status === 'invoiced' && !item.credit_note) invoiced += 1;
  }
  return { pending, invoiced };
}

/** The date and time a plan was cancelled and by whom, as one line; '' for a live plan. */
export function cancelledLine(plan: Pick<CheckPlanRow, 'cancelled_at' | 'cancelled_by_name'>): string {
  if (!plan.cancelled_at) return '';
  return [`בוטלה ${formatIsraelMoment(plan.cancelled_at)}`, plan.cancelled_by_name].filter(Boolean).join(' · ');
}

/** What the office is told once a check is marked bounced. */
export function bounceSummary(answer: Pick<BounceCheckAnswer, 'credit_note_number' | 'replacement_plan'>): string {
  const parts = ['הצ׳ק סומן כחוזר.'];
  parts.push(
    answer.credit_note_number
      ? `הופקה חשבונית מס זיכוי ${answer.credit_note_number} — היא נחתמת ונשלחת במייל ללקוח.`
      : 'לא הופק זיכוי — לצ׳ק לא הופקה חשבונית, והוא בוטל.',
  );
  if (answer.replacement_plan) {
    const receipt = answer.replacement_plan.receipt_number;
    parts.push(`הצ׳ק החלופי נרשם${receipt ? ` עם קבלה ${receipt}` : ''}; חשבונית המס שלו תופק ביום שלו.`);
  }
  return parts.join(' ');
}

/** What the office is told once a plan is cancelled. */
export function cancelSummary(creditNotes: readonly string[]): string {
  if (creditNotes.length === 0) return 'התוכנית בוטלה. לא הופק זיכוי.';
  if (creditNotes.length === 1) {
    return `התוכנית בוטלה. הופקה חשבונית מס זיכוי ${creditNotes[0]} — היא נחתמת ונשלחת במייל ללקוח.`;
  }
  return `התוכנית בוטלה. הופקו חשבוניות מס זיכוי ${creditNotes.join(', ')} — הן נחתמות ונשלחות במייל ללקוח.`;
}
