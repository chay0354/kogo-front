/**
 * Saving a merchant used to fail in silence: the dialog swallowed the error
 * and waited. It now says why, in the server's words when it gave any.
 */
import { describe, expect, it } from 'vitest';
import { businessCustomerErrorMessage, canAdvanceFromStep, getWizardSteps } from './utils';

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

/**
 * A branch is one of the categories, not a dimension layered over all of them.
 * The step now appears only when the category chosen is "סניפים".
 */
describe('getWizardSteps — the branch step appears with its category', () => {
  const ids = (category: string | null) =>
    getWizardSteps('business', 'קבלה', category).map((s) => s.id);

  it('shows the branch step for the branches category', () => {
    expect(ids('סניפים')).toContain('selectBranch');
  });

  it('hides it for every other category', () => {
    for (const c of ['לקוחות', 'ספקים', 'מותג קוגומלו', 'חוגים', '', null]) {
      expect(ids(c)).not.toContain('selectBranch');
    }
  });

  it('keeps the rest of the wizard intact', () => {
    expect(ids('לקוחות')).toEqual([
      'clientType',
      'businessClientDetails',
      'docType',
      'documentDetails',
      'summary',
    ]);
  });

  it('still splits business and existing customers', () => {
    expect(getWizardSteps('existing', 'קבלה', null).map((s) => s.id)).toContain('selectCustomer');
    expect(getWizardSteps('existing', 'קבלה', null).map((s) => s.id)).not.toContain('businessClientDetails');
  });
});
