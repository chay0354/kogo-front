/**
 * Saving a merchant used to fail in silence: the dialog swallowed the error
 * and waited. It now says why, in the server's words when it gave any.
 */
import { describe, expect, it } from 'vitest';
import { businessCustomerErrorMessage } from './utils';

describe('businessCustomerErrorMessage', () => {
  it("reads the server's field error — the branch a partner has to choose", () => {
    expect(businessCustomerErrorMessage({ response: { data: { branch_id: ['יש לבחור סניף'] } } })).toBe('יש לבחור סניף');
  });

  it('prefers the error the server spelled out', () => {
    expect(
      businessCustomerErrorMessage({ response: { data: { error: 'אין הרשאה לסניף הזה', branch_id: ['x'] } } }),
    ).toBe('אין הרשאה לסניף הזה');
    expect(businessCustomerErrorMessage({ response: { data: { detail: 'אין הרשאה לסניף הזה' } } })).toBe(
      'אין הרשאה לסניף הזה',
    );
  });

  it('says it failed when the server said nothing useful', () => {
    expect(businessCustomerErrorMessage(new Error('Network Error'))).toBe('שמירת הלקוח העסקי נכשלה');
    expect(businessCustomerErrorMessage({ response: { data: '<html>' } })).toBe('שמירת הלקוח העסקי נכשלה');
    expect(businessCustomerErrorMessage(null)).toBe('שמירת הלקוח העסקי נכשלה');
  });
});
