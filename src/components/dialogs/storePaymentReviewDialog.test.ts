import { describe, expect, it } from 'vitest';
import { reviewEvidence, reviewFormProblem } from './StorePaymentReviewDialog';

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

  it('sends what was typed as the right kind of evidence, digits only', () => {
    expect(reviewEvidence('approval', ' 000-5555 ')).toEqual({ confirmation_code: '0005555' });
    expect(reviewEvidence('card', '4242')).toEqual({ card_last4: '4242' });
    expect(reviewEvidence('approval', '')).toEqual({});
  });
});
