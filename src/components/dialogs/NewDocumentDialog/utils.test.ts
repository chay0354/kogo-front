/**
 * Saving a merchant used to fail in silence: the dialog swallowed the error
 * and waited. It now says why, in the server's words when it gave any.
 */
import { describe, expect, it } from 'vitest';
import {
  branchFieldApplies,
  businessCustomerErrorMessage,
  canAdvanceFromStep,
  computeInvoiceTotals,
  creditableMatch,
  documentDateBounds,
  emptyCheckRow,
  getWizardSteps,
  invoicePaymentBalance,
  invoicePaymentRows,
  israelToday,
  receiptDetailsPayload,
  serverErrorMessage,
} from './utils';
import type { InvoiceDetailsData, ReceiptDetailsData } from './types';

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
      cardBrand: '',
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

/**
 * A document's date defaulted to toISOString() — UTC — so an invoice typed in
 * Israel after midnight was dated the day before. It is Israel's day now.
 */
describe('israelToday', () => {
  it("gives Israel's day after midnight there, while UTC is still on the day before", () => {
    // 22:30 UTC on 25.9 is 01:30 on 26.9 in Israel (summer time, UTC+3).
    expect(israelToday(new Date('2026-09-25T22:30:00Z'))).toBe('2026-09-26');
  });

  it("gives Israel's day in winter time too", () => {
    // 22:30 UTC on 31.12 is 00:30 on 1.1 in Israel (UTC+2).
    expect(israelToday(new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-01');
  });

  it('matches UTC in the middle of the day', () => {
    expect(israelToday(new Date('2026-09-25T09:00:00Z'))).toBe('2026-09-25');
  });
});

describe('documentDateBounds', () => {
  it('allows this tax year up to today, never tomorrow', () => {
    expect(documentDateBounds(new Date('2026-09-25T22:30:00Z'))).toEqual({ min: '2026-01-01', max: '2026-09-26' });
  });
});

/**
 * An invoice-receipt wrote every method chosen for its whole total — paid in
 * cash and by check, it recorded twice its money. It now sends one row per
 * payment, and can be issued only when the rows come to the total exactly.
 */
describe('invoice-receipt payments (G)', () => {
  function payments(overrides: Partial<ReceiptDetailsData> = {}): ReceiptDetailsData {
    return {
      paymentMethod: 'מזומן', linkedInvoiceId: '', cashAmount: 0, cashNotes: '', checks: [], withholding: 0,
      checkNotes: '', cardLastFour: '', cardBrand: '', cardExpiry: '', cardAmount: 0, cardInstallments: 1,
      cardNotes: '', bankDate: '', bankReference: '', bankAmount: 0, bankNotes: '',
      ...overrides,
    };
  }

  function invoice(overrides: Partial<InvoiceDetailsData> = {}): InvoiceDetailsData {
    return {
      documentNumber: '', documentDate: '2026-09-25', description: 'סדנה', currency: 'ILS',
      pricesIncludeVat: false,
      lineItems: [{ id: '1', sku: '', description: 'סדנה', quantity: 1, price: 200 }],
      discountAmount: 0, discountPercent: 0, vatExempt: false, roundTotal: false, closeInvoice: false,
      customerNotes: '', internalNotes: '', paymentTerms: '', dueDate: '',
      paymentMethods: [], payments: payments(), withholdingAmount: 0, linkedInvoiceId: '', receiptNotes: '',
      ...overrides,
    };
  }

  const check = (amount: number, confirmed = true) => ({
    id: String(amount), date: '2026-10-01', bank: '12', branch: '600', accountNumber: '456',
    checkNumber: '0001', amount, confirmed, crossed: true,
  });

  it('works the total out as the server does, to the agora', () => {
    expect(computeInvoiceTotals(invoice())).toEqual({ subtotal: 20000, discount: 0, vat: 3600, total: 23600 });
    // 100.25 + 18% = 18.045 of VAT, half up to 18.05 (Decimal ROUND_HALF_UP), not 18.04.
    const odd = invoice({ lineItems: [{ id: '1', sku: '', description: '', quantity: 1, price: 100.25 }] });
    expect(computeInvoiceTotals(odd)).toMatchObject({ vat: 1805, total: 11830 });
    // Prices with VAT in: the total is what was typed, VAT comes out of it.
    expect(computeInvoiceTotals(invoice({ pricesIncludeVat: true }))).toMatchObject({ total: 20000, vat: 3051 });
    expect(computeInvoiceTotals(invoice({ discountPercent: 10 }))).toMatchObject({ discount: 2000, total: 21240 });
  });

  it('sends one row per payment, each for its own amount', () => {
    const rows = invoicePaymentRows(
      ['מזומן', "צ'ק"],
      payments({ cashAmount: 100, checks: [check(136), check(50, false)] }),
    );
    expect(rows).toEqual([
      { method: 'cash', amount: 100, notes: '' },
      {
        method: 'check', amount: 136, check_number: '0001', check_bank: '12', check_branch: '600',
        check_account: '456', check_date: '2026-10-01', check_crossed: true,
      },
    ]);
  });

  it('leaves out a method that was not chosen, whatever its panel holds', () => {
    expect(invoicePaymentRows(['אשראי'], payments({ cashAmount: 100, cardAmount: 236, cardBrand: 'ויזה' }))).toEqual([
      { method: 'credit_card', amount: 236, card_last_four: '', card_brand: 'ויזה', installments: 1, notes: '' },
    ]);
  });

  it('can be issued only when the rows and the withholding meet the total exactly', () => {
    const advance = (data: InvoiceDetailsData) =>
      canAdvanceFromStep('documentDetails', 'existing', 'c', null, null, 'חשבונית מס/קבלה', data);
    expect(advance(invoice())).toBe(false);
    expect(advance(invoice({ paymentMethods: ['מזומן'], payments: payments({ cashAmount: 236 }) }))).toBe(true);
    expect(advance(invoice({ paymentMethods: ['מזומן', "צ'ק"], payments: payments({ cashAmount: 236, checks: [check(236)] }) }))).toBe(false);
    const withheld = invoice({ paymentMethods: ['העברה בנקאית'], payments: payments({ bankAmount: 200 }), withholdingAmount: 36 });
    expect(invoicePaymentBalance(withheld)).toMatchObject({ total: 23600, paid: 20000, withholding: 3600, remaining: 0 });
    expect(advance(withheld)).toBe(true);
  });
});

/**
 * A credit note names its original's number and date (סעיף 9(ה)(4)). The
 * picker offers the customer's tax invoices and invoice-receipts; any other
 * number is typed, with its date.
 */
describe('credit note original', () => {
  const docs = [
    { id: '1', document_number: 'TI-2026-000001', document_type: 'tax_invoice', document_date: '2026-09-01' },
    { id: '2', document_number: 'IRM-2026-000004', document_type: 'combined', document_date: '2026-09-02' },
    { id: '3', document_number: 'RC-2026-000002', document_type: 'receipt', document_date: '2026-09-03' },
    { id: '4', document_number: 'TX-2026-000001', document_type: 'transaction_invoice', document_date: '2026-09-04' },
  ];

  it('offers only what may be credited, and finds the one typed', () => {
    const { options, match } = creditableMatch(docs, ' IRM-2026-000004 ');
    expect(options.map((d) => d.document_number)).toEqual(['TI-2026-000001', 'IRM-2026-000004']);
    expect(match?.document_date).toBe('2026-09-02');
    expect(creditableMatch(docs, 'IR-2026-000123').match).toBeNull();
    expect(creditableMatch(docs, 'RC-2026-000002').match).toBeNull();
  });

  it("can't be issued without the original's date", () => {
    const advance = (linkedDocumentDate: string) =>
      canAdvanceFromStep('documentDetails', 'existing', 'c', null, null, 'חשבונית מס זיכוי', null, {
        linkedInvoiceId: '30112', linkedDocumentDate, creditReason: 'ביטול', creditAmountBeforeVat: 100,
      });
    expect(advance('')).toBe(false);
    expect(advance('2026-08-30')).toBe(true);
  });
});
