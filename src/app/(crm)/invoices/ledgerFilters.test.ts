/**
 * The shared filter model of the invoices page — which rows a choice keeps and
 * how the cascade stays coherent however a change arrives — and the documents
 * tab's order, search and actions that rest on it.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentRow, LedgerFilters } from './types';
import {
  applyLedgerFilterChange,
  canSendDocumentReminder,
  compareDocumentsNewestFirst,
  countActiveLedgerFilters,
  isWithinRange,
  ledgerRowOptions,
  matchesDocumentSearch,
  matchesLedgerFilters,
  shiftISODate,
  widerRange,
  withBranchCity,
  withSelectedOption,
} from './utils';

function filters(overrides: Partial<LedgerFilters> = {}): LedgerFilters {
  return {
    dateFrom: '2026-08-12',
    dateTo: '2026-09-11',
    business: '',
    cityId: '',
    branchId: '',
    courseTypeId: '',
    ageKey: '',
    instructorId: '',
    search: '',
    ...overrides,
  };
}

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

describe('matchesLedgerFilters — עסק', () => {
  const subscription = row({ origin: 'subscription', branch_id: 'branch-1' });
  const manual = row({ origin: 'manual' });
  const website = row({ origin: 'store_website', website_order_number: 'CG-260830-ABCD' });
  const counter = row({ origin: 'store_counter', branch_id: 'branch-1' });
  const tagged = row({ origin: 'manual', business_id: 'biz-1', business_name: 'הפקות' });
  const all = [subscription, manual, website, counter, tagged];
  const kept = (chosen: LedgerFilters) => all.filter((r) => matchesLedgerFilters(r, chosen));

  it('passes every row when nothing is chosen', () => {
    expect(kept(filters())).toEqual(all);
  });

  it('סניפים keeps what the branches earned themselves — no store sale, no business', () => {
    expect(kept(filters({ business: 'branches' }))).toEqual([subscription, manual]);
  });

  it('counts a row that has not sent business_id yet as the branches own', () => {
    expect(matchesLedgerFilters(row({ origin: 'subscription' }), filters({ business: 'branches' }))).toBe(true);
    expect(matchesLedgerFilters(row({ origin: 'subscription', business_id: null }), filters({ business: 'branches' }))).toBe(true);
  });

  it('חנות keeps every store sale, website and counter alike', () => {
    expect(kept(filters({ business: 'store' }))).toEqual([website, counter]);
  });

  it('a row with no origin is not a store sale', () => {
    expect(matchesLedgerFilters(row(), filters({ business: 'store' }))).toBe(false);
  });

  it('a business keeps only the rows tagged to it', () => {
    expect(kept(filters({ business: 'biz-1' }))).toEqual([tagged]);
    expect(kept(filters({ business: 'biz-2' }))).toEqual([]);
  });
});

describe('matchesLedgerFilters — עיר, סניף, סוג חוג, גיל, מדריך', () => {
  const full = row({
    city_id: 'city-1',
    branch_id: 'branch-1',
    course_type_id: 'type-1',
    age_key: '7',
    instructor_id: 'inst-1',
  });

  it('matches each dimension exactly', () => {
    expect(matchesLedgerFilters(full, filters({ cityId: 'city-1' }))).toBe(true);
    expect(matchesLedgerFilters(full, filters({ cityId: 'city-2' }))).toBe(false);
    expect(matchesLedgerFilters(full, filters({ branchId: 'branch-1' }))).toBe(true);
    expect(matchesLedgerFilters(full, filters({ branchId: 'branch-2' }))).toBe(false);
    expect(matchesLedgerFilters(full, filters({ courseTypeId: 'type-1' }))).toBe(true);
    expect(matchesLedgerFilters(full, filters({ courseTypeId: 'type-2' }))).toBe(false);
    expect(matchesLedgerFilters(full, filters({ ageKey: '7' }))).toBe(true);
    expect(matchesLedgerFilters(full, filters({ ageKey: '8' }))).toBe(false);
    expect(matchesLedgerFilters(full, filters({ instructorId: 'inst-1' }))).toBe(true);
    expect(matchesLedgerFilters(full, filters({ instructorId: 'inst-2' }))).toBe(false);
  });

  it('requires every chosen dimension at once', () => {
    const chosen = filters({ business: 'branches', cityId: 'city-1', branchId: 'branch-1', instructorId: 'inst-1' });
    expect(matchesLedgerFilters(full, chosen)).toBe(true);
    expect(matchesLedgerFilters(full, { ...chosen, ageKey: '9' })).toBe(false);
  });

  it('a row that does not carry a dimension does not pass a filter on it', () => {
    const bare = row();
    expect(matchesLedgerFilters(bare, filters({ cityId: 'city-1' }))).toBe(false);
    expect(matchesLedgerFilters(bare, filters({ branchId: 'branch-1' }))).toBe(false);
    expect(matchesLedgerFilters(bare, filters({ courseTypeId: 'type-1' }))).toBe(false);
    expect(matchesLedgerFilters(bare, filters({ ageKey: '7' }))).toBe(false);
    expect(matchesLedgerFilters(bare, filters({ instructorId: 'inst-1' }))).toBe(false);
    expect(matchesLedgerFilters(row({ city_id: null }), filters({ cityId: 'city-1' }))).toBe(false);
  });

  it('but still passes while that filter is not set', () => {
    expect(matchesLedgerFilters(row(), filters())).toBe(true);
  });

  it('compares ids as text, so a number from the server still matches', () => {
    const numeric = row({ age_key: 7 as unknown as string });
    expect(matchesLedgerFilters(numeric, filters({ ageKey: '7' }))).toBe(true);
  });
});

describe('applyLedgerFilterChange', () => {
  const inBranch = filters({ business: 'branches', cityId: 'city-1', branchId: 'branch-1' });

  it('leaving סניפים clears the city and the branch', () => {
    expect(applyLedgerFilterChange(inBranch, { business: 'store' }))
      .toMatchObject({ business: 'store', cityId: '', branchId: '' });
    expect(applyLedgerFilterChange(inBranch, { business: '' }))
      .toMatchObject({ business: '', cityId: '', branchId: '' });
  });

  it('keeps the place while סניפים stays', () => {
    expect(applyLedgerFilterChange(inBranch, { search: 'דנה' }))
      .toMatchObject({ business: 'branches', cityId: 'city-1', branchId: 'branch-1', search: 'דנה' });
  });

  it('choosing a city or a branch means סניפים', () => {
    expect(applyLedgerFilterChange(filters(), { branchId: 'branch-1' }))
      .toMatchObject({ business: 'branches', branchId: 'branch-1' });
    expect(applyLedgerFilterChange(filters({ business: 'store' }), { cityId: 'city-1' }))
      .toMatchObject({ business: 'branches', cityId: 'city-1' });
  });

  it('clearing the branch leaves סניפים and the city as they were', () => {
    expect(applyLedgerFilterChange(inBranch, { branchId: '' }))
      .toMatchObject({ business: 'branches', cityId: 'city-1', branchId: '' });
  });

  it('moving the start past the end takes the end along', () => {
    expect(applyLedgerFilterChange(filters(), { dateFrom: '2026-09-20' }))
      .toMatchObject({ dateFrom: '2026-09-20', dateTo: '2026-09-20' });
  });

  it('moving the end before the start takes the start along', () => {
    expect(applyLedgerFilterChange(filters(), { dateTo: '2026-08-01' }))
      .toMatchObject({ dateFrom: '2026-08-01', dateTo: '2026-08-01' });
  });

  it('swaps a change that sets both ends the wrong way round', () => {
    expect(applyLedgerFilterChange(filters(), { dateFrom: '2026-09-30', dateTo: '2026-09-01' }))
      .toMatchObject({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  });

  it('lets an end be emptied', () => {
    expect(applyLedgerFilterChange(filters(), { dateFrom: '' }))
      .toMatchObject({ dateFrom: '', dateTo: '2026-09-11' });
  });

  it('ignores a key passed as undefined', () => {
    const before = filters({ search: 'דנה' });
    expect(applyLedgerFilterChange(before, { search: undefined })).toEqual(before);
  });

  it('leaves the state it was given untouched', () => {
    const before = filters();
    applyLedgerFilterChange(before, { business: 'store', search: 'x' });
    expect(before).toEqual(filters());
  });
});

describe('countActiveLedgerFilters', () => {
  it('counts what narrows the rows, not the dates', () => {
    expect(countActiveLedgerFilters(filters())).toBe(0);
    expect(countActiveLedgerFilters(filters({ dateFrom: '2025-01-01' }))).toBe(0);
    expect(countActiveLedgerFilters(filters({ business: 'branches', branchId: 'branch-1', instructorId: 'inst-1' })))
      .toBe(3);
  });

  it('does not count a search of blanks', () => {
    expect(countActiveLedgerFilters(filters({ search: '   ' }))).toBe(0);
    expect(countActiveLedgerFilters(filters({ search: ' דנה ' }))).toBe(1);
  });
});

describe('ledgerRowOptions', () => {
  it('offers each value once, sorted by name', () => {
    const rows = [
      row({ instructor_id: 'inst-2', instructor_name: 'שירה' }),
      row({ instructor_id: 'inst-1', instructor_name: 'אבי' }),
      row({ instructor_id: 'inst-2', instructor_name: 'שירה' }),
      row(),
    ];
    expect(ledgerRowOptions(rows, 'instructorId')).toEqual([
      { value: 'inst-1', label: 'אבי' },
      { value: 'inst-2', label: 'שירה' },
    ]);
  });

  it('leaves out a value that has no name rather than show a bare id', () => {
    const rows = [row({ course_type_id: 'type-9' }), row({ course_type_id: 'type-1', course_type_name: 'בלט' })];
    expect(ledgerRowOptions(rows, 'courseTypeId')).toEqual([{ value: 'type-1', label: 'בלט' }]);
  });

  it('takes the name from whichever row has it', () => {
    const rows = [row({ course_type_id: 'type-1' }), row({ course_type_id: 'type-1', course_type_name: 'בלט' })];
    expect(ledgerRowOptions(rows, 'courseTypeId')).toEqual([{ value: 'type-1', label: 'בלט' }]);
  });

  it('orders age groups as ages, and lets a key stand in for a missing label', () => {
    const rows = [
      row({ age_key: '10', age_label: 'גילאי 10' }),
      row({ age_key: '9', age_label: 'גילאי 9' }),
      row({ age_key: '3' }),
    ];
    const options = ledgerRowOptions(rows, 'ageKey');
    expect(options.map((option) => option.value)).toEqual(['3', '9', '10']);
    expect(options[0]).toEqual({ value: '3', label: '3' });
  });

  it('offers nothing while the rows carry no such field', () => {
    expect(ledgerRowOptions([row(), row()], 'instructorId')).toEqual([]);
  });
});

describe('withSelectedOption', () => {
  const options = [{ value: 'a', label: 'א' }];

  it('keeps a chosen value the options no longer hold, so the filter stays visible', () => {
    expect(withSelectedOption(options, 'b', 'ב (אין בטווח)'))
      .toEqual([...options, { value: 'b', label: 'ב (אין בטווח)' }]);
  });

  it('adds nothing when the value is there or nothing is chosen', () => {
    expect(withSelectedOption(options, 'a', 'x')).toEqual(options);
    expect(withSelectedOption(options, '', 'x')).toEqual(options);
  });
});

describe('withBranchCity', () => {
  const cities = new Map([['branch-1', 'city-1']]);

  it('places a row in its branch city until the row says so itself', () => {
    expect(withBranchCity(row({ branch_id: 'branch-1' }), cities).city_id).toBe('city-1');
  });

  it('keeps a city the row sent, even an empty one', () => {
    expect(withBranchCity(row({ branch_id: 'branch-1', city_id: 'city-9' }), cities).city_id).toBe('city-9');
    expect(withBranchCity(row({ branch_id: 'branch-1', city_id: null }), cities).city_id).toBeNull();
  });

  it('leaves a row alone when its branch is not known', () => {
    const website = row({ origin: 'store_website' });
    expect(withBranchCity(website, cities)).toBe(website);
    expect(withBranchCity(row({ branch_id: 'branch-7' }), cities).city_id).toBeUndefined();
  });
});

describe('compareDocumentsNewestFirst', () => {
  const order = (rows: DocumentRow[]) => [...rows].sort(compareDocumentsNewestFirst).map((r) => r.document_number);

  it('puts the newest day first', () => {
    expect(order([
      row({ document_number: 'A', issue_date: '2026-09-01' }),
      row({ document_number: 'B', issue_date: '2026-09-10' }),
      row({ document_number: 'C', issue_date: '2026-08-31' }),
    ])).toEqual(['B', 'A', 'C']);
  });

  it('breaks a same-day tie by document number, highest first, digits as numbers', () => {
    expect(order([
      row({ document_number: '999' }),
      row({ document_number: '1000' }),
      row({ document_number: '1001' }),
    ])).toEqual(['1001', '1000', '999']);
  });

  it('puts a document without a date last', () => {
    expect(order([
      row({ document_number: 'undated', issue_date: '' }),
      row({ document_number: 'dated', issue_date: '2026-01-01' }),
    ])).toEqual(['dated', 'undated']);
  });
});

describe('matchesDocumentSearch', () => {
  const doc = row({
    document_number: 'INV-202609-00012',
    customer_name: 'רותי ניסן',
    website_order_number: 'CG-260830-ABCD',
    branch: 'אם המושבות',
    course_name: 'בלט מתחילות',
    instructor_name: 'שירה לוי',
  });

  it('finds a document by number, customer, website order, branch, course or instructor', () => {
    ['00012', 'רותי', 'cg-260830', 'המושבות', 'בלט', 'שירה'].forEach((query) => {
      expect(matchesDocumentSearch(doc, query)).toBe(true);
    });
    expect(matchesDocumentSearch(doc, 'אין כזה')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesDocumentSearch(doc, '  ')).toBe(true);
  });

  it('does not trip over the fields a row lacks', () => {
    expect(matchesDocumentSearch(row(), 'שירה')).toBe(false);
  });
});

describe('canSendDocumentReminder', () => {
  const open = row({ origin: 'manual', status: 'pending', amount_paid: 0, open_balance: 1180 });

  it('offers a reminder on an open document issued in the CRM', () => {
    expect(canSendDocumentReminder(open)).toBe(true);
  });

  it('not on a subscription invoice or a store sale — the endpoint does not know their ids', () => {
    expect(canSendDocumentReminder({ ...open, origin: 'subscription', id: 'crm-inv-1' })).toBe(false);
    expect(canSendDocumentReminder({ ...open, origin: 'store_counter' })).toBe(false);
  });

  it('not on a draft, a credit note or a settled document', () => {
    expect(canSendDocumentReminder({ ...open, is_draft: true })).toBe(false);
    expect(canSendDocumentReminder({ ...open, document_type_code: 'credit_invoice' })).toBe(false);
    expect(canSendDocumentReminder({ ...open, open_balance: 0 })).toBe(false);
  });
});

describe('the date range', () => {
  it('offers three months, then a year, ending where the range ends', () => {
    expect(widerRange({ dateFrom: '2026-08-12', dateTo: '2026-09-11' }))
      .toEqual({ dateFrom: '2026-06-13', label: 'הרחב לשלושה חודשים' });
    expect(widerRange({ dateFrom: '2026-06-13', dateTo: '2026-09-11' }))
      .toEqual({ dateFrom: '2025-09-11', label: 'הרחב לשנה' });
  });

  it('offers nothing once the range spans a year', () => {
    expect(widerRange({ dateFrom: '2025-09-11', dateTo: '2026-09-11' })).toBeNull();
  });

  it('moves a day across month, year and leap-day boundaries', () => {
    expect(shiftISODate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftISODate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftISODate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('keeps dated rows inside the range, and an undated one visible', () => {
    const range = { dateFrom: '2026-08-12', dateTo: '2026-09-11' };
    expect(isWithinRange('2026-09-11', range)).toBe(true);
    expect(isWithinRange('2026-09-12', range)).toBe(false);
    expect(isWithinRange('2026-08-11T23:00:00Z', range)).toBe(false);
    expect(isWithinRange('', range)).toBe(true);
  });
});
