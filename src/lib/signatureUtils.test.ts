/**
 * The signature history's rules: the labels, the three consents, the list
 * query, the file name of a PDF, what the server's answer is read as, and
 * what an empty list says.
 */
import { describe, expect, it } from 'vitest';
import type { SignatureSummary } from '@/types/signature';
import {
  FAMILY_SIGNATURES_EMPTY,
  applySignatureFilterChange,
  consentRows,
  countSignatureFilters,
  defaultSignatureFilters,
  formatDay,
  formatSignedAt,
  formatSignedDate,
  formatSignedTime,
  readSignatureDetail,
  readSignaturesPage,
  safeSignatureImage,
  signatureChildrenLabel,
  signatureKindLabel,
  signatureListParams,
  signaturePageCount,
  signaturePageSpan,
  signatureParagraphs,
  signaturePdfError,
  signaturePdfFilename,
  signatureRangeLabel,
  signatureTitle,
  signaturesEmptyState,
  signedDayISO,
  type SignatureFilters,
} from './signatureUtils';

function summary(overrides: Partial<SignatureSummary> = {}): SignatureSummary {
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    kind: 'registration_terms',
    kind_label: 'תקנון הרשמה',
    signed_at: '2026-09-11T14:05:00+03:00',
    signer_name: 'רותי ניסן',
    signer_id_number: '123456782',
    family_id: 'fam-1',
    family_name: 'ניסן',
    children: [{ id: 'child-1', full_name: 'נועה ניסן' }],
    branch_name: 'רמת גן',
    document_title: 'תקנון והרשמה לחוגים 2026-27',
    document_sha256: 'ab'.repeat(32),
    consents: { health: true, terms: true, computerized_documents: true },
    pdf_url: '/signatures/a1b2c3d4-0000-4000-8000-000000000001/pdf/',
    ...overrides,
  };
}

describe('labels', () => {
  it('takes the server’s label for the kind, and its own when the server sends none', () => {
    expect(signatureKindLabel({ kind: 'rental_contract', kind_label: 'חוזה שכירות לסטודיו' })).toBe('חוזה שכירות לסטודיו');
    expect(signatureKindLabel({ kind: 'registration_terms', kind_label: '' })).toBe('תקנון הרשמה');
    expect(signatureKindLabel({ kind: 'rental_contract', kind_label: '  ' })).toBe('חוזה שכירות');
  });

  it('still names a kind this build does not know', () => {
    expect(signatureKindLabel({ kind: 'waiver', kind_label: '' })).toBe('חתימה');
  });

  it('calls a document by its title, else by its kind', () => {
    expect(signatureTitle(summary())).toBe('תקנון והרשמה לחוגים 2026-27');
    expect(signatureTitle(summary({ document_title: '' }))).toBe('תקנון הרשמה');
  });

  it('lists the children a signature covered, and says so when it covered none', () => {
    expect(signatureChildrenLabel([
      { id: '1', full_name: 'נועה ניסן' },
      { id: '2', full_name: 'יואב ניסן' },
    ])).toBe('נועה ניסן, יואב ניסן');
    expect(signatureChildrenLabel([{ id: '3', full_name: '  ' }])).toBe('—');
    expect(signatureChildrenLabel([])).toBe('—');
    expect(signatureChildrenLabel(undefined)).toBe('—');
  });
});

describe('when it was signed', () => {
  it('reads the moment on Israel’s clock, whatever the browser’s zone', () => {
    expect(formatSignedAt('2026-09-11T14:05:00+03:00')).toBe('11.09.2026 · 14:05');
    // 22:30 UTC is already past midnight in Israel: the day is the next one.
    expect(formatSignedAt('2026-09-10T22:30:00Z')).toBe('11.09.2026 · 01:30');
    expect(formatSignedDate('2026-09-10T22:30:00Z')).toBe('11.09.2026');
    expect(formatSignedTime('2026-09-10T22:30:00Z')).toBe('01:30');
    expect(signedDayISO('2026-09-10T22:30:00Z')).toBe('2026-09-11');
  });

  it('knows winter time too', () => {
    expect(formatSignedAt('2026-12-01T08:00:00Z')).toBe('01.12.2026 · 10:00');
  });

  it('shows nothing rather than "Invalid Date"', () => {
    expect(formatSignedAt('')).toBe('');
    expect(formatSignedAt('not a date')).toBe('');
    expect(signedDayISO(null)).toBe('');
  });

  it('writes a day the way the invoices page does', () => {
    expect(formatDay('2026-09-01')).toBe('1.9.2026');
    expect(formatDay('2026-12-25')).toBe('25.12.2026');
  });

  it('writes the range, with either end left open', () => {
    expect(signatureRangeLabel('2026-08-12', '2026-09-11')).toBe('12.8.2026 — 11.9.2026');
    expect(signatureRangeLabel('2026-08-12', '')).toBe('מ־12.8.2026');
    expect(signatureRangeLabel('', '2026-09-11')).toBe('עד 11.9.2026');
    expect(signatureRangeLabel('', '')).toBe('כל התאריכים');
  });
});

describe('consentRows', () => {
  it('always gives the three consents in the same order', () => {
    expect(consentRows({ health: true, terms: true, computerized_documents: true }).map((row) => row.label))
      .toEqual(['הצהרת בריאות', 'תקנון', 'מסמכים ממוחשבים']);
  });

  it('marks ✓ for given and ✗ for not given', () => {
    const rows = consentRows({ health: true, terms: false, computerized_documents: true });
    expect(rows.map((row) => row.mark)).toEqual(['✓', '✗', '✓']);
    expect(rows[1]).toMatchObject({ key: 'terms', state: 'refused', description: 'תקנון: לא אושר' });
  });

  it('never turns a question the document did not ask into a ✗', () => {
    // A rental contract has no health declaration.
    const rows = consentRows({ terms: true });
    expect(rows.map((row) => row.state)).toEqual(['absent', 'given', 'absent']);
    expect(rows[0]).toMatchObject({ mark: '—', description: 'הצהרת בריאות: לא נכלל במסמך' });
    expect(consentRows(null).every((row) => row.mark === '—')).toBe(true);
    expect(consentRows(undefined).every((row) => row.mark === '—')).toBe(true);
  });

  it('counts only a real boolean', () => {
    const loose = { health: 'true', terms: 1 } as unknown as Parameters<typeof consentRows>[0];
    expect(consentRows(loose).map((row) => row.mark)).toEqual(['—', '—', '—']);
  });
});

describe('the signed text and the image', () => {
  it('keeps the paragraphs as plain text, trimmed, without empties', () => {
    expect(signatureParagraphs(['  סעיף 1 ', '', 'סעיף 2'])).toEqual(['סעיף 1', 'סעיף 2']);
  });

  it('leaves markup as the literal text it is — it is never rendered as HTML', () => {
    expect(signatureParagraphs(['<b>מודגש</b> <img src=x onerror=alert(1)>']))
      .toEqual(['<b>מודגש</b> <img src=x onerror=alert(1)>']);
  });

  it('drops what is not a string, and reads a single string as blank-line paragraphs', () => {
    expect(signatureParagraphs(['א', 5, null, { text: 'ב' }])).toEqual(['א']);
    expect(signatureParagraphs('א\n\nב\nג')).toEqual(['א', 'ב\nג']);
    expect(signatureParagraphs(null)).toEqual([]);
  });

  it('shows only a picture carried in a data URL', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    expect(safeSignatureImage(png)).toBe(png);
    expect(safeSignatureImage('data:image/jpeg;base64,/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ');
    expect(safeSignatureImage('https://example.com/signature.png')).toBeNull();
    expect(safeSignatureImage('javascript:alert(1)')).toBeNull();
    expect(safeSignatureImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
    expect(safeSignatureImage('data:text/html;base64,PGgxPg==')).toBeNull();
    expect(safeSignatureImage('')).toBeNull();
    expect(safeSignatureImage(undefined)).toBeNull();
  });
});

describe('signatureListParams', () => {
  it('sends what is set, trimmed, and nothing that is not', () => {
    expect(signatureListParams({ family: ' fam-1 ', kind: '', branch: undefined, search: '  כהן ' }, 2))
      .toEqual({ page: 2, family: 'fam-1', search: 'כהן' });
  });

  it('asks for page one by default, and never a page below it', () => {
    expect(signatureListParams({})).toEqual({ page: 1 });
    expect(signatureListParams({}, 0)).toEqual({ page: 1 });
    expect(signatureListParams({}, Number.NaN)).toEqual({ page: 1 });
    expect(signatureListParams({}, 3.7)).toEqual({ page: 3 });
  });

  it('names the dates the way the contract does, and swaps a range given backwards', () => {
    expect(signatureListParams({ dateFrom: '2026-08-12', dateTo: '2026-09-11' }))
      .toEqual({ page: 1, date_from: '2026-08-12', date_to: '2026-09-11' });
    expect(signatureListParams({ dateFrom: '2026-09-30', dateTo: '2026-09-01' }))
      .toEqual({ page: 1, date_from: '2026-09-01', date_to: '2026-09-30' });
  });

  it('leaves out a date it cannot read rather than send it', () => {
    expect(signatureListParams({ dateFrom: '11/09/2026', dateTo: '2026-09-11' }))
      .toEqual({ page: 1, date_to: '2026-09-11' });
  });

  it('passes every filter of the contract', () => {
    expect(signatureListParams({
      family: 'f', child: 'c', kind: 'registration_terms', branch: 'b', search: 's',
      dateFrom: '2026-09-01', dateTo: '2026-09-02',
    }, 4)).toEqual({
      page: 4, family: 'f', child: 'c', kind: 'registration_terms', branch: 'b', search: 's',
      date_from: '2026-09-01', date_to: '2026-09-02',
    });
  });
});

describe('the history page’s filters', () => {
  const base: SignatureFilters = {
    search: '', dateFrom: '2026-08-12', dateTo: '2026-09-11', kind: '', branch: '',
  };

  it('opens on the last 30 days', () => {
    expect(defaultSignatureFilters(new Date(2026, 8, 11, 10, 0))).toEqual(base);
  });

  it('keeps the range the right way round: the end just moved takes the other along', () => {
    expect(applySignatureFilterChange(base, { dateFrom: '2026-09-20' }))
      .toMatchObject({ dateFrom: '2026-09-20', dateTo: '2026-09-20' });
    expect(applySignatureFilterChange(base, { dateTo: '2026-08-01' }))
      .toMatchObject({ dateFrom: '2026-08-01', dateTo: '2026-08-01' });
    expect(applySignatureFilterChange(base, { dateFrom: '2026-09-30', dateTo: '2026-09-01' }))
      .toMatchObject({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  });

  it('lets an end be cleared', () => {
    expect(applySignatureFilterChange(base, { dateFrom: '' })).toMatchObject({ dateFrom: '', dateTo: '2026-09-11' });
  });

  it('counts the narrowing fields, not the dates, and not a search of spaces', () => {
    expect(countSignatureFilters(base)).toBe(0);
    expect(countSignatureFilters({ ...base, search: '   ', branch: 'b' })).toBe(1);
    expect(countSignatureFilters({ ...base, search: 'כהן', kind: 'rental_contract', branch: 'b' })).toBe(3);
  });
});

describe('pages', () => {
  it('has at least one page, 50 rows each', () => {
    expect(signaturePageCount(0)).toBe(1);
    expect(signaturePageCount(50)).toBe(1);
    expect(signaturePageCount(51)).toBe(2);
    expect(signaturePageCount(Number.NaN)).toBe(1);
  });

  it('says which rows of the whole list a page holds', () => {
    expect(signaturePageSpan(1, 50)).toBe('1–50');
    expect(signaturePageSpan(2, 50)).toBe('51–100');
    expect(signaturePageSpan(3, 7)).toBe('101–107');
    expect(signaturePageSpan(1, 1)).toBe('1');
    expect(signaturePageSpan(1, 0)).toBe('0');
  });
});

describe('reading the server', () => {
  it('reads a DRF page', () => {
    const page = readSignaturesPage({
      count: 132,
      next: 'https://api.example/api/v1/signatures/?page=2',
      previous: null,
      results: [summary()],
    });
    expect(page.count).toBe(132);
    expect(page.next).toContain('page=2');
    expect(page.results).toHaveLength(1);
    expect(page.results[0].children).toEqual([{ id: 'child-1', full_name: 'נועה ניסן' }]);
  });

  it('reads a bare list, and survives an answer it does not recognise', () => {
    expect(readSignaturesPage([summary(), summary({ id: 'x' })]).count).toBe(2);
    expect(readSignaturesPage(null)).toEqual({ count: 0, next: null, previous: null, results: [] });
    expect(readSignaturesPage({ results: 'nope' })).toEqual({ count: 0, next: null, previous: null, results: [] });
  });

  it('makes the children and the consents safe to iterate when a row lacks them', () => {
    const [row] = readSignaturesPage({ count: 1, results: [{ id: 's1', kind: 'rental_contract' }] }).results;
    expect(row.children).toEqual([]);
    expect(row.consents).toEqual({});
    expect(row.family_id).toBeNull();
    expect(row.signer_name).toBe('');
  });

  it('reads the detail: the text as paragraphs, and the rest as sent', () => {
    const detail = readSignatureDetail({
      ...summary(),
      document_text: ['סעיף 1', '', 'סעיף 2'],
      signature_image: 'data:image/png;base64,AAAA',
      ip_address: '192.0.2.10',
      user_agent: 'Mozilla/5.0',
      refs: { registration_id: 'r1' },
    });
    expect(detail.document_text).toEqual(['סעיף 1', 'סעיף 2']);
    expect(detail.ip_address).toBe('192.0.2.10');
    expect(detail.refs).toEqual({ registration_id: 'r1' });
    expect(readSignatureDetail({ id: 's1' })).toMatchObject({ document_text: [], ip_address: null, refs: null });
  });
});

describe('signaturePdfFilename', () => {
  it('names the file by what was signed, who signed it and the day', () => {
    expect(signaturePdfFilename(summary())).toBe('תקנון הרשמה - רותי ניסן - 2026-09-11.pdf');
  });

  it('takes the day on Israel’s clock', () => {
    expect(signaturePdfFilename(summary({ signed_at: '2026-09-10T22:30:00Z' })))
      .toBe('תקנון הרשמה - רותי ניסן - 2026-09-11.pdf');
  });

  it('replaces what a file system refuses', () => {
    const name = signaturePdfFilename(summary({ signer_name: 'רותי/ניסן: "אמא"' }));
    expect(name).toBe('תקנון הרשמה - רותי-ניסן- -אמא - 2026-09-11.pdf');
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('tells two unnamed signatures of one day apart by their id', () => {
    expect(signaturePdfFilename(summary({ signer_name: '', kind: 'rental_contract', kind_label: '' })))
      .toBe('חוזה שכירות - 2026-09-11 - a1b2c3d4.pdf');
  });

  it('always gives a name', () => {
    expect(signaturePdfFilename({ id: '', kind: '', kind_label: '', signer_name: '', signed_at: '' })).toBe('חתימה.pdf');
  });
});

describe('signaturePdfError', () => {
  it('says what went wrong when it knows', () => {
    expect(signaturePdfError({ response: { status: 404 } })).toBe('קובץ ה־PDF של החתימה לא נמצא');
    expect(signaturePdfError({ response: { status: 403 } })).toBe('אין הרשאה להוריד את החתימה');
    expect(signaturePdfError(new Error('Network Error'))).toBe('הורדת ה־PDF נכשלה');
    expect(signaturePdfError(null)).toBe('הורדת ה־PDF נכשלה');
  });
});

describe('empty states', () => {
  it('the customer card says nothing was kept, and since when signatures are', () => {
    expect(FAMILY_SIGNATURES_EMPTY).toBe('לא נשמרה חתימה — חתימות נשמרות מהרשמות מ־11.9.2026 ואילך');
  });

  it('a narrowed list says the narrowing hid it, and offers to clear it', () => {
    const copy = signaturesEmptyState({ dateFrom: '2026-08-12', dateTo: '2026-09-11', narrowed: true });
    expect(copy.title).toBe('אף חתימה לא מתאימה לסינון');
    expect(copy.text).toContain('בין 12.8.2026 ל־11.9.2026');
    expect(copy.offerClear).toBe(true);
  });

  it('a range that ends before signatures were kept says that is why', () => {
    const copy = signaturesEmptyState({ dateFrom: '2026-06-01', dateTo: '2026-09-10', narrowed: false });
    expect(copy.title).toBe('אין חתימות בטווח הזה');
    expect(copy.text).toContain('מסתיים לפני כן');
    expect(copy.offerClear).toBe(false);
  });

  it('otherwise the range simply had none', () => {
    const copy = signaturesEmptyState({ dateFrom: '2026-08-12', dateTo: '2026-09-11', narrowed: false });
    expect(copy.text).toBe('בין 12.8.2026 ל־11.9.2026 לא נשמרה אף חתימה. חתימות נשמרות מהרשמות מ־11.9.2026 ואילך.');
  });

  it('speaks of the chosen range when an end is open', () => {
    expect(signaturesEmptyState({ dateFrom: '', dateTo: '', narrowed: false }).text)
      .toBe('בטווח שנבחר לא נשמרה אף חתימה. חתימות נשמרות מהרשמות מ־11.9.2026 ואילך.');
  });
});
