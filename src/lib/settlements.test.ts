/**
 * Receipts against invoices, front side: the answers read off the wire with
 * nothing assumed (an older server sends none of the fields), and the rule
 * the receipt form spreads a payment by — oldest first, up to what came in —
 * checked the way the server checks it.
 */
import { describe, expect, it } from 'vitest';
import {
  AUTO_SETTLEMENT_PICKS,
  allocateOldestFirst,
  canVoidSettlement,
  formatIsraelMoment,
  manualPicksFrom,
  parseTypedAmount,
  readDocumentSettlements,
  readOpenInvoices,
  resolveSettlements,
  setPickAmount,
  settlementsPayload,
  togglePick,
  type OpenInvoice,
  type SettlementLine,
} from './settlements';

function invoice(id: string, open: number, overrides: Partial<OpenInvoice> = {}): OpenInvoice {
  return {
    id,
    document_number: `TI-2026-${id}`,
    document_type: 'tax_invoice',
    document_type_label: 'חשבונית מס',
    document_date: '2026-09-01',
    due_date: '',
    description: '',
    total: open,
    paid: 0,
    credited: 0,
    open,
    status: 'open',
    status_label: 'פתוחה',
    ...overrides,
  };
}

// Oldest first, as the server lists them.
const INVOICES = [invoice('1', 500), invoice('2', 1180), invoice('3', 300)];

describe('readOpenInvoices', () => {
  it('reads the picker answer, amounts as numbers', () => {
    const answer = readOpenInvoices(
      {
        payer_type: 'receipt',
        open_total: '1680.00',
        results: [
          {
            id: 'a', document_number: 'TI-2026-000012', document_type: 'tax_invoice',
            document_type_label: 'חשבונית מס', document_date: '2026-09-01', due_date: '',
            description: 'חוג', total: '1180.00', paid: '0.00', credited: '0.00', open: '1180.00',
            status: 'open', status_label: 'פתוחה',
          },
        ],
      },
      'receipt',
    );
    expect(answer.open_total).toBe(1680);
    expect(answer.results[0]).toMatchObject({ id: 'a', total: 1180, open: 1180, status_label: 'פתוחה' });
  });

  it('reads an empty or odd body as no invoices', () => {
    expect(readOpenInvoices(null, 'combined')).toEqual({ payer_type: 'combined', open_total: 0, results: [] });
    expect(readOpenInvoices({ results: [{ document_number: 'no id' }] }, 'receipt').results).toEqual([]);
  });
});

describe('readDocumentSettlements', () => {
  it('reads an invoice: its balance and what paid it, voided lines kept', () => {
    const read = readDocumentSettlements({
      id: 'ti',
      balance: { total: '1180.00', paid: '500.00', credited: '0.00', open: '680.00', status: 'partial', status_label: 'שולמה חלקית' },
      settled_by: [
        {
          id: 's-1', document_id: 'rc', document_number: 'RC-2026-000004', document_type: 'receipt',
          document_type_label: 'קבלה', amount: '500.00', source: 'settlement',
          created_at: '2026-09-20T10:00:00+03:00', voided_at: null, voided_by: '',
        },
        {
          id: 's-2', document_id: 'rc2', document_number: 'RC-2026-000003', document_type: 'receipt',
          document_type_label: 'קבלה', amount: '100.00', source: 'settlement',
          created_at: '2026-09-19T10:00:00+03:00', voided_at: '2026-09-19T11:00:00+03:00', voided_by: 'מנהלת',
        },
      ],
      settles: [],
    });
    expect(read.supported).toBe(true);
    expect(read.balance).toEqual({
      total: 1180, paid: 500, credited: 0, open: 680, status: 'partial', status_label: 'שולמה חלקית',
    });
    expect(read.settledBy).toHaveLength(2);
    expect(read.settledBy[1].voided_at).toBe('2026-09-19T11:00:00+03:00');
  });

  it("an older record's line has no id and cannot be voided", () => {
    const read = readDocumentSettlements({
      balance: null,
      settles: [{ id: null, document_id: 'ti', document_number: 'TI-2026-000001', amount: '236.00', source: 'check_plan' }],
    });
    expect(read.balance).toBeNull();
    expect(read.settles[0]).toMatchObject({ id: null, source: 'check_plan', amount: 236 });
    expect(canVoidSettlement(read.settles[0], true)).toBe(false);
  });

  it('knows an answer from a server before settlements', () => {
    expect(readDocumentSettlements({ id: 'x', total_amount: '100.00' })).toEqual({
      balance: null, settledBy: [], settles: [], supported: false,
    });
  });
});

describe('canVoidSettlement', () => {
  const line: SettlementLine = {
    id: 's-1', document_id: 'rc', document_number: 'RC-1', document_type: 'receipt', document_type_label: 'קבלה',
    amount: 100, source: 'settlement', created_at: null, voided_at: null, voided_by: '',
  };

  it('a manager voids a recorded settlement', () => {
    expect(canVoidSettlement(line, true)).toBe(true);
  });

  it('nobody else, and never twice', () => {
    expect(canVoidSettlement(line, false)).toBe(false);
    expect(canVoidSettlement({ ...line, voided_at: '2026-09-20T10:00:00Z' }, true)).toBe(false);
    expect(canVoidSettlement({ ...line, id: null }, true)).toBe(false);
  });
});

describe('parseTypedAmount', () => {
  it('reads what the office types, in agorot', () => {
    expect(parseTypedAmount('1180')).toBe(118000);
    expect(parseTypedAmount('1,180.5')).toBe(118050);
    expect(parseTypedAmount('₪ 99.99')).toBe(9999);
  });

  it('is null for anything that is not an amount', () => {
    expect(parseTypedAmount('')).toBeNull();
    expect(parseTypedAmount('abc')).toBeNull();
    expect(parseTypedAmount('-5')).toBeNull();
    expect(parseTypedAmount('.')).toBeNull();
  });
});

describe('allocateOldestFirst', () => {
  it('closes the oldest first, as far as the amount goes', () => {
    expect(allocateOldestFirst(INVOICES, 100000)).toEqual({ 1: 50000, 2: 50000 });
  });

  it('closes everything when the amount covers it, and nothing with no amount', () => {
    expect(allocateOldestFirst(INVOICES, 1_000_000)).toEqual({ 1: 50000, 2: 118000, 3: 30000 });
    expect(allocateOldestFirst(INVOICES, 0)).toEqual({});
  });
});

describe('resolveSettlements', () => {
  it('by default follows the amount, oldest first', () => {
    const plan = resolveSettlements(INVOICES, AUTO_SETTLEMENT_PICKS, 60000);
    expect(plan.rows.map((row) => [row.invoiceId, row.amount])).toEqual([['1', 50000], ['2', 10000]]);
    expect(plan.total).toBe(60000);
    expect(plan.unapplied).toBe(0);
    expect(plan.valid).toBe(true);
    expect(settlementsPayload(plan)).toEqual([
      { invoice_id: '1', amount: '500.00' },
      { invoice_id: '2', amount: '100.00' },
    ]);
  });

  it('leaves the rest of a larger payment unapplied', () => {
    const plan = resolveSettlements(INVOICES, AUTO_SETTLEMENT_PICKS, 250000);
    expect(plan.total).toBe(198000);
    expect(plan.unapplied).toBe(52000);
  });

  it('keeps what was chosen by hand, and refuses what the server would', () => {
    const picks = { mode: 'manual' as const, amounts: { 2: '1180', 3: '400', 1: '0' } };
    const plan = resolveSettlements(INVOICES, picks, 200000);
    expect(plan.errors['3']).toContain('נותרו לתשלום');
    expect(plan.errors['1']).toBe('הסכום שנסגר בחשבונית חייב להיות גדול מאפס');
    expect(plan.valid).toBe(false);
  });

  it('refuses rows that come to more than the document received', () => {
    const picks = { mode: 'manual' as const, amounts: { 1: '500', 2: '1180' } };
    const plan = resolveSettlements(INVOICES, picks, 100000, 'receipt');
    expect(plan.overCapacity).toContain('גדול מסכום הקבלה');
    expect(plan.valid).toBe(false);
    expect(resolveSettlements(INVOICES, picks, 100000, 'combined').overCapacity).toContain('חשבונית המס/קבלה');
  });

  it('ignores a choice for an invoice no longer on the list', () => {
    const plan = resolveSettlements(INVOICES, { mode: 'manual', amounts: { gone: '100' } }, 100000);
    expect(plan.rows).toEqual([]);
    expect(plan.valid).toBe(true);
  });

  it('closes nothing when nothing is chosen', () => {
    const plan = resolveSettlements(INVOICES, { mode: 'manual', amounts: {} }, 100000);
    expect(settlementsPayload(plan)).toEqual([]);
  });
});

describe('the picker', () => {
  it('a first change starts from what the default chose', () => {
    const plan = resolveSettlements(INVOICES, AUTO_SETTLEMENT_PICKS, 60000);
    expect(manualPicksFrom(plan)).toEqual({ mode: 'manual', amounts: { 1: '500.00', 2: '100.00' } });
  });

  it('unticking drops the invoice and keeps the rest', () => {
    const picks = togglePick(INVOICES, AUTO_SETTLEMENT_PICKS, 60000, '1', false);
    expect(picks).toEqual({ mode: 'manual', amounts: { 2: '100.00' } });
  });

  it('ticking fills in what is left of the amount, capped at the balance', () => {
    const none = { mode: 'manual' as const, amounts: {} };
    expect(togglePick(INVOICES, none, 60000, '2', true).amounts['2']).toBe('600.00');
    expect(togglePick(INVOICES, none, 60000, '3', true).amounts['3']).toBe('300.00');
    // Nothing left: the whole balance, for the office to correct.
    const full = { mode: 'manual' as const, amounts: { 1: '500' } };
    expect(togglePick(INVOICES, full, 50000, '3', true).amounts['3']).toBe('300.00');
  });

  it('typing an amount ticks the invoice', () => {
    const picks = setPickAmount(INVOICES, AUTO_SETTLEMENT_PICKS, 60000, '3', '120');
    expect(picks).toEqual({ mode: 'manual', amounts: { 1: '500.00', 2: '100.00', 3: '120' } });
  });
});

describe('formatIsraelMoment', () => {
  it("reads a moment on Israel's clock, whatever the zone it was written in", () => {
    expect(formatIsraelMoment('2026-09-30T11:05:00Z')).toBe('30.9.2026 14:05');
    expect(formatIsraelMoment('2026-01-15T22:30:00Z')).toBe('16.1.2026 00:30');
  });

  it('is empty for nothing or nonsense', () => {
    expect(formatIsraelMoment(null)).toBe('');
    expect(formatIsraelMoment('not a date')).toBe('');
  });
});
