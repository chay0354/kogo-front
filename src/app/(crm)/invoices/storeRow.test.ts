import { describe, expect, it } from 'vitest';
import type { StoreInvoice } from '@/types/store';
import { matchesPaymentSearch, storeContactLine, storeInvoiceToLedgerRow } from './utils';

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
