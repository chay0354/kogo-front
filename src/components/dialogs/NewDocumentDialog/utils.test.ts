/**
 * Saving a merchant used to fail in silence: the dialog swallowed the error
 * and waited. It now says why, in the server's words when it gave any.
 */
import { describe, expect, it } from 'vitest';
import { businessCustomerErrorMessage, canAdvanceFromStep } from './utils';

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

/**
 * The branch step used to block the wizard. A document whose attribution was
 * already answered by the business and the category had nothing sensible to put
 * there, and the server never wanted it: FormalDocument.branch is nullable and
 * no permission filter reads it.
 */
describe('canAdvanceFromStep — the branch step', () => {
  const advance = (branchId: string | null) =>
    canAdvanceFromStep('selectBranch', 'business', null, null, null, null, null, null, null, branchId);

  it('lets the document through with no branch chosen', () => {
    expect(advance(null)).toBe(true);
  });

  it('still lets it through when a branch is chosen', () => {
    expect(advance('b-1')).toBe(true);
  });

  it('does not loosen any other step', () => {
    expect(
      canAdvanceFromStep('clientType', null, null, null, null, null, null, null, null, null),
    ).toBe(false);
    expect(
      canAdvanceFromStep('selectCustomer', 'existing', null, null, null, null, null, null, null, 'b-1'),
    ).toBe(false);
  });
});
