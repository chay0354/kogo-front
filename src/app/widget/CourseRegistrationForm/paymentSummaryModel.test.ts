import { describe, expect, it } from 'vitest';
import { formatShekelShort, formatStandingOrderStart, groupedDiscountLines, paymentSummaryModel } from './paymentSummaryModel';
import type { PaymentResponse } from './types';

function payment(overrides: Partial<PaymentResponse> = {}): PaymentResponse {
  return {
    payment_id: 'p1',
    final_amount: 470,
    base_amount: 350,
    discount_amount: 0,
    registration_fee: 120,
    monthly_amount: 350,
    discounts_applied: [],
    ...overrides,
  };
}

describe('paymentSummaryModel', () => {
  it('shows a plain registration exactly as the server priced it', () => {
    const model = paymentSummaryModel(payment());
    expect(model.base).toBe(350);
    expect(model.hasDiscount).toBe(false);
    expect(model.discountLines).toEqual([]);
    expect(model.monthly).toBe(350);
    expect(model.registrationFee).toBe(120);
    expect(model.payNow).toBe(470);
    expect(model.payNowBeforeCredit).toBe(470);
    expect(model.trialCredit).toBe(0);
    expect(model.trialCreditReason).toBe('');
  });

  it('counts the monthly price down from the base to what the server charges each month', () => {
    const model = paymentSummaryModel(payment({
      final_amount: 420,
      discount_amount: 50,
      monthly_amount: 300,
      discounts_applied: [{ name: 'הנחת ילד שני', type: 'second_child', value: 50 }],
    }));
    expect(model.hasDiscount).toBe(true);
    expect(model.discountLines).toEqual([{ label: 'הנחת ילד שני', amount: 50 }]);
    // The line the discounts land on starts at the base and ends at the server's monthly sum.
    expect(model.base - model.discountLines.reduce((sum, line) => sum + line.amount, 0)).toBe(model.priceAfterDiscount);
    expect(model.priceAfterDiscount).toBe(300);
    expect(model.monthly).toBe(300);
  });

  it('keeps a paid trial out of the monthly price: it comes off this charge only', () => {
    const model = paymentSummaryModel(payment({
      final_amount: 440,
      trial_credit_amount: 30,
      trial_credit_reason: 'שמנו לב שכבר הייתם אצלנו בשיעור ניסיון',
    }));
    expect(model.monthly).toBe(350);
    expect(model.trialCredit).toBe(30);
    expect(model.payNow).toBe(440);
    expect(model.payNowBeforeCredit).toBe(470);
    expect(model.trialCreditReason).toContain('שיעור ניסיון');
  });

  it('never invents a reason for a credit that was not given', () => {
    const model = paymentSummaryModel(payment({ trial_credit_amount: 0, trial_credit_reason: 'leftover' }));
    expect(model.trialCreditReason).toBe('');
  });

  it('falls back to the price after discounts when the server sent no monthly amount', () => {
    const model = paymentSummaryModel(payment({ monthly_amount: undefined, discount_amount: 150, final_amount: 200, registration_fee: 0 }));
    expect(model.monthly).toBe(200);
    // No names came with the sum, so one unnamed line carries it.
    expect(model.discountLines).toEqual([{ label: 'הנחה', amount: 150 }]);
  });

  it('explains a shorter first month only when it really costs less', () => {
    expect(paymentSummaryModel(payment({ prorated_amount: 175, monthly_amount: 350 })).prorateExplained).toBe(true);
    expect(paymentSummaryModel(payment({ prorated_amount: 350, monthly_amount: 350 })).prorateExplained).toBe(false);
    expect(paymentSummaryModel(payment({ prorated_amount: 0 })).prorateExplained).toBe(false);
  });

  it('adds up two discounts that carry the same name', () => {
    expect(groupedDiscountLines([
      { name: 'הנחת ילד שני', type: 'second_child', value: 50 },
      { name: 'הנחת ילד שני', type: 'second_child', value: 50 },
      { name: 'רישום מוקדם', type: 'early_signup', value: 20 },
    ], 120)).toEqual([
      { label: 'הנחת ילד שני', amount: 100 },
      { label: 'הנחת רישום מוקדם', amount: 20 },
    ]);
  });

  it('writes the standing order start as day and month', () => {
    expect(formatStandingOrderStart('2026-11-01')).toBe('1.11');
    expect(formatStandingOrderStart('2026-11-01T00:00:00Z')).toBe('1.11');
  });

  it('says when the monthly payment begins, from whichever date the server sent', () => {
    const today = new Date(2026, 9, 2);
    expect(paymentSummaryModel(payment({ next_billing_date: '2026-11-01' }), today).standingOrderStart).toBe('2026-11-01');
    expect(paymentSummaryModel(
      payment({ subscription_start_date: '2026-12-01', next_billing_date: '2026-11-01' }), today,
    ).standingOrderStart).toBe('2026-12-01');
    expect(paymentSummaryModel(payment(), today).standingOrderStart).toBeNull();
  });

  it('gives no start date once that day is here: the monthly payment has begun', () => {
    const today = new Date(2026, 9, 2);
    expect(paymentSummaryModel(payment({ next_billing_date: '2026-10-02' }), today).standingOrderStart).toBeNull();
    expect(paymentSummaryModel(payment({ next_billing_date: '2026-09-01' }), today).standingOrderStart).toBeNull();
  });

  it('counts this charge down from the list price when the figures add up', () => {
    // A full month, the fee, a sibling discount and a paid trial: 350 + 120 → 300 + 120 - 30.
    const full = paymentSummaryModel(payment({
      final_amount: 390, discount_amount: 50, monthly_amount: 300, prorated_amount: 300,
      trial_credit_amount: 30, trial_credit_paid: 30,
      discounts_applied: [{ name: 'הנחת ילד שני', type: 'second_child', value: 50 }],
    }));
    expect(full.countsFromListPrice).toBe(true);
    expect(full.listPayNow).toBe(470);
    expect(full.trialPaid).toBe(30);
  });

  it('counts a mid-month signup down too: list price, the discount, the part of the month, the trial', () => {
    // 4 of 5 lessons left: 240 of the 300, plus the fee, less the trial.
    const part = paymentSummaryModel(payment({
      final_amount: 330, discount_amount: 50, monthly_amount: 300, prorated_amount: 240,
      prorate_lessons_remaining: 4, total_lessons_this_month: 5, trial_credit_amount: 30,
      discounts_applied: [{ name: 'הנחת ילד שני', type: 'second_child', value: 50 }],
    }));
    expect(part.prorateExplained).toBe(true);
    expect(part.countsFromListPrice).toBe(true);
    // 470 - 50 (discount) - 60 (the lesson already gone) - 30 (trial) = 330, the server's own figure.
    expect(part.listPayNow - 50 - (part.monthly - part.prorated) - part.trialCredit).toBe(part.payNow);
  });

  it('shows the figures at rest when only the fee is charged now', () => {
    const feeOnly = paymentSummaryModel(payment({
      final_amount: 120, discount_amount: 50, monthly_amount: 300, prorated_amount: 0,
      discounts_applied: [{ name: 'הנחת ילד שני', type: 'second_child', value: 50 }],
    }));
    expect(feeOnly.countsFromListPrice).toBe(false);
    expect(feeOnly.prorateExplained).toBe(false);
  });

  it('shows the figures at rest when they do not add up', () => {
    const odd = paymentSummaryModel(payment({
      final_amount: 400, discount_amount: 50, monthly_amount: 300, prorated_amount: 300,
      discounts_applied: [{ name: 'הנחת ילד שני', type: 'second_child', value: 50 }],
    }));
    expect(odd.countsFromListPrice).toBe(false);
  });

  it('says the fee was paid before only when the server says so and none is charged', () => {
    expect(paymentSummaryModel(payment({ registration_fee: 0, final_amount: 350, registration_fee_paid_before: true })).feePaidBefore).toBe(true);
    expect(paymentSummaryModel(payment({ registration_fee: 0, final_amount: 350 })).feePaidBefore).toBe(false);
    expect(paymentSummaryModel(payment({ registration_fee_paid_before: true })).feePaidBefore).toBe(false);
  });

  it('says "next month" for the first of next month and a date for any other day', () => {
    const today = new Date(2026, 9, 2);
    expect(paymentSummaryModel(payment({ next_billing_date: '2026-11-01' }), today).monthlyFrom).toBe('מהחודש הבא');
    expect(paymentSummaryModel(payment({ subscription_start_date: '2027-09-01' }), today).monthlyFrom).toBe('מ-1.9');
    expect(paymentSummaryModel(payment(), today).monthlyFrom).toBe('');
    // December → January of the next year.
    expect(paymentSummaryModel(payment({ next_billing_date: '2027-01-01' }), new Date(2026, 11, 15)).monthlyFrom).toBe('מהחודש הבא');
  });
});

describe('formatShekelShort', () => {
  it('drops the agorot from a whole amount and keeps them otherwise', () => {
    expect(formatShekelShort(350)).toBe('₪350');
    expect(formatShekelShort(262.5)).toBe('₪262.50');
    expect(formatShekelShort(0)).toBe('₪0');
  });
});
