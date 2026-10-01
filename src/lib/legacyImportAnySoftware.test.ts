/**
 * Importing from any software: the file each format takes, the column mapping,
 * the PDF batches, and what is sent. The axios instance is mocked. Every name is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./api', () => ({ default: api }));

import {
  chosenSourceSystem,
  columnMappingProblems,
  columnOptionLabel,
  commitConfirmText,
  commitLegacyImport,
  documentNumberLabel,
  fromSourceText,
  importFileProblem,
  initialColumnMapping,
  lastNumbersByType,
  mergePdfReports,
  pdfBatches,
  previewFormData,
  setColumn,
  sourcesOf,
  typeValueRows,
  uploadLegacyPdfs,
  type LegacyColumnsInfo,
  type LegacyPdfReport,
  type LegacySummary,
} from './legacyImportApi';

const INFO: LegacyColumnsInfo = {
  columns: [
    { index: 0, header: 'סוג', sensitive: false, samples: ['חשבונית מס'], distinct: [{ value: 'חשבונית מס', count: 3 }, { value: 'הצעה', count: 1 }] },
    { index: 1, header: 'מספר', sensitive: false, samples: ['1001', '1002'], distinct: [] },
    { index: 2, header: 'תאריך', sensitive: false, samples: [], distinct: [] },
    { index: 3, header: 'סה"כ', sensitive: false, samples: ['100'], distinct: [] },
  ],
  rows: 4,
  suggested: { doc_type: 0, number: 1, date: 2, total: 3, vat: null },
  suggested_types: { 'חשבונית מס': 'tax_invoice', הצעה: '' },
  fields: [
    { key: 'doc_type', label: 'סוג מסמך', required: false, hint: '' },
    { key: 'number', label: 'מספר מסמך', required: true, hint: '' },
    { key: 'date', label: 'תאריך', required: true, hint: '' },
    { key: 'total', label: 'סה"כ', required: false, hint: '' },
    { key: 'vat', label: 'מע"מ', required: false, hint: '' },
    { key: 'email', label: 'אימייל', required: false, hint: '' },
  ],
  file_kind: 'csv',
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('the file each format takes', () => {
  it('checks the extension by format', () => {
    expect(importFileProblem({ name: 'export.xls', size: 10 })).toBeNull();
    expect(importFileProblem({ name: 'docs.csv', size: 10 }, 'tazman')).toContain('.xls');
    expect(importFileProblem({ name: 'docs.csv', size: 10 }, 'table')).toBeNull();
    expect(importFileProblem({ name: 'docs.xlsx', size: 10 }, 'table')).toBeNull();
    expect(importFileProblem({ name: 'OPENFRMT.zip', size: 10 }, 'uniform')).toBeNull();
    expect(importFileProblem({ name: 'BKMVDATA.TXT', size: 10 }, 'uniform')).toBeNull();
    expect(importFileProblem({ name: 'docs.pdf', size: 10 }, 'uniform')).toContain('BKMVDATA');
    expect(importFileProblem({ name: 'docs.csv', size: 5_000_000 }, 'table', false)).toContain('גדול מדי');
    // Where the browser packs the file, a table over one request's limit goes through.
    expect(importFileProblem({ name: 'docs.csv', size: 5_000_000 }, 'table', true)).toBeNull();
  });

  it('names the software: a known slug, or the name typed for another', () => {
    expect(chosenSourceSystem('icount', 'x')).toBe('icount');
    expect(chosenSourceSystem('other', '  תוכנה של רו"ח ')).toBe('תוכנה של רו"ח');
  });
});

describe('the column mapping', () => {
  it('opens with the suggestion, every field present', () => {
    expect(initialColumnMapping(INFO)).toEqual({ doc_type: 0, number: 1, date: 2, total: 3, vat: null, email: null });
  });

  it('gives a column to one field only', () => {
    const next = setColumn(initialColumnMapping(INFO), 'vat', 3);
    expect(next.vat).toBe(3);
    expect(next.total).toBeNull();
    expect(setColumn(next, 'vat', null).vat).toBeNull();
  });

  it('says what is still missing, like the server', () => {
    expect(columnMappingProblems(initialColumnMapping(INFO), '')).toEqual([]);
    const bare = { doc_type: null, number: null, date: 2, total: null, amount_before_vat: null };
    expect(columnMappingProblems(bare, '')).toHaveLength(3);
    expect(columnMappingProblems(bare, 'receipt')).toHaveLength(2);
  });

  it('lists the type column’s values with the office’s choice over the suggestion', () => {
    const rows = typeValueRows(INFO, initialColumnMapping(INFO), { הצעה: 'transaction_invoice' });
    expect(rows).toEqual([
      { value: 'חשבונית מס', count: 3, docType: 'tax_invoice', recognised: true },
      { value: 'הצעה', count: 1, docType: 'transaction_invoice', recognised: false },
    ]);
    expect(typeValueRows(INFO, { ...initialColumnMapping(INFO), doc_type: null }, {})).toEqual([]);
  });

  it('shows a column by its header and a value or two', () => {
    expect(columnOptionLabel(INFO.columns[1])).toBe('מספר — 1001, 1002');
    expect(columnOptionLabel({ ...INFO.columns[2], header: '' })).toBe('עמודה 3');
  });
});

describe('what a preview sends', () => {
  const file = new File(['x'], 'docs.csv');

  it('sends the previous software’s export alone, as before', () => {
    const body = previewFormData(new File(['x'], 'export.xls'));
    expect(Array.from(body.keys())).toEqual(['file']);
  });

  it('sends a table with its source, mapping, type names and fixed type', () => {
    const body = previewFormData(file, {
      format: 'table',
      sourceSystem: 'icount',
      columnMapping: { number: 1 },
      typeValues: { הצעה: 'transaction_invoice' },
      fixedDocType: 'receipt',
    });
    expect(body.get('format')).toBe('table');
    expect(body.get('source_system')).toBe('icount');
    expect(JSON.parse(String(body.get('column_mapping')))).toEqual({ number: 1 });
    expect(JSON.parse(String(body.get('type_values')))).toEqual({ הצעה: 'transaction_invoice' });
    expect(body.get('fixed_doc_type')).toBe('receipt');
  });

  it('lets a מבנה אחיד file name its own software', () => {
    const body = previewFormData(new File(['x'], 'a.zip'), { format: 'uniform', sourceSystem: '' });
    expect(body.get('source_system')).toBe('');
    expect(body.get('column_mapping')).toBeNull();
  });
});

describe('commits', () => {
  it('asks for history only when cards are not to be opened', async () => {
    api.post.mockResolvedValue({ data: {} });
    await commitLegacyImport('imp-1', {}, false, false);
    expect(api.post).toHaveBeenCalledWith(
      '/legacy-import/imp-1/commit/',
      { mapping: {}, include_subscription_parents: false, create_customers: false },
      expect.anything(),
    );
  });

  it('says which software and whether cards change', () => {
    const summary = {
      documents: { total: 12 },
      customers: { business_create: 1, business_update: 0, parents: 0 },
      locations: [],
      source: { system: 'icount', label: 'iCount' },
    } as unknown as LegacySummary;
    expect(fromSourceText(summary)).toBe('מ-iCount');
    const text = commitConfirmText(summary, false, {}, false);
    expect(text).toContain('כהיסטוריה מ-iCount');
    expect(text).toContain('לא ייפתחו ולא יעודכנו כרטיסי לקוחות');
    expect(fromSourceText({ source: undefined })).toBe('מהתוכנה הקודמת');
  });
});

describe('the PDFs', () => {
  const f = (name: string, size: number) => ({ name, size });

  it('are sent in batches under the request limit, a file too big on its own left out', () => {
    const { batches, tooBig } = pdfBatches([f('a', 3), f('b', 3), f('c', 5), f('d', 11), f('e', 1)], 10);
    expect(batches.map((b) => b.map((x) => x.name))).toEqual([['a', 'b'], ['c', 'e']]);
    expect(tooBig.map((x) => x.name)).toEqual(['d']);
  });

  it('add the batches’ answers up', () => {
    const one: LegacyPdfReport = {
      bucket_configured: true, source_system: 'tazman', counts: { stored: 2, unmatched: 1 },
      files: [{ file: 'x.pdf', status: 'unmatched' }], total: 3, remaining: 0, stopped: '',
    };
    const two: LegacyPdfReport = { ...one, counts: { stored: 1 }, files: [], total: 1, remaining: 2, stopped: 'refused' };
    const merged = mergePdfReports([one, two]);
    expect(merged.counts).toEqual({ stored: 3, unmatched: 1 });
    expect(merged.stopped).toBe('refused');
    expect(merged.total).toBe(4);
    expect(merged.remaining).toBe(2);
  });

  it('are posted as files with their software', async () => {
    api.post.mockResolvedValue({ data: {} });
    await uploadLegacyPdfs({ pdfs: [new File(['%PDF'], '40001.pdf')] }, 'tazman');
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/legacy-import/pdfs/');
    expect((body as FormData).get('source_system')).toBe('tazman');
    expect(((body as FormData).getAll('files')[0] as File).name).toBe('40001.pdf');
  });
});

describe('history from more than one software', () => {
  const doc = (source_system: string, source_label: string, number: number) => ({
    doc_type: 'tax_invoice' as const, doc_type_label: 'חשבונית מס', number, document_date: '2025-01-01',
    source_system, source_label,
  });

  it('keeps each software’s last numbers apart, the previous software first', () => {
    const entries = lastNumbersByType([doc('icount', 'iCount', 7), doc('tazman', 'Tazman', 40001), doc('icount', 'iCount', 9)]);
    expect(entries.map((e) => [e.label, e.number])).toEqual([
      ['חשבונית מס (Tazman)', 40001],
      ['חשבונית מס (iCount)', 9],
    ]);
    expect(sourcesOf([doc('icount', 'iCount', 1), doc('icount', 'iCount', 2)])).toEqual(['iCount']);
  });

  it('shows a number as it was printed', () => {
    expect(documentNumberLabel({ number: 15, original_number: 'INV-0015' })).toBe('INV-0015');
    expect(documentNumberLabel({ number: 15 })).toBe('15');
  });
});
