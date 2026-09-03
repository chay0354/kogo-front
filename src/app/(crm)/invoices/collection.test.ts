import { describe, expect, test } from 'vitest';
import type { DocumentRow } from './types';
import {
  buildCollectionRows,
  collectionDueDate,
  dueDateFromTerms,
  getAgingBuckets,
  getCollectionAge,
  getCollectionAgeLabel,
} from './utils';

function doc(partial: Partial<DocumentRow> & Pick<DocumentRow, 'id'>): DocumentRow {
  return {
    document_number: '2026-0001',
    issue_date: '2026-09-02',
    customer_name: 'גן הפרחים',
    document_type: 'חשבונית מס',
    document_type_code: 'tax_invoice',
    total_amount: 1180,
    amount_paid: 0,
    open_balance: 1180,
    status: 'pending',
    ...partial,
  };
}

describe('שורות הגבייה', () => {
  test('מסמך פתוח נכנס לרשימת החובות', () => {
    const rows = buildCollectionRows([doc({ id: 'a' })], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'document', customer: 'גן הפרחים', open: 1180 });
  });

  test('טיוטה, זיכוי ומסמך ששולם אינם חוב', () => {
    const rows = buildCollectionRows(
      [
        doc({ id: 'draft', is_draft: true, document_type_code: 'draft' }),
        doc({ id: 'credit', document_type_code: 'credit_invoice' }),
        doc({ id: 'paid', open_balance: 0, amount_paid: 1180, status: 'completed' }),
      ],
      [],
    );
    expect(rows).toEqual([]);
  });

  test('שוטף + 30 נמדד מסוף החודש שבו הונפק המסמך', () => {
    // הונפק ב-2.9 → סוף ספטמבר (30.9) ועוד 30 יום → 30.10
    expect(dueDateFromTerms('2026-09-02', 'שוטף + 30')).toBe('2026-10-30');
    expect(dueDateFromTerms('2026-09-28', 'שוטף+30')).toBe('2026-10-30');
    expect(dueDateFromTerms('2026-09-02', 'שוטף 60')).toBe('2026-11-29');
  });

  test('בלי תנאי תשלום אין מועד יעד מומצא', () => {
    expect(dueDateFromTerms('2026-09-02', '')).toBe('');
    expect(dueDateFromTerms('2026-09-02', 'מזומן במעמד האספקה')).toBe('');
  });

  test('תאריך יעד מפורש גובר על תנאי התשלום', () => {
    const row = buildCollectionRows(
      [doc({ id: 'a', due_date: '2026-09-15', payment_terms: 'שוטף + 30' })],
      [],
    )[0];
    expect(collectionDueDate(row)).toBe('2026-09-15');
  });

  test('מסמך שטרם הגיע מועד התשלום שלו אינו באיחור', () => {
    const future = new Date();
    future.setDate(future.getDate() + 20);
    const row = buildCollectionRows(
      [doc({ id: 'a', due_date: future.toISOString().slice(0, 10) })],
      [],
    )[0];
    expect(getCollectionAge(row).overdue).toBe(false);
    expect(getCollectionAgeLabel(row)).toBe('טרם הגיע מועד התשלום');
  });

  test('מסמך שעבר מועדו נספר באיחור, ביחיד וברבים', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const row = buildCollectionRows(
      [doc({ id: 'a', due_date: yesterday.toISOString().slice(0, 10) })],
      [],
    )[0];
    expect(getCollectionAge(row)).toEqual({ days: 1, overdue: true });
    expect(getCollectionAgeLabel(row)).toBe('יום אחד באיחור');
  });

  test('סל ה-Aging סוכם את היתרות הפתוחות', () => {
    const old = new Date();
    old.setDate(old.getDate() - 45);
    const rows = buildCollectionRows(
      [
        doc({ id: 'a', open_balance: 1000 }),
        doc({ id: 'b', open_balance: 500, issue_date: old.toISOString().slice(0, 10) }),
      ],
      [],
    );
    const buckets = getAgingBuckets(rows);
    expect(buckets.find(b => b.key === 'current')).toMatchObject({ total: 1000, count: 1 });
    expect(buckets.find(b => b.key === 'd31_60')).toMatchObject({ total: 500, count: 1 });
  });
});
