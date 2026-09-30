/**
 * The documents tab's download: one route per row, the same for the button
 * and the click. A lesson receipt (IR) goes to a copy through the child card's
 * endpoint (audit M5, 30.9.2026) — and only once the server names it.
 */
import { describe, expect, it } from 'vitest';
import { documentDownloadRoute } from './documentDownload';

describe('documentDownloadRoute', () => {
  it('sends a lesson receipt the server names to its copy', () => {
    expect(documentDownloadRoute({
      id: 'crm-inv-7', source: 'crm', lesson_invoice_id: 'inv-7', pdf_url: '',
    })).toEqual({ kind: 'lesson_receipt', id: 'inv-7' });
  });

  it('leaves a lesson receipt from an older server without a file, as before', () => {
    expect(documentDownloadRoute({ id: 'crm-inv-7', source: 'crm', pdf_url: '' })).toBeNull();
  });

  it('keeps every other row where it was', () => {
    expect(documentDownloadRoute({ id: 'st-1', store_invoice_id: 'sale-1', source: 'crm' }))
      .toEqual({ kind: 'store', id: 'sale-1' });
    expect(documentDownloadRoute({ id: 'tz-1', pdf_url: 'https://tranzila.example/doc.pdf', source: 'tranzila' }))
      .toEqual({ kind: 'url', url: 'https://tranzila.example/doc.pdf' });
    expect(documentDownloadRoute({ id: 'doc-1', source: 'local' })).toEqual({ kind: 'local', id: 'doc-1' });
    expect(documentDownloadRoute({ id: 'tz-2', source: 'tranzila' })).toBeNull();
  });

  it('prefers a PDF the row already has over the receipt’s copy, as the row did before', () => {
    expect(documentDownloadRoute({
      id: 'crm-inv-8', source: 'crm', lesson_invoice_id: 'inv-8', pdf_url: 'https://old.example/x.pdf',
    })).toEqual({ kind: 'url', url: 'https://old.example/x.pdf' });
  });
});
