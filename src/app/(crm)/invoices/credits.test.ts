/**
 * A credit note is money going back. The documents tab's totals used to add it
 * like any other document, so a refunded ₪236 receipt plus its credit note read
 * as ₪472 of income and ₪236 still owed.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentRow } from './types';
import { isCreditRow, isSettledInvoiceRow, sumDocuments } from './utils';

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

/**
 * Receipts against invoices (WS-3): a tax invoice paid by a receipt used to
 * count twice in the KPI row — its total and the receipt's — and the invoice
 * never read paid. The server now says how much of a receipt went to invoices
 * (applied_amount) and how much of an invoice was paid (amount_paid), and the
 * row counts each shekel once: the revenue on the invoice, the money on the
 * receipt.
 */
describe('sumDocuments — receipts against invoices', () => {
  const invoice = row({
    id: 'ti', document_number: 'TI-2026-000012', document_type: 'חשבונית מס', document_type_code: 'tax_invoice',
    origin: 'manual', tranzila_issued: false, total_amount: 1180, amount_paid: 1180, open_balance: 0,
    applied_amount: 0, status: 'completed',
  });
  const receipt = row({
    id: 'rc', document_number: 'RC-2026-000004', document_type: 'קבלה', document_type_code: 'receipt',
    origin: 'manual', tranzila_issued: false, total_amount: 1180, amount_paid: 1180, open_balance: 0,
    applied_amount: 1180, status: 'completed',
  });

  it('counts a paid invoice and its receipt once', () => {
    expect(sumDocuments([invoice, receipt])).toEqual({ total: 1180, paid: 1180, open: 0 });
  });

  it('an invoice still open is owed, and nothing was paid', () => {
    const open = { ...invoice, amount_paid: 0, open_balance: 1180, status: 'pending' };
    expect(sumDocuments([open])).toEqual({ total: 1180, paid: 0, open: 1180 });
  });

  it('a partial payment: the receipt paid part, the rest is open', () => {
    const partial = { ...invoice, amount_paid: 500, open_balance: 680, status: 'partially_paid' };
    const part = { ...receipt, total_amount: 500, amount_paid: 500, applied_amount: 500 };
    expect(sumDocuments([partial, part])).toEqual({ total: 1180, paid: 500, open: 680 });
  });

  it('a receipt that paid more than the invoice counts the rest as its own', () => {
    const bigger = { ...receipt, total_amount: 1500, amount_paid: 1500, applied_amount: 1180 };
    expect(sumDocuments([invoice, bigger])).toEqual({ total: 1500, paid: 1500, open: 0 });
  });

  it('a transaction invoice closed by an invoice-receipt: once', () => {
    const tx = { ...invoice, id: 'tx', document_type_code: 'transaction_invoice', document_type: 'חשבונית עסקה' };
    const irm = { ...receipt, id: 'irm', document_type_code: 'combined', document_type: 'חשבונית מס/קבלה' };
    expect(sumDocuments([tx, irm])).toEqual({ total: 1180, paid: 1180, open: 0 });
  });

  it('a credited invoice: its credit note takes it off, nothing owed', () => {
    const credited = { ...invoice, amount_paid: 0, open_balance: 0, credited_amount: 1180, status: 'refunded' };
    const credit = row({
      id: 'cr', document_type_code: 'credit_invoice', is_credit: true, origin: 'manual',
      total_amount: 1180, amount_paid: 0, open_balance: 0, status: 'refunded',
    });
    expect(sumDocuments([credited, credit])).toEqual({ total: 0, paid: 0, open: 0 });
  });

  it('an invoice issued in Tranzila keeps the older rule: paid in full, counted', () => {
    const tranzila = { ...invoice, tranzila_issued: true };
    expect(isSettledInvoiceRow(tranzila)).toBe(false);
    expect(sumDocuments([tranzila])).toEqual({ total: 1180, paid: 1180, open: 0 });
  });

  it('an older server (no applied_amount, the invoice never paid) reads as before', () => {
    const oldInvoice = { ...invoice, amount_paid: 0, open_balance: 1180, status: 'pending', applied_amount: undefined };
    const oldReceipt = { ...receipt, applied_amount: undefined };
    expect(sumDocuments([oldInvoice, oldReceipt])).toEqual({ total: 2360, paid: 1180, open: 1180 });
  });

  it('adds in agorot, so the sums do not drift', () => {
    const a = { ...receipt, id: 'a', total_amount: 0.1, amount_paid: 0.1, applied_amount: 0 };
    const b = { ...receipt, id: 'b', total_amount: 0.2, amount_paid: 0.2, applied_amount: 0 };
    expect(sumDocuments([a, b])).toEqual({ total: 0.3, paid: 0.3, open: 0 });
  });

  it('only kogo invoices are settled rows: a store sale or a subscription receipt is not', () => {
    expect(isSettledInvoiceRow(invoice)).toBe(true);
    expect(isSettledInvoiceRow({ ...invoice, origin: 'store_counter' })).toBe(false);
    expect(isSettledInvoiceRow({ ...receipt })).toBe(false);
  });
});
