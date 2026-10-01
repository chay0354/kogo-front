import { describe, expect, it } from 'vitest';
import type { StoreInvoice } from '@/types/store';
import {
  isStoreRowPaid,
  matchesPaymentSearch,
  storeContactLine,
  storeInvoiceToLedgerRow,
  storeReviewChoices,
} from './utils';

const invoice: StoreInvoice = {
  id: 'inv-1',
  invoice_number: 'ST-2026-0044',
  child: null,
  child_name: null,
  customer_name: 'רותי ניסן',
  customer_phone: '0521234567',
  customer_email: 'ruti@example.com',
  shipping_address: 'הרצל 12, כפר סבא, 4421012',
  customer_notes: 'להשאיר אצל השכן',
  website_order_number: 'CG-260830-ABCD',
  total_amount: 149,
  amount_paid: 149,
  payment_method: 'credit_card',
  payment_status: 'completed',
  tranzila_transaction_id: 'TX-1',
  tranzila_confirmation_code: '',
  charged_with_token: false,
  branch: null,
  branch_name: null,
  issue_date: '2026-08-30T10:00:00Z',
  notes: '',
  line_items: [],
  created_at: '2026-08-30T10:00:00Z',
};

describe('a store order on the payments tab', () => {
  const row = storeInvoiceToLedgerRow(invoice);

  it('carries everything the buyer typed', () => {
    expect(row.customer_phone).toBe('0521234567');
    expect(row.shipping_address).toBe('הרצל 12, כפר סבא, 4421012');
    expect(row.customer_notes).toBe('להשאיר אצל השכן');
    expect(row.website_order_number).toBe('CG-260830-ABCD');
    expect(row.store_invoice_id).toBe('inv-1');
  });

  it('shows phone, email and address on one line', () => {
    expect(storeContactLine(row)).toBe('0521234567 · ruti@example.com · הרצל 12, כפר סבא, 4421012');
  });

  it('is found by phone, even typed with dashes', () => {
    expect(matchesPaymentSearch(row, '052-123-4567')).toBe(true);
    expect(matchesPaymentSearch(row, '4567')).toBe(true);
    expect(matchesPaymentSearch(row, '0549')).toBe(false);
  });

  it('is found by address, email, notes and website order number', () => {
    expect(matchesPaymentSearch(row, 'הרצל')).toBe(true);
    expect(matchesPaymentSearch(row, 'ruti@')).toBe(true);
    expect(matchesPaymentSearch(row, 'השכן')).toBe(true);
    expect(matchesPaymentSearch(row, 'CG-260830')).toBe(true);
    expect(matchesPaymentSearch(row, 'אין כזה')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesPaymentSearch(row, '   ')).toBe(true);
  });
});

describe('a store payment in review', () => {
  it('carries the flag and the numbers a manager decides about', () => {
    const row = storeInvoiceToLedgerRow({
      ...invoice,
      payment_status: 'pending',
      payment_in_review: true,
      payment_review_numbers: [{ index: '999999', suspected: false, reported_at: '2026-09-30T10:00:00Z' }],
    });
    expect(row.payment_in_review).toBe(true);
    expect(row.review_numbers).toEqual(['999999']);
    expect(row.review_suspected).toEqual([]);
  });

  it('marks the numbers the report does not tie to the order', () => {
    const row = storeInvoiceToLedgerRow({
      ...invoice,
      payment_status: 'pending',
      payment_in_review: true,
      payment_review_numbers: [
        { index: '999999', suspected: false, reported_at: '2026-09-30T10:00:00Z' },
        { index: '555555', suspected: true, reported_at: '2026-09-30T10:05:00Z' },
      ],
    });
    expect(row.review_suspected).toEqual(['555555']);
  });

  it('offers a manager the decisions that fit the row', () => {
    const inReview = storeInvoiceToLedgerRow({
      ...invoice,
      payment_status: 'pending',
      payment_in_review: true,
      payment_review_numbers: [{ index: '999999', suspected: false, reported_at: '2026-09-30T10:00:00Z' }],
    });
    expect(storeReviewChoices(inReview).actions.map((a) => a.action)).toEqual(['complete', 'release']);

    // A failed order whose number a person released: the report may still confirm it.
    const released = storeInvoiceToLedgerRow({
      ...invoice,
      payment_status: 'failed',
      payment_in_review: false,
      payment_review_numbers: [{ index: '999999', suspected: false, released: true, reported_at: '2026-09-30T10:00:00Z' }],
    });
    expect(storeReviewChoices(released).actions.map((a) => a.action)).toEqual(['complete']);
    expect(storeReviewChoices(released).note).toContain('שוחרר');

    // A paid order with a further number: a second charge, or not ours.
    const paid = storeInvoiceToLedgerRow({
      ...invoice,
      payment_status: 'completed',
      payment_in_review: false,
      payment_review_numbers: [{ index: '111111', suspected: true, reported_at: '2026-09-30T10:00:00Z' }],
    });
    expect(isStoreRowPaid(paid)).toBe(true);
    expect(storeReviewChoices(paid).actions).toEqual([
      { action: 'complete', label: 'חיוב שני — אימות' },
      { action: 'close', label: 'סגור — לא שלנו' },
    ]);

    expect(storeReviewChoices(storeInvoiceToLedgerRow(invoice))).toEqual({ note: '', actions: [] });
  });

  it('carries "the customer is waiting" from the CRM', () => {
    expect(storeInvoiceToLedgerRow({ ...invoice, payment_status: 'failed', payment_retry_waiting: true }).retry_waiting).toBe(true);
    expect(storeInvoiceToLedgerRow(invoice).retry_waiting).toBe(false);
  });

  it('is not in review when the CRM says nothing', () => {
    const row = storeInvoiceToLedgerRow(invoice);
    expect(row.payment_in_review).toBe(false);
    expect(row.review_numbers).toEqual([]);
  });
});
