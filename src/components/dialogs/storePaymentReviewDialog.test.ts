import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_FROM_CUSTOMER_WARNING,
  closeAcknowledgement,
  reviewDialogCopy,
  reviewEvidence,
  reviewFormProblem,
} from './StorePaymentReviewDialog';

describe('settling a store payment in review', () => {
  it('always needs a reason', () => {
    expect(reviewFormProblem('release', '', 'approval', '', false)).toBe('חובה לכתוב סיבה');
    expect(reviewFormProblem('release', 'בדקתי בטרנזילה', 'approval', '', false)).toBe('');
  });

  it('completing a suspected charge needs the customer\'s evidence', () => {
    expect(reviewFormProblem('complete', 'הלקוח התקשר', 'approval', '', true)).not.toBe('');
    expect(reviewFormProblem('complete', 'הלקוח התקשר', 'approval', '0005555', true)).toBe('');
    expect(reviewFormProblem('complete', 'הלקוח התקשר', 'card', '42', true)).not.toBe('');
    expect(reviewFormProblem('complete', 'הלקוח התקשר', 'card', '4242', true)).toBe('');
  });

  it('a reported number may be completed on the code the CRM already holds', () => {
    expect(reviewFormProblem('complete', 'הלקוח התקשר', 'approval', '', false)).toBe('');
  });

  it('closing a number as "not ours" needs a reason and no evidence', () => {
    expect(reviewFormProblem('close', '', 'approval', '', true)).toBe('חובה לכתוב סיבה');
    expect(reviewFormProblem('close', 'של לקוח של האתר השני', 'approval', '', true)).toBe('');
  });

  it('names the decision by what it does: on a paid order "complete" records a second charge', () => {
    expect(reviewDialogCopy('complete', false).submit).toBe('השלם אחרי אימות');
    expect(reviewDialogCopy('complete', true).submit).toBe('רשום כחיוב שני');
    expect(reviewDialogCopy('release', false).submit).toBe('אין תשלום — שחרר');
    expect(reviewDialogCopy('close', true).submit).toBe('סגור — לא שלנו');
  });

  it('warns that the evidence comes from the customer, not from the transaction-check screen', () => {
    expect(EVIDENCE_FROM_CUSTOMER_WARNING).toContain('מהלקוח');
    expect(EVIDENCE_FROM_CUSTOMER_WARNING).toContain('בדיקת עסקה');
  });

  it('acknowledges a charge only for the numbers the CRM showed, and only when ticked', () => {
    expect(closeAcknowledgement('close', [], true)).toEqual({});
    expect(closeAcknowledgement('close', ['888'], false)).toEqual({});
    expect(closeAcknowledgement('close', ['888'], true)).toEqual({ acknowledge_charge: ['888'] });
    expect(closeAcknowledgement('release', ['888'], true)).toEqual({});
  });

  it('sends what was typed as the right kind of evidence, digits only', () => {
    expect(reviewEvidence('approval', ' 000-5555 ')).toEqual({ confirmation_code: '0005555' });
    expect(reviewEvidence('card', '4242')).toEqual({ card_last4: '4242' });
    expect(reviewEvidence('approval', '')).toEqual({});
  });
});
