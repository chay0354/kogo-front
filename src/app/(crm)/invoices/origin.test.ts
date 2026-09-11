/**
 * The documents table mixes four issuers into one list. These cover the column
 * that says which one a row came from, and the second line that says from where
 * exactly — an order number for a delivery, a branch for a counter sale.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentRow } from './types';
import { getOriginDetail, getOriginLabel, matchesBranchFilter } from './utils';

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    document_number: 'INV-202609-00012',
    issue_date: '2026-09-10',
    customer_name: 'רותי ניסן',
    document_type: 'חשבונית מס/קבלה',
    total_amount: 149,
    amount_paid: 149,
    open_balance: 0,
    status: 'completed',
    ...overrides,
  };
}

describe('getOriginLabel', () => {
  it('uses the label the server sent', () => {
    expect(getOriginLabel(row({ origin: 'store_website', origin_label: 'חנות · אתר' })))
      .toBe('חנות · אתר');
  });

  it('falls back to source for rows issued before origin existed', () => {
    expect(getOriginLabel(row({ source: 'store' }))).toBe('חנות');
    expect(getOriginLabel(row({ source: 'crm' }))).toBe('מנוי');
    expect(getOriginLabel(row({ source: 'local' }))).toBe('מסמך ידני');
  });

  it('shows a dash rather than an empty cell when nothing identifies the row', () => {
    expect(getOriginLabel(row())).toBe('—');
  });
});

describe('getOriginDetail', () => {
  it('names the website order on a delivery', () => {
    const detail = getOriginDetail(row({
      origin: 'store_website',
      website_order_number: 'CG-260830-ABCD',
      branch: 'אם המושבות',
    }));

    expect(detail).toBe('הזמנה CG-260830-ABCD');
  });

  it('names the branch on a counter sale', () => {
    expect(getOriginDetail(row({ origin: 'store_counter', branch: 'אם המושבות' })))
      .toBe('אם המושבות');
  });

  it('falls back to the payment method when there is neither', () => {
    expect(getOriginDetail(row({ origin: 'store_counter', payment_method_label: 'מזומן' })))
      .toBe('מזומן');
  });

  it('is empty when nothing adds detail', () => {
    expect(getOriginDetail(row())).toBe('');
  });
});

describe('matchesBranchFilter', () => {
  const website = { branch_id: null, website_order_number: 'CG-260830-ABCD' };
  const counter = { branch_id: 'branch-1', website_order_number: null };

  it('passes everything when no branch is chosen', () => {
    expect(matchesBranchFilter(website, '')).toBe(true);
    expect(matchesBranchFilter(counter, '')).toBe(true);
  });

  it('matches a branch by id', () => {
    expect(matchesBranchFilter(counter, 'branch-1')).toBe(true);
    expect(matchesBranchFilter(counter, 'branch-2')).toBe(false);
  });

  it('keeps website orders reachable, though they belong to no branch', () => {
    expect(matchesBranchFilter(website, 'delivery')).toBe(true);
    expect(matchesBranchFilter(counter, 'delivery')).toBe(false);
    // and they are correctly excluded from a specific branch
    expect(matchesBranchFilter(website, 'branch-1')).toBe(false);
  });
});
