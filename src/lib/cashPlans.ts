/**
 * Cash plans (backend: apps/documents/cash_plans.py). Since 30.9.2026 (WS-3,
 * D1) a plan is 'upfront': one חשבונית מס/קבלה for the whole sum when the
 * cash is taken, and the months are the schedule it covers. A plan registered
 * before that ('mode' null) has a receipt for the sum and a document a month.
 *
 * Pure helpers for the screens; every field an older server leaves out reads
 * as the older design, never as a crash.
 */
import type { CancelCashPlanAnswer, CashPlan } from './documentsApi';
import { formatAgorotShekels, parseTypedAmount, toAgorot } from './settlements';

/** One invoice-receipt for the whole sum (D1). An older server sends neither field. */
export function isUpfrontCashPlan(plan: Pick<CashPlan, 'mode' | 'receipt_document_type'>): boolean {
  return plan.mode === 'upfront' || plan.receipt_document_type === 'combined';
}

/** What the document issued when the cash was taken is called. */
export function cashPlanDocumentLabel(plan: Pick<CashPlan, 'mode' | 'receipt_document_type'>): string {
  return isUpfrontCashPlan(plan) ? 'חשבונית מס/קבלה' : 'קבלה';
}

export function cashPlanStatusLabel(status: string): string {
  if (status === 'active') return 'פעילה';
  if (status === 'completed') return 'הושלמה';
  if (status === 'cancelled') return 'בוטלה';
  return status;
}

/** What the months not yet begun come to, in agorot (0 when the server does not say). */
export function unusedAgorot(plan: Pick<CashPlan, 'unused_amount'>): number {
  return Math.max(0, toAgorot(plan.unused_amount ?? 0));
}

/**
 * The refund field's first value: an upfront plan's months not yet begun (the
 * server's own default); nothing for an older plan, which has nothing to credit.
 */
export function defaultRefundAmount(plan: Pick<CashPlan, 'mode' | 'receipt_document_type' | 'unused_amount'>): string {
  return isUpfrontCashPlan(plan) ? (unusedAgorot(plan) / 100).toFixed(2) : '';
}

/**
 * Why the typed refund cannot be sent, or '' when it can. Empty is allowed:
 * the server then credits the months not yet begun. The server checks the cap
 * against what is left of the document and has the last word.
 */
export function refundAmountError(typed: string, totalAgorot: number): string {
  if (!typed.trim()) return '';
  const amount = parseTypedAmount(typed);
  if (amount === null) return 'סכום ההחזר אינו תקין';
  if (amount > totalAgorot) return `אפשר לזכות עד ${formatAgorotShekels(totalAgorot)} — סכום התוכנית`;
  return '';
}

/**
 * What the office is told after a cancel: the credit note issued (and that it
 * went to the customer by email), and the server's own message when it gave
 * one — an older plan's word to the accountant.
 */
export function cashPlanCancelSummary(answer: CancelCashPlanAnswer, documentNumber: string): string[] {
  const lines: string[] = [];
  if (answer.credit_note_number) {
    lines.push(
      `הופקה חשבונית מס זיכוי ${answer.credit_note_number}${documentNumber ? ` ל־${documentNumber}` : ''} — היא נחתמת ונשלחת במייל ללקוח.`,
    );
  } else if (!answer.message) {
    lines.push('התוכנית בוטלה. לא הופק זיכוי.');
  }
  if (answer.message) lines.push(answer.message);
  return lines;
}

/** The months as a short line: how many began, and the next one still ahead. */
export function cashPlanMonthsLine(plan: Pick<CashPlan, 'months' | 'months_paid' | 'months_total'>, today: string): string {
  const total = plan.months_total || plan.months?.length || 0;
  const begun = (plan.months ?? []).filter((month) => String(month.due_date ?? '').slice(0, 10) <= today).length;
  const next = (plan.months ?? [])
    .map((month) => String(month.due_date ?? '').slice(0, 10))
    .filter((day) => day > today)
    .sort()[0];
  const parts = [`${begun} מתוך ${total} חודשים התחילו`];
  if (next) {
    const [year, month] = next.split('-').map(Number);
    if (year && month) parts.push(`הבא: ${month}/${year}`);
  }
  return parts.join(' · ');
}
