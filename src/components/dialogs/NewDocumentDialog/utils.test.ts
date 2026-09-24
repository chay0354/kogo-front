/**
 * Saving a merchant used to fail in silence: the dialog swallowed the error
 * and waited. It now says why, in the server's words when it gave any.
 */
import { describe, expect, it } from 'vitest';
import {
  branchFieldApplies,
  businessCustomerErrorMessage,
  canAdvanceFromStep,
  emptyCheckRow,
  getWizardSteps,
  receiptDetailsPayload,
  serverErrorMessage,
} from './utils';
import type { ReceiptDetailsData } from './types';

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
 * Issuing a document used to show axios's "Request failed with status code 400"
 * whatever the server said. It now shows the server's reason — including a
 * field error inside a document section, which arrives one level deeper.
 */
describe('serverErrorMessage', () => {
  it("reads a section's field error — the original number a credit note must name", () => {
    expect(
      serverErrorMessage(
        { response: { data: { credit_invoice_details: { linked_invoice_id: ['חשבונית זיכוי חייבת לציין את מספר המסמך המקורי'] } } } },
        'שגיאה ביצירת המסמך',
      ),
    ).toBe('חשבונית זיכוי חייבת לציין את מספר המסמך המקורי');
  });

  it('reads the refusal to delete a child who holds documents', () => {
    expect(serverErrorMessage({ response: { data: { error: 'לא ניתן למחוק' } } }, 'שגיאה')).toBe('לא ניתן למחוק');
  });

  it('falls back when the server said nothing useful', () => {
    expect(serverErrorMessage(new Error('Request failed with status code 500'), 'שגיאה ביצירת המסמך')).toBe(
      'שגיאה ביצירת המסמך',
    );
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

describe('branchFieldApplies', () => {
  it('asks for a branch only under the branches category', () => {
    expect(branchFieldApplies('סניפים')).toBe(true);
    expect(branchFieldApplies(' סניפים ')).toBe(true);
    expect(branchFieldApplies('מותג קוגומלו')).toBe(false);
    expect(branchFieldApplies('')).toBe(false);
    expect(branchFieldApplies(null)).toBe(false);
    expect(branchFieldApplies(undefined)).toBe(false);
  });
});

describe('receiptDetailsPayload — a receipt as the server reads it', () => {
  function receipt(overrides: Partial<ReceiptDetailsData> = {}): ReceiptDetailsData {
    return {
      paymentMethod: "צ'ק",
      linkedInvoiceId: 'IR-2026-000001',
      cashAmount: 0,
      cashNotes: '',
      checks: [],
      withholding: 0,
      checkNotes: 'שני צ׳קים',
      cardLastFour: '',
      cardExpiry: '',
      cardAmount: 0,
      cardInstallments: 1,
      cardNotes: '',
      bankDate: '',
      bankReference: '',
      bankAmount: 0,
      bankNotes: '',
      ...overrides,
    };
  }

  it('starts every new check uncrossed', () => {
    expect(emptyCheckRow('9', '2026-09-23')).toMatchObject({ id: '9', date: '2026-09-23', confirmed: false, crossed: false });
  });

  it('sends each check with check_crossed, under the names the serializer reads', () => {
    const crossed = { ...emptyCheckRow('1', '2026-10-01'), bank: '12', branch: '345', accountNumber: '678', checkNumber: '1001', amount: 500, confirmed: true, crossed: true };
    const plain = { ...emptyCheckRow('2', '2026-11-01'), checkNumber: '1002', amount: 500, confirmed: true };
    const payload = receiptDetailsPayload(receipt({ checks: [crossed, plain] }));
    expect(payload.payment_method).toBe("צ'ק");
    expect(payload.linked_invoice_id).toBe('IR-2026-000001');
    expect(payload.check_notes).toBe('שני צ׳קים');
    expect(payload.checks).toEqual([
      { date: '2026-10-01', bank: '12', branch: '345', account_number: '678', check_number: '1001', amount: 500, confirmed: true, check_crossed: true },
      { date: '2026-11-01', bank: '', branch: '', account_number: '', check_number: '1002', amount: 500, confirmed: true, check_crossed: false },
    ]);
  });

  it('carries no camelCase key the server would ignore — the receipt used to be refused for want of payment_method', () => {
    const payload = receiptDetailsPayload(receipt({ checks: [emptyCheckRow('1', '2026-10-01')] }));
    const keys = [...Object.keys(payload), ...Object.keys(payload.checks?.[0] ?? {})];
    expect(keys.filter((key) => /[A-Z]/.test(key))).toEqual([]);
  });

  it('sends an empty bank date as null, and a filled one as it is', () => {
    expect(receiptDetailsPayload(receipt({ bankDate: '' })).bank_date).toBeNull();
    expect(receiptDetailsPayload(receipt({ paymentMethod: 'העברה בנקאית', bankDate: '2026-09-23', bankAmount: 300 }))).toMatchObject({
      payment_method: 'העברה בנקאית',
      bank_date: '2026-09-23',
      bank_amount: 300,
    });
  });

  it('keeps the cash and card sections as they were entered', () => {
    expect(receiptDetailsPayload(receipt({ paymentMethod: 'מזומן', cashAmount: 120, cashNotes: 'בקופה' }))).toMatchObject({
      payment_method: 'מזומן',
      cash_amount: 120,
      cash_notes: 'בקופה',
    });
    expect(receiptDetailsPayload(receipt({ paymentMethod: 'אשראי', cardLastFour: '4242', cardExpiry: '12/28', cardAmount: 90, cardInstallments: 3 }))).toMatchObject({
      payment_method: 'אשראי',
      card_last_four: '4242',
      card_expiry: '12/28',
      card_amount: 90,
      card_installments: 3,
    });
  });
});
