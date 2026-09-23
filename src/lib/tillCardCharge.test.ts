import { describe, expect, it } from 'vitest';
import { newCheckoutKey, readTillChargeOutcome, UNCERTAIN_FALLBACK } from './tillCardCharge';

describe('what the till does with the answer to a card charge', () => {
  it('a charge that went through is paid', () => {
    expect(readTillChargeOutcome({ success: true })).toEqual({ kind: 'paid', invoice: undefined, alreadyPaid: false });
  });

  it('a repeat of a checkout that went through is paid, not charged again', () => {
    expect(readTillChargeOutcome({ success: true, already_paid: true })).toMatchObject({ kind: 'paid', alreadyPaid: true });
  });

  it('a plain decline is a decline, with the reason', () => {
    expect(readTillChargeOutcome({ success: false, error: 'העסקה נדחתה' })).toEqual({
      kind: 'declined',
      message: 'העסקה נדחתה',
    });
  });

  it('Tranzila not answering is uncertain, never a decline', () => {
    expect(readTillChargeOutcome({ success: false, uncertain: true, invoice_number: 'ST-1' })).toEqual({
      kind: 'uncertain',
      message: UNCERTAIN_FALLBACK,
      invoiceNumber: 'ST-1',
    });
  });

  it('no answer reaching the till at all is uncertain too', () => {
    expect(readTillChargeOutcome(null)).toEqual({ kind: 'uncertain', message: UNCERTAIN_FALLBACK });
  });
});

describe('the checkout key', () => {
  it('is new for every checkout and fits the server column', () => {
    const a = newCheckoutKey();
    const b = newCheckoutKey();
    expect(a).not.toBe(b);
    expect(a.startsWith('till-')).toBe(true);
    expect(a.length).toBeLessThanOrEqual(64);
  });
});
