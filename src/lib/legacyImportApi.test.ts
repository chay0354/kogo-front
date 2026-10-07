/**
 * What the import screens compute, and what they send. The axios instance is
 * mocked, so nothing here reaches a server. Every name is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./api', () => ({ default: api }));

import {
  ImportFileTooBigError,
  LEGACY_IMPORT_MAX_BYTES,
  LEGACY_IMPORT_SCOPES,
  LEGACY_IMPORT_MAX_UNPACKED_BYTES,
  applyMappingChange,
  branchAllowed,
  categoriesFor,
  commitConfirmText,
  commitLegacyImport,
  filesLocations,
  mappingToSend,
  documentAmount,
  fetchLegacyDocuments,
  fetchLegacySources,
  formatLegacyDate,
  importFileProblem,
  initialMapping,
  openCountNote,
  openInvoicesCsv,
  packForUpload,
  previewLegacyImport,
  scopeFlags,
  scopeProblem,
  lastNumbersByType,
  mappingPayload,
  mappingProgress,
  numberingLine,
  type LegacyLocation,
  type LegacyOptions,
  type LegacySummary,
  type LegacyTypeRow,
} from './legacyImportApi';

const OPTIONS: LegacyOptions = {
  businesses: [
    { id: 'lessons', name: 'חוגים', is_active: true },
    { id: 'shows', name: 'הצגות חיצוניות', is_active: true },
  ],
  categories: [
    { id: 'branches', name: 'סניפים', business_id: 'lessons', is_active: true },
    { id: 'classes', name: 'קפוארה', business_id: 'lessons', is_active: true },
    { id: 'old', name: 'ישנה', business_id: 'lessons', is_active: false },
    { id: 'shows-general', name: 'כללי', business_id: 'shows', is_active: true },
  ],
  branches: [{ id: 'zamir', name: 'מרכז זמיר', is_active: true }],
};

function location(overrides: Partial<LegacyLocation>): LegacyLocation {
  return {
    location: 'כפר סבא',
    documents: 10,
    business_customers: 1,
    customers: 5,
    kind: 'branch',
    business_id: null,
    category_id: null,
    branch_id: null,
    reason: '',
    flag: false,
    ...overrides,
  };
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('importFileProblem', () => {
  it('accepts the .xls export under the limit', () => {
    expect(importFileProblem({ name: 'export_invoices.xls', size: 3_400_000 })).toBeNull();
    expect(importFileProblem({ name: 'EXPORT.XLS', size: 10 })).toBeNull();
  });

  it('refuses no file, another format, and a file over the limit', () => {
    expect(importFileProblem(null)).toBe('לא נבחר קובץ');
    expect(importFileProblem({ name: 'export.xlsx', size: 10 })).toContain('.xls');
    // A browser that cannot pack a file sends it whole, so one request's limit is the limit.
    expect(importFileProblem({ name: 'export.xls', size: LEGACY_IMPORT_MAX_BYTES + 1 }, 'tazman', false)).toContain('4.3MB');
  });

  it('lets a file over one request through where the browser packs it, up to what the server unpacks', () => {
    expect(importFileProblem({ name: 'export.xls', size: 11_174_400 }, 'tazman', true)).toBeNull();
    expect(
      importFileProblem({ name: 'export.xls', size: LEGACY_IMPORT_MAX_UNPACKED_BYTES + 1 }, 'tazman', true),
    ).toContain('40MB');
  });
});

describe('packing a file too big for one request', () => {
  const big = (bytes: Uint8Array<ArrayBuffer>, name = 'export_invoices.xls') => new File([bytes], name);

  async function unpacked(file: File): Promise<Uint8Array> {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  it('sends a file that fits as it is', async () => {
    const file = big(new Uint8Array(1000));
    expect(await packForUpload(file)).toBe(file);
  });

  it('gzips a bigger one, and what the server unpacks is the file itself', async () => {
    // Repetitive, like an .xls of the same names over and over.
    const bytes = new Uint8Array(LEGACY_IMPORT_MAX_BYTES + 5000).map((_, i) => i % 7);
    const packed = await packForUpload(big(bytes));
    expect(packed.name).toBe('export_invoices.xls.gz');
    expect(packed.size).toBeLessThan(LEGACY_IMPORT_MAX_BYTES);
    const back = await unpacked(packed);
    expect(back.length).toBe(bytes.length);
    expect(back[12345]).toBe(bytes[12345]);
  });

  it('says so when even the packed file is too big', async () => {
    // Noise does not shrink.
    const noise = new Uint8Array(LEGACY_IMPORT_MAX_BYTES + 200_000);
    for (let i = 0; i < noise.length; i += 65536) crypto.getRandomValues(noise.subarray(i, i + 65536));
    await expect(packForUpload(big(noise))).rejects.toBeInstanceOf(ImportFileTooBigError);
    await expect(packForUpload(big(noise))).rejects.toThrow('גם אחרי דחיסה');
  });

  it('the preview sends the packed file', async () => {
    api.post.mockResolvedValue({ data: { id: 'x' } });
    const bytes = new Uint8Array(LEGACY_IMPORT_MAX_BYTES + 5000);
    await previewLegacyImport(big(bytes));
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/legacy-import/preview/');
    expect((body as FormData).get('file')).toMatchObject({ name: 'export_invoices.xls.gz' });
    expect(config.timeout).toBe(280000);
  });
});

describe('open invoices', () => {
  const invoice = {
    doc_type: 'tax_invoice' as const,
    type_label: 'חשבונית מס',
    number: 40002,
    original_number: '',
    date: '2026-06-28',
    customer_name: 'להקת "הדגמה", בע"מ',
    id_number: '512345678',
    invoice_total: '1180.00',
    details: 'הדרכות יוני',
    location: 'כפר סבא',
  };

  it('are a CSV Excel reads as Hebrew, with commas and quotes kept inside their cell', () => {
    const csv = openInvoicesCsv([invoice]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).trim().split('\r\n');
    expect(header).toBe('סוג מסמך,מספר,תאריך,לקוח,ת"ז / ח"פ,סכום,פרטים,מיקום'.replace('ת"ז / ח"פ', '"ת""ז / ח""פ"'));
    expect(line).toBe('חשבונית מס,40002,28/06/2026,"להקת ""הדגמה"", בע""מ",512345678,1180.00,הדרכות יוני,כפר סבא');
  });

  it('show the number as the software printed it, when it printed another', () => {
    expect(openInvoicesCsv([{ ...invoice, original_number: 'INV-0015' }])).toContain(',INV-0015,');
  });

  it('are named in the numbering table of their type', () => {
    expect(openCountNote({ open: 5 })).toBe('5 מהן פתוחות ולא ייובאו');
    expect(openCountNote({ open: 1 })).toBe('אחת מהן פתוחה ולא תיובא');
    expect(openCountNote({ open: 0 })).toBe('');
    expect(openCountNote({})).toBe('');
  });
});

describe('the mapping', () => {
  it('opens with the server suggestion for every location', () => {
    const mapping = initialMapping([
      location({ business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' }),
      location({ location: '01 הוצאות', kind: 'expenses', flag: true }),
    ]);
    expect(mapping['כפר סבא']).toEqual({ business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' });
    expect(mapping['01 הוצאות']).toEqual({ business_id: null, category_id: null, branch_id: null });
  });

  it('opens the branch select only under סניפים, or with no business', () => {
    expect(branchAllowed({ business_id: null, category_id: null, branch_id: null }, OPTIONS)).toBe(true);
    expect(branchAllowed({ business_id: 'lessons', category_id: 'branches', branch_id: null }, OPTIONS)).toBe(true);
    expect(branchAllowed({ business_id: 'lessons', category_id: 'classes', branch_id: null }, OPTIONS)).toBe(false);
    expect(branchAllowed({ business_id: 'lessons', category_id: null, branch_id: null }, OPTIONS)).toBe(false);
  });

  it('drops a branch once the category is not סניפים', () => {
    const start = { business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' };
    expect(applyMappingChange(start, 'category_id', 'classes', OPTIONS)).toEqual({
      business_id: 'lessons',
      category_id: 'classes',
      branch_id: null,
    });
  });

  it('a new business clears a category of another, and picks its only one', () => {
    const start = { business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' };
    expect(applyMappingChange(start, 'business_id', 'shows', OPTIONS)).toEqual({
      business_id: 'shows',
      category_id: 'shows-general',
      branch_id: null,
    });
    expect(applyMappingChange(start, 'business_id', '', OPTIONS)).toEqual({
      business_id: null,
      category_id: null,
      branch_id: 'zamir',
    });
  });

  it('lists a business’s active categories, and one already chosen even if off', () => {
    expect(categoriesFor(OPTIONS, { business_id: 'lessons', category_id: null, branch_id: null }).map((c) => c.id)).toEqual([
      'branches',
      'classes',
    ]);
    expect(categoriesFor(OPTIONS, { business_id: 'lessons', category_id: 'old', branch_id: null }).map((c) => c.id)).toContain('old');
  });

  it('sends only what points somewhere', () => {
    expect(
      mappingPayload({
        'כפר סבא': { business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' },
        '01 הוצאות': { business_id: null, category_id: null, branch_id: null },
        'בית מרקו': { business_id: null, category_id: null, branch_id: 'zamir' },
      }),
    ).toEqual({
      'כפר סבא': { business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' },
      'בית מרקו': { business_id: null, category_id: null, branch_id: 'zamir' },
    });
  });

  it('counts what is still going nowhere', () => {
    const locations = [
      location({ documents: 100, business_customers: 3 }),
      location({ location: '01 הוצאות', documents: 9, business_customers: 2, flag: true }),
    ];
    const progress = mappingProgress(locations, {
      'כפר סבא': { business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' },
    });
    expect(progress).toEqual({ total: 2, mapped: 1, unmappedDocuments: 9, unmappedBusinessCustomers: 2, flagged: 1 });
  });
});

describe('numberingLine', () => {
  const row: LegacyTypeRow = {
    doc_type: 'tax_invoice',
    label: 'חשבונית מס',
    original_labels: ['חשבונית מס'],
    count: 3,
    first_number: 100,
    first_date: '2024-01-01',
    last_number: 104,
    last_date: '2024-06-01',
    latest_date: '2024-06-01',
    missing_in_span: 2,
  };

  it('says how much of the span the file has', () => {
    const line = numberingLine(row);
    expect(line.span).toBe(5);
    expect(line.coverage).toContain('3 מתוך 5');
    expect(line.coverage).toContain('2 אינם בקובץ');
  });

  it('says so when the span is whole', () => {
    expect(numberingLine({ ...row, count: 5, missing_in_span: 0 }).coverage).toBe('הטווח רציף בקובץ');
  });
});

describe('a customer’s history', () => {
  const doc = (doc_type: 'combined' | 'tax_invoice' | 'credit_invoice', number: number, document_date: string) => ({
    doc_type,
    doc_type_label: doc_type === 'tax_invoice' ? 'חשבונית מס' : doc_type === 'credit_invoice' ? 'חשבונית מס זיכוי' : 'חשבונית מס/קבלה',
    number,
    document_date,
  });

  it('gives the last number of each type, in kogo’s order', () => {
    expect(
      lastNumbersByType([doc('tax_invoice', 40001, '2025-01-01'), doc('combined', 70002, '2025-02-01'), doc('tax_invoice', 40413, '2026-09-15')]),
    ).toEqual([
      { doc_type: 'combined', label: 'חשבונית מס/קבלה', number: 70002, date: '2025-02-01', count: 1 },
      { doc_type: 'tax_invoice', label: 'חשבונית מס', number: 40413, date: '2026-09-15', count: 2 },
    ]);
  });

  it('shows the amount the document is about, a credit as negative', () => {
    expect(documentAmount({ doc_type: 'tax_invoice', invoice_total: '1180.00', receipt_total: '0.00', credit_total: '0.00' })).toBe(1180);
    expect(documentAmount({ doc_type: 'receipt', invoice_total: '0.00', receipt_total: '500.00', credit_total: '0.00' })).toBe(500);
    expect(documentAmount({ doc_type: 'combined', invoice_total: '0.00', receipt_total: '236.00', credit_total: '0.00' })).toBe(236);
    expect(documentAmount({ doc_type: 'credit_invoice', invoice_total: '0.00', receipt_total: '0.00', credit_total: '500.00' })).toBe(-500);
  });

  it('formats dates the Israeli way', () => {
    expect(formatLegacyDate('2025-03-01')).toBe('01/03/2025');
    expect(formatLegacyDate(null)).toBe('—');
  });
});

describe('commitConfirmText', () => {
  const summary = {
    documents: { total: 7979 },
    customers: { business_create: 110, business_update: 2, parents: 1925 },
    locations: [location({ documents: 40, business_customers: 0 })],
  } as unknown as LegacySummary;

  it('says what will be written, and that parents are left out by default', () => {
    const text = commitConfirmText(summary, false, {});
    expect(text).toContain('110 חדשים');
    expect(text).toContain('הורים משלמי מנוי לא ייפתחו');
    expect(text).toContain('40 מסמכים ממיקומים ללא שיוך');
    expect(text).toContain('לא ישכפל');
  });

  it('says so when parents are included', () => {
    expect(commitConfirmText(summary, true, {})).toMatch(/1,925 ייפתחו|1925 ייפתחו/);
  });

  it('cards only: says whether the cards come in filed or clean', () => {
    const clean = commitConfirmText(summary, false, {}, true, false);
    expect(clean).toContain('הכרטיסים ייכנסו בלי מיקום');
    const filed = commitConfirmText(
      summary, false, { 'כפר סבא': { business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' } }, true, false,
    );
    expect(filed).toContain('ישויכו לעסק ולסניף לפי טבלת המיקומים (1 מתוך 1');
    expect(filed).not.toContain('בלי מיקום');
  });

  it('sends no mapping when the cards come in unfiled, and the table otherwise', () => {
    const table = { 'כפר סבא': { business_id: 'lessons', category_id: 'branches', branch_id: 'zamir' } };
    expect(filesLocations('cards', false)).toBe(false);
    expect(mappingToSend(table, 'cards', false)).toEqual({});
    expect(mappingToSend(table, 'cards', true)).toBe(table);
    // With documents each one needs its location: the table always applies.
    expect(mappingToSend(table, 'all', false)).toBe(table);
    expect(mappingToSend(table, 'history', false)).toBe(table);
  });

  it('cards only: says which cards open, and that no document is kept', () => {
    const text = commitConfirmText(summary, false, {}, true, false);
    expect(text).toContain('ייפתחו כרטיסי לקוחות בלבד מהתוכנה הקודמת: 110 חדשים, 2 קיימים יעודכנו');
    expect(text).toContain('אף מסמך לא יישמר, והמספור של קוגו לא מושפע');
    expect(text).toContain('הורים משלמי מנוי לא ייפתחו');
    // Nothing about documents that will not be written.
    expect(text).not.toContain('יישמרו כהיסטוריה');
    expect(text).not.toContain('ממיקומים ללא שיוך');
  });
});

describe('what an import writes', () => {
  it('is cards only, cards and history, or history only', () => {
    expect(LEGACY_IMPORT_SCOPES.map((s) => s.value)).toEqual(['cards', 'all', 'history']);
    expect(scopeFlags('cards')).toEqual({ createCustomers: true, importDocuments: false });
    expect(scopeFlags('all')).toEqual({ createCustomers: true, importDocuments: true });
    expect(scopeFlags('history')).toEqual({ createCustomers: false, importDocuments: true });
  });

  it('is not sent as cards only to a server that would keep the documents anyway', async () => {
    expect(scopeProblem('cards', false)).toContain('הייבוא לא נשלח');
    expect(scopeProblem('cards', true)).toBeNull();
    expect(scopeProblem('all', false)).toBeNull();
    expect(scopeProblem('history', false)).toBeNull();
    // An older server's answer has no such field: read as "does not".
    api.get.mockResolvedValueOnce({ data: { sources: [], fields: [] } });
    expect((await fetchLegacySources()).cardsOnly).toBe(false);
    api.get.mockResolvedValueOnce({ data: { sources: [], fields: [], cards_only: true } });
    expect((await fetchLegacySources()).cardsOnly).toBe(true);
  });

  it('tells the server to keep no document only for cards only', async () => {
    api.post.mockResolvedValue({ data: { customers: {}, documents: {} } });
    await commitLegacyImport('imp-1', {}, false, true, false);
    expect(api.post).toHaveBeenLastCalledWith(
      '/legacy-import/imp-1/commit/',
      { mapping: {}, include_subscription_parents: false, import_documents: false },
      expect.anything(),
    );
    await commitLegacyImport('imp-1', {}, false, true, true);
    expect(api.post).toHaveBeenLastCalledWith(
      '/legacy-import/imp-1/commit/',
      { mapping: {}, include_subscription_parents: false },
      expect.anything(),
    );
  });
});

describe('requests', () => {
  it('commits with the mapping stripped of empty rows', async () => {
    api.post.mockResolvedValue({ data: { customers: {}, documents: {} } });
    await commitLegacyImport('imp-1', { a: { business_id: null, category_id: null, branch_id: null } }, true);
    expect(api.post).toHaveBeenCalledWith(
      '/legacy-import/imp-1/commit/',
      { mapping: {}, include_subscription_parents: true },
      expect.objectContaining({ timeout: 280000 }),
    );
  });

  it('reads a customer’s documents', async () => {
    api.get.mockResolvedValue({ data: { count: 1, truncated: false, results: [{ id: 'd1' }] } });
    const res = await fetchLegacyDocuments({ business_customer: 'bc-1' });
    expect(api.get).toHaveBeenCalledWith('/legacy-import/documents/', { params: { business_customer: 'bc-1' } });
    expect(res).toEqual({ count: 1, truncated: false, results: [{ id: 'd1' }] });
  });
});
