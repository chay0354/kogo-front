/**
 * The missing-receipts client against the contract: which URL each call
 * reaches, what it sends, and how the answer comes back. The axios instance is
 * mocked, so nothing here reaches a server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./api', () => ({ default: api }));

import {
  discardDraft,
  fetchCreditRoom,
  finalizeDraft,
  recordCustomerAck,
  bounceCheck,
  cancelCashPlan,
  cancelCheckPlan,
  fetchOpenInvoices,
  voidSettlement,
  downloadMissingReceiptsCsv,
  fetchMissingReceipts,
  fetchMissingReceiptsNextNumber,
  issueMissingReceipts,
  MISSING_RECEIPTS_CONFIRM_WORD,
  MISSING_RECEIPTS_MAX_BATCH,
  setAllocationNumber,
} from './documentsApi';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchMissingReceipts', () => {
  it('asks for the year and returns the report', async () => {
    const report = {
      year: 2026,
      count: 1,
      total: '236.00',
      next_number: 'IR-2026-000124',
      rows: [{ payment_id: 'p-1', amount: '236.00' }],
      continuity: [{ series: 'IR', missing: [] }],
    };
    api.get.mockResolvedValue({ data: report });

    expect(await fetchMissingReceipts(2026)).toEqual(report);
    expect(api.get).toHaveBeenCalledWith('/documents/missing-receipts/', {
      params: { year: 2026 },
      timeout: 60000,
    });
  });

  it('reads an incomplete body as an empty report', async () => {
    api.get.mockResolvedValue({ data: null });
    expect(await fetchMissingReceipts(2025)).toEqual({
      year: 2025, count: 0, total: '0.00', next_number: '', rows: [], continuity: [],
    });
  });

  it("passes the server's refusal through", async () => {
    const refusal = { response: { status: 403, data: { detail: 'אין הרשאה. נדרש תפקיד מנהל.' } } };
    api.get.mockRejectedValue(refusal);
    await expect(fetchMissingReceipts(2026)).rejects.toBe(refusal);
  });
});

describe('fetchMissingReceiptsNextNumber', () => {
  it('reads the number issuing would start from now', async () => {
    api.get.mockResolvedValue({ data: { next_number: 'IR-2026-000125' } });

    expect(await fetchMissingReceiptsNextNumber()).toBe('IR-2026-000125');
    expect(api.get).toHaveBeenCalledWith('/documents/missing-receipts/next-number/');
  });

  it('reads an empty body as no number', async () => {
    api.get.mockResolvedValue({ data: null });
    expect(await fetchMissingReceiptsNextNumber()).toBe('');
  });
});

describe('the batch cap', () => {
  it('matches the server: a hundred receipts per request', () => {
    expect(MISSING_RECEIPTS_MAX_BATCH).toBe(100);
  });
});

describe('downloadMissingReceiptsCsv', () => {
  it('fetches the CSV as a blob and saves it under the year', async () => {
    const click = vi.fn();
    const link = { href: '', download: '', click, remove: vi.fn() };
    const createObjectURL = vi.fn(() => 'blob:csv');
    vi.stubGlobal('window', { URL: { createObjectURL, revokeObjectURL: vi.fn() } });
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } });
    api.get.mockResolvedValue({ data: 'csv-bytes' });

    await downloadMissingReceiptsCsv(2026);

    expect(api.get).toHaveBeenCalledWith('/documents/missing-receipts/export/', {
      params: { year: 2026 },
      responseType: 'blob',
    });
    expect(link.download).toBe('missing-receipts-2026.csv');
    expect(click).toHaveBeenCalled();
  });
});

describe('issueMissingReceipts', () => {
  it('posts the chosen payments and the typed word', async () => {
    api.post.mockResolvedValue({
      data: {
        issued: [{ payment_id: 'p-1', number: 'IR-2026-000124' }],
        skipped: [{ payment_id: 'p-2', reason: 'has_receipt', message: 'כבר הופקה לו קבלה' }],
        failed: [],
      },
    });

    const result = await issueMissingReceipts(['p-1', 'p-2'], MISSING_RECEIPTS_CONFIRM_WORD);

    expect(api.post).toHaveBeenCalledWith(
      '/documents/missing-receipts/issue/',
      { payment_ids: ['p-1', 'p-2'], confirm: 'הפק' },
      { timeout: 120000 },
    );
    expect(result.issued).toEqual([{ payment_id: 'p-1', number: 'IR-2026-000124' }]);
    expect(result.skipped).toHaveLength(1);
    expect(result.failed).toEqual([]);
  });

  it('fills in the lists a body leaves out', async () => {
    api.post.mockResolvedValue({ data: { issued: [{ payment_id: 'p-1', number: 'IR-2026-000001' }] } });
    expect(await issueMissingReceipts(['p-1'], 'הפק')).toEqual({
      issued: [{ payment_id: 'p-1', number: 'IR-2026-000001' }],
      skipped: [],
      failed: [],
    });
  });

  it("passes the server's refusal through, words and all", async () => {
    const refusal = { response: { status: 400, data: { error: 'לא הופקו קבלות: כדי להפיק יש להקליד "הפק" לאישור.' } } };
    api.post.mockRejectedValue(refusal);
    await expect(issueMissingReceipts(['p-1'], 'כן')).rejects.toBe(refusal);
  });
});

describe('setAllocationNumber', () => {
  it('posts the number and returns what the server says became of the original', async () => {
    const answer = {
      id: 'd-1', allocation_number: '123456789', allocation_entered_at: '2026-09-30T09:00:00+03:00',
      copy_only: false, signed: true, delivery: 'email', delivery_reason: 'המקור החתום נשלח במייל',
    };
    api.post.mockResolvedValue({ data: answer });
    expect(await setAllocationNumber('d-1', '123456789')).toEqual(answer);
    expect(api.post).toHaveBeenCalledWith('/documents/documents/d-1/allocation-number/', { allocation_number: '123456789' });
  });

  it('throws the 409 of a signed original as it came, for its sentence', async () => {
    const refusal = { response: { status: 409, data: { error: 'המקור כבר נחתם עם מספר הקצאה 111111111' } } };
    api.post.mockRejectedValue(refusal);
    await expect(setAllocationNumber('d-1', '')).rejects.toBe(refusal);
  });
});

describe('fetchOpenInvoices', () => {
  it("asks for a private customer's invoices a receipt closes", async () => {
    api.get.mockResolvedValue({ data: { payer_type: 'receipt', open_total: '0.00', results: [] } });
    await fetchOpenInvoices({ childId: 'c-1', businessCustomerId: 'b-1', payerType: 'receipt' });
    expect(api.get).toHaveBeenCalledWith('/documents/documents/open-invoices/', {
      params: { child_id: 'c-1', payer_type: 'receipt' },
    });
  });

  it("asks for a business customer's invoices an invoice-receipt closes, and reads the answer", async () => {
    api.get.mockResolvedValue({
      data: {
        payer_type: 'combined',
        open_total: '590.00',
        results: [{ id: 'tx-1', document_number: 'TX-2026-000002', total: '590.00', open: '590.00', status: 'open' }],
      },
    });
    const answer = await fetchOpenInvoices({ businessCustomerId: 'b-1', payerType: 'combined' });
    expect(api.get).toHaveBeenCalledWith('/documents/documents/open-invoices/', {
      params: { business_customer_id: 'b-1', payer_type: 'combined' },
    });
    expect(answer.open_total).toBe(590);
    expect(answer.results[0]).toMatchObject({ id: 'tx-1', open: 590, status_label: 'פתוחה' });
  });

  it('passes a 404 (a server before settlements) through for the form to fall back', async () => {
    const missing = { response: { status: 404, data: {} } };
    api.get.mockRejectedValue(missing);
    await expect(fetchOpenInvoices({ childId: 'c-1', payerType: 'receipt' })).rejects.toBe(missing);
  });
});

describe('voidSettlement', () => {
  it('posts the reason and reads the balance the invoice has again', async () => {
    api.post.mockResolvedValue({
      data: {
        id: 's-1', payer_number: 'RC-2026-000004', invoice_number: 'TI-2026-000012', amount: '500.00',
        voided_at: '2026-09-30T10:00:00+03:00',
        invoice_balance: { total: '1180.00', paid: '0.00', credited: '0.00', open: '1180.00', status: 'open', status_label: 'פתוחה' },
      },
    });
    const answer = await voidSettlement('s-1', 'נרשמה בטעות');
    expect(api.post).toHaveBeenCalledWith('/documents/settlements/s-1/void/', { reason: 'נרשמה בטעות' });
    expect(answer.invoice_balance?.open).toBe(1180);
    expect(answer.payer_number).toBe('RC-2026-000004');
  });

  it('throws the 409 of a settlement voided already, as it came', async () => {
    const refusal = { response: { status: 409, data: { error: 'הסגירה כבר בוטלה (30/09/2026 10:00)' } } };
    api.post.mockRejectedValue(refusal);
    await expect(voidSettlement('s-1', 'שוב')).rejects.toBe(refusal);
  });
});

describe('cancelCheckPlan', () => {
  it('sends the reason and separates the credit notes from the plan', async () => {
    api.post.mockResolvedValue({ data: { id: 'p-1', status: 'cancelled', items: [], credit_notes: ['CR-2026-000003'] } });
    const answer = await cancelCheckPlan('p-1', ' עזב את החוג ');
    expect(api.post).toHaveBeenCalledWith('/documents/check-plans/p-1/cancel/', { reason: 'עזב את החוג' });
    expect(answer.credit_notes).toEqual(['CR-2026-000003']);
    expect(answer.plan).toMatchObject({ id: 'p-1', status: 'cancelled' });
  });

  it('reads an older server, which sends the plan alone', async () => {
    api.post.mockResolvedValue({ data: { id: 'p-1', status: 'cancelled', items: [] } });
    const answer = await cancelCheckPlan('p-1');
    expect(api.post).toHaveBeenCalledWith('/documents/check-plans/p-1/cancel/', {});
    expect(answer.credit_notes).toEqual([]);
  });
});

describe('bounceCheck', () => {
  it('posts the check, the reason and the replacement', async () => {
    api.post.mockResolvedValue({
      data: { plan: { id: 'p-1' }, item_id: 'i-1', credit_note_number: 'CR-2026-000004', replacement_plan: { id: 'p-2' } },
    });
    const replacement = {
      date: '2026-10-10', amount: 300, bank: '12', branch: '600', account_number: '1234',
      check_number: '77', check_crossed: true,
    };
    const answer = await bounceCheck('p-1', { item_id: 'i-1', reason: 'אין כיסוי', replacement });
    expect(api.post).toHaveBeenCalledWith('/documents/check-plans/p-1/bounce/', {
      item_id: 'i-1', reason: 'אין כיסוי', replacement,
    });
    expect(answer.credit_note_number).toBe('CR-2026-000004');
    expect(answer.replacement_plan).toEqual({ id: 'p-2' });
  });

  it('sends only the check when nothing else was given', async () => {
    api.post.mockResolvedValue({ data: { plan: { id: 'p-1' }, item_id: 'i-1', credit_note_number: null, replacement_plan: null } });
    const answer = await bounceCheck('p-1', { item_id: 'i-1', reason: '  ', replacement: null });
    expect(api.post).toHaveBeenCalledWith('/documents/check-plans/p-1/bounce/', { item_id: 'i-1' });
    expect(answer.credit_note_number).toBeNull();
    expect(answer.replacement_plan).toBeNull();
  });
});

describe('cancelCashPlan', () => {
  it('sends the refund amount, 0 included, and reads the credit note', async () => {
    api.post.mockResolvedValue({
      data: { id: 'cp-1', status: 'cancelled', credit_note_number: 'CR-2026-000005', unused_amount: '720.00', message: '' },
    });
    const answer = await cancelCashPlan('cp-1', { reason: 'עזבו', refund_amount: '0' });
    expect(api.post).toHaveBeenCalledWith('/documents/cash-plans/cp-1/cancel/', { reason: 'עזבו', refund_amount: '0' });
    expect(answer).toMatchObject({ credit_note_number: 'CR-2026-000005', unused_amount: '720.00', message: '' });
    expect(answer.plan).toMatchObject({ id: 'cp-1', status: 'cancelled' });
  });

  it("leaves the refund out for the server's default, and passes its message on", async () => {
    api.post.mockResolvedValue({
      data: { id: 'cp-1', status: 'cancelled', credit_note_number: null, unused_amount: '480.00', message: 'אין מה לזכות' },
    });
    const answer = await cancelCashPlan('cp-1', { refund_amount: '' });
    expect(api.post).toHaveBeenCalledWith('/documents/cash-plans/cp-1/cancel/', {});
    expect(answer.credit_note_number).toBeNull();
    expect(answer.message).toBe('אין מה לזכות');
  });
});


describe('drafts and credit notes (audit 30.9.2026)', () => {
  it('approves a draft and returns the issued document', async () => {
    api.post.mockResolvedValue({ data: { id: 'd1', document_number: 'RC-2026-000004', document_type: 'receipt' } });
    const doc = await finalizeDraft('d1');
    expect(api.post).toHaveBeenCalledWith('/documents/documents/d1/finalize/');
    expect(doc.document_number).toBe('RC-2026-000004');
  });

  it('discards a draft', async () => {
    api.post.mockResolvedValue({ data: { id: 'd1', document_number: 'D-1A2B3C4D' } });
    await expect(discardDraft('d1')).resolves.toEqual({ id: 'd1', document_number: 'D-1A2B3C4D' });
    expect(api.post).toHaveBeenCalledWith('/documents/documents/d1/discard/');
  });

  it('records the customer\'s confirmation with its day, and without one', async () => {
    api.post.mockResolvedValue({ data: { id: 'c1', customer_ack_at: 'x', customer_ack_note: 'n' } });
    await recordCustomerAck('c1', { note: '  חתימה על העתק ', date: '2026-09-29' });
    expect(api.post).toHaveBeenLastCalledWith('/documents/documents/c1/customer-ack/', {
      note: 'חתימה על העתק', date: '2026-09-29',
    });
    await recordCustomerAck('c1', { note: 'דואר רשום' });
    expect(api.post).toHaveBeenLastCalledWith('/documents/documents/c1/customer-ack/', { note: 'דואר רשום' });
  });

  it('asks what is left to credit by the document\'s number', async () => {
    api.get.mockResolvedValue({ data: { number: 'TI-2026-000012', known: true, left: '150.00' } });
    const room = await fetchCreditRoom('TI-2026-000012');
    expect(api.get).toHaveBeenCalledWith('/documents/documents/credit-room/', { params: { number: 'TI-2026-000012' } });
    expect(room.left).toBe('150.00');
  });
});
