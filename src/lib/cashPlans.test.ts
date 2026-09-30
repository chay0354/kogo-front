/**
 * Cash plans on screen: which document the plan has (an invoice-receipt since
 * 30.9.2026, a receipt before — and a server that says nothing is the older
 * one), what a cancel may credit, and what the office is told after it.
 */
import { describe, expect, it } from 'vitest';
import type { CashPlan } from './documentsApi';
import {
  canCancelCashPlan,
  cashPlanCancelSummary,
  cashPlanDocumentLabel,
  cashPlanMonthsLine,
  defaultRefundAmount,
  isUpfrontCashPlan,
  refundAmountError,
} from './cashPlans';

function plan(overrides: Partial<CashPlan> = {}): CashPlan {
  return {
    id: 'cp-1',
    child: 'c-1',
    child_name: 'נועה',
    lesson: null,
    course_name: 'ג׳ודו',
    branch_name: '',
    description: '',
    status: 'active',
    total_amount: '1200.00',
    monthly_amount: '240.00',
    monthly_document_type: 'combined',
    receipt_number: 'IRM-2026-000010',
    months: [
      { id: 'm1', due_date: '2026-09-01', amount: '240.00', status: 'invoiced', invoiced_at: null, document_number: '', document_type: '' },
      { id: 'm2', due_date: '2026-10-01', amount: '240.00', status: 'invoiced', invoiced_at: null, document_number: '', document_type: '' },
      { id: 'm3', due_date: '2026-11-01', amount: '240.00', status: 'invoiced', invoiced_at: null, document_number: '', document_type: '' },
    ],
    months_paid: 3,
    months_total: 3,
    created_at: '2026-09-30T10:00:00+03:00',
    mode: 'upfront',
    receipt_document_type: 'combined',
    unused_amount: '480.00',
    ...overrides,
  };
}

describe('which document a plan has', () => {
  it('an upfront plan has one invoice-receipt', () => {
    expect(isUpfrontCashPlan(plan())).toBe(true);
    expect(cashPlanDocumentLabel(plan())).toBe('חשבונית מס/קבלה');
  });

  it('an older plan, or a server that says nothing, has a receipt', () => {
    expect(cashPlanDocumentLabel(plan({ mode: null, receipt_document_type: 'receipt' }))).toBe('קבלה');
    expect(cashPlanDocumentLabel(plan({ mode: undefined, receipt_document_type: undefined }))).toBe('קבלה');
  });
});

describe('canCancelCashPlan', () => {
  it('an active plan on a server that has the action', () => {
    expect(canCancelCashPlan(plan())).toBe(true);
    expect(canCancelCashPlan(plan({ status: 'cancelled' }))).toBe(false);
    expect(canCancelCashPlan(plan({ status: 'completed' }))).toBe(false);
  });

  it('not on a server from before WS-3 (no unused_amount): it has no cancel', () => {
    expect(canCancelCashPlan(plan({ unused_amount: undefined }))).toBe(false);
  });
});

describe('the refund', () => {
  it("starts from the months not yet begun on an upfront plan, and from nothing on an older one", () => {
    expect(defaultRefundAmount(plan())).toBe('480.00');
    expect(defaultRefundAmount(plan({ mode: null, receipt_document_type: 'receipt' }))).toBe('');
    expect(defaultRefundAmount(plan({ unused_amount: undefined }))).toBe('0.00');
  });

  it('accepts empty (the server decides), 0 and an amount within the plan', () => {
    expect(refundAmountError('', 120000)).toBe('');
    expect(refundAmountError('0', 120000)).toBe('');
    expect(refundAmountError('480', 120000)).toBe('');
  });

  it('refuses what is not an amount, and more than the plan', () => {
    expect(refundAmountError('abc', 120000)).toBe('סכום ההחזר אינו תקין');
    expect(refundAmountError('-5', 120000)).toBe('סכום ההחזר אינו תקין');
    expect(refundAmountError('1300', 120000)).toContain('אפשר לזכות עד');
  });
});

describe('cashPlanCancelSummary', () => {
  it('says the credit note goes to the customer by email', () => {
    const lines = cashPlanCancelSummary(
      { plan: plan(), credit_note_number: 'CR-2026-000005', unused_amount: '480.00', message: '' },
      'IRM-2026-000010',
    );
    expect(lines).toEqual(['הופקה חשבונית מס זיכוי CR-2026-000005 ל־IRM-2026-000010 — היא נחתמת ונשלחת במייל ללקוח.']);
  });

  it("passes the server's message on for an older plan", () => {
    const lines = cashPlanCancelSummary(
      { plan: plan(), credit_note_number: null, unused_amount: '480.00', message: 'אין מה לזכות — לדווח לרו"ח' },
      'RC-2026-000002',
    );
    expect(lines).toEqual(['אין מה לזכות — לדווח לרו"ח']);
  });

  it('says plainly when nothing was credited', () => {
    const lines = cashPlanCancelSummary({ plan: plan(), credit_note_number: null, unused_amount: '0.00', message: '' }, '');
    expect(lines).toEqual(['התוכנית בוטלה. לא הופק זיכוי.']);
  });
});

describe('cashPlanMonthsLine', () => {
  it('counts the months begun and names the next', () => {
    expect(cashPlanMonthsLine(plan(), '2026-09-30')).toBe('1 מתוך 3 חודשים התחילו · הבא: 10/2026');
    expect(cashPlanMonthsLine(plan(), '2026-12-01')).toBe('3 מתוך 3 חודשים התחילו');
    // A cancelled plan has no month ahead.
    expect(cashPlanMonthsLine(plan({ status: 'cancelled' }), '2026-09-30')).toBe('1 מתוך 3 חודשים התחילו');
  });
});
