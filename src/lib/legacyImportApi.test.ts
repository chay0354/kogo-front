/**
 * What the import screens compute, and what they send. The axios instance is
 * mocked, so nothing here reaches a server. Every name is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./api', () => ({ default: api }));

import {
  LEGACY_IMPORT_MAX_BYTES,
  applyMappingChange,
  branchAllowed,
  categoriesFor,
  commitConfirmText,
  commitLegacyImport,
  documentAmount,
  fetchLegacyDocuments,
  formatLegacyDate,
  importFileProblem,
  initialMapping,
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
    expect(importFileProblem({ name: 'export.xls', size: LEGACY_IMPORT_MAX_BYTES + 1 })).toContain('גדול מדי');
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
});

describe('requests', () => {
  it('commits with the mapping stripped of empty rows', async () => {
    api.post.mockResolvedValue({ data: { customers: {}, documents: {} } });
    await commitLegacyImport('imp-1', { a: { business_id: null, category_id: null, branch_id: null } }, true);
    expect(api.post).toHaveBeenCalledWith(
      '/legacy-import/imp-1/commit/',
      { mapping: {}, include_subscription_parents: true },
      expect.objectContaining({ timeout: 120000 }),
    );
  });

  it('reads a customer’s documents', async () => {
    api.get.mockResolvedValue({ data: { count: 1, truncated: false, results: [{ id: 'd1' }] } });
    const res = await fetchLegacyDocuments({ business_customer: 'bc-1' });
    expect(api.get).toHaveBeenCalledWith('/legacy-import/documents/', { params: { business_customer: 'bc-1' } });
    expect(res).toEqual({ count: 1, truncated: false, results: [{ id: 'd1' }] });
  });
});
