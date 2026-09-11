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
  downloadMissingReceiptsCsv,
  fetchMissingReceipts,
  issueMissingReceipts,
  MISSING_RECEIPTS_CONFIRM_WORD,
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
