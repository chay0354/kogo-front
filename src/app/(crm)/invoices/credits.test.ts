/**
 * A credit note is money going back. The documents tab's totals used to add it
 * like any other document, so a refunded ₪236 receipt plus its credit note read
 * as ₪472 of income and ₪236 still owed.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentRow } from './types';
import { isCreditRow, sumDocuments } from './utils';

function row(overrides: Partial<DocumentRow>): DocumentRow {
  return {
    id: 'doc',
    document_number: 'IR-2026-000001',
    issue_date: '2026-09-10',
    customer_name: 'משפחת כהן',
    document_type: 'חשבונית מס/קבלה',
    total_amount: 236,
    amount_paid: 236,
    open_balance: 0,
    status: 'completed',
    ...overrides,
  };
}

describe('isCreditRow', () => {
  it('knows a credit note by its flag or by the code each system uses', () => {
    expect(isCreditRow(row({ is_credit: true }))).toBe(true);
    expect(isCreditRow(row({ document_type_code: 'credit_invoice' }))).toBe(true);
    expect(isCreditRow(row({ document_type_code: 'CN' }))).toBe(true);
    expect(isCreditRow(row({ document_type_code: 'IR' }))).toBe(false);
  });
});

describe('sumDocuments', () => {
  it('takes a credit note off the total and never counts it as owed', () => {
    const receipt = row({});
    // An older ledger row: the credit note still reports an open balance.
    const credit = row({
      id: 'credit', document_number: 'CR-2026-000001', document_type: 'חשבונית מס זיכוי',
      document_type_code: 'credit_invoice', amount_paid: 0, open_balance: 236, status: 'refunded',
    });

    const totals = sumDocuments([receipt, credit]);

    expect(totals.total).toBe(0);
    expect(totals.paid).toBe(236);
    expect(totals.open).toBe(0);
  });
});
