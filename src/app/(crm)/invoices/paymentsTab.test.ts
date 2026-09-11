/**
 * The payments tab's rules: how the shared filters and the tab's own fields
 * become the ledger query, when the store's purchases are listed instead and
 * which of them a filter keeps, and how a charge reads in its row.
 */
import { describe, expect, it } from 'vitest';
import type { StoreInvoice } from '@/types/store';
import type { LedgerFilters, PaymentRecord } from './types';
import {
  PAYMENT_KIND_OPTIONS,
  chargeCountParams,
  chargeDescription,
  chargeLedgerParams,
  compareChargesNewestFirst,
  courseLine,
  currentMonthWindow,
  isStoreListing,
  knownRefundedCount,
  matchesStoreRow,
  optionRowsFromLists,
  pageCountFor,
  storeFilterConflict,
  toChargeRow,
  toStoreRow,
  type PaymentLedgerRow,
  type PaymentsOwnFilters,
} from './PaymentsTab';
import { ledgerRowOptions } from './utils';

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

function own(overrides: Partial<PaymentsOwnFilters> = {}): PaymentsOwnFilters {
  return { kind: '', status: '', ...overrides };
}

function charge(overrides: Partial<PaymentLedgerRow> = {}): PaymentLedgerRow {
  return {
    id: 'pay-1',
    child_name: 'רותי ניסן',
    family_name: 'ניסן',
    branch: 'branch-1',
    branch_name: 'כפר סבא',
    lesson_name: 'בלט מתחילות',
    payment_type: 'recurring_subscription',
    status: 'completed',
    final_amount: 250,
    registration_fee: 0,
    trial_lesson_date: null,
    description: '',
    payment_date: '2026-09-02T08:00:00Z',
    created_at: '2026-09-02T07:59:00Z',
    tranzila_transaction_id: 'TX-9',
    tranzila_confirmation_code: '0012345',
    business_id: null,
    business_name: '',
    city_id: 'city-1',
    city_name: 'כפר סבא',
    course_id: 'course-1',
    course_name: 'בלט מתחילות',
    course_type_id: 'type-1',
    course_type_name: 'בלט',
    age_key: '6-9',
    age_label: 'גילאי 6–9',
    instructor_id: 'inst-1',
    instructor_name: 'שירה לוי',
    ...overrides,
  };
}

function invoice(overrides: Partial<StoreInvoice> = {}): StoreInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'ST-2026-0044',
    child: null,
    child_name: null,
    customer_name: 'רותי ניסן',
    customer_phone: '0521234567',
    customer_email: 'ruti@example.com',
    shipping_address: 'הרצל 12, כפר סבא',
    customer_notes: '',
    website_order_number: null,
    total_amount: 149,
    amount_paid: 149,
    payment_method: 'credit_card',
    payment_status: 'completed',
    tranzila_transaction_id: 'TX-1',
    tranzila_confirmation_code: '',
    charged_with_token: false,
    branch: null,
    branch_name: null,
    issue_date: '2026-09-01T10:00:00Z',
    notes: '',
    line_items: [],
    created_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function record(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'r-1',
    source: 'store',
    created_at: '2026-09-01T10:00:00Z',
    customer_name: '',
    description: '',
    kind: 'store',
    kind_label: 'חנות',
    invoice_number: '',
    amount: 0,
    payment_method: 'אשראי',
    transaction_reference: '',
    status: 'completed',
    canRefund: false,
    ...overrides,
  };
}

describe('chargeLedgerParams — the filters as the ledger endpoint takes them', () => {
  it('sends only the range while nothing is chosen', () => {
    expect(chargeLedgerParams(filters(), own())).toEqual({ start_date: '2026-08-12', end_date: '2026-09-11' });
  });

  it('sends every shared filter and the tab fields, each under its server name', () => {
    const chosen = filters({
      business: 'branches',
      cityId: 'city-1',
      branchId: 'branch-1',
      courseTypeId: 'type-1',
      ageKey: '6-9',
      instructorId: 'inst-1',
      search: '  רותי ',
    });
    expect(chargeLedgerParams(chosen, own({ kind: 'trial', status: 'pending' }))).toEqual({
      start_date: '2026-08-12',
      end_date: '2026-09-11',
      search: 'רותי',
      status: 'pending',
      kind: 'trial',
      business: 'branches',
      city: 'city-1',
      branch: 'branch-1',
      course_type: 'type-1',
      age: '6-9',
      instructor: 'inst-1',
    });
  });

  it('sends a business id and an open-ended age key as they are', () => {
    expect(chargeLedgerParams(filters({ business: 'biz-7', ageKey: '-9' }), own()))
      .toMatchObject({ business: 'biz-7', age: '-9' });
    expect(chargeLedgerParams(filters({ ageKey: '6-' }), own())).toMatchObject({ age: '6-' });
  });

  it('never sends the store kinds or a blank search — those are not the server’s to answer', () => {
    ['store', 'delivery'].forEach((kind) => {
      expect(chargeLedgerParams(filters(), own({ kind }))).not.toHaveProperty('kind');
    });
    expect(chargeLedgerParams(filters({ search: '   ' }), own())).not.toHaveProperty('search');
  });

  it('asks a count as one row of page one, same filters', () => {
    const params = chargeLedgerParams(filters({ instructorId: 'inst-1' }), own());
    expect(chargeCountParams({ ...params, page: 4, page_size: 20 }))
      .toEqual({ ...params, page: 1, page_size: 1 });
  });
});

describe('isStoreListing', () => {
  it('lists the store under עסק חנות and under סוג חיוב חנות or משלוח מהאתר', () => {
    expect(isStoreListing('store', '')).toBe(true);
    expect(isStoreListing('', 'store')).toBe(true);
    expect(isStoreListing('branches', 'delivery')).toBe(true);
  });

  it('lists the CRM charges otherwise', () => {
    expect(isStoreListing('', '')).toBe(false);
    expect(isStoreListing('branches', 'trial')).toBe(false);
    expect(isStoreListing('biz-1', 'standing_order')).toBe(false);
  });

  it('offers משלוח מהאתר right under חנות', () => {
    expect(PAYMENT_KIND_OPTIONS.map((option) => option.value))
      .toEqual(['standing_order', 'registration', 'trial', 'store', 'delivery', 'one_time']);
  });
});

describe('the figures', () => {
  it('knows the refunded count without asking when a status is chosen', () => {
    expect(knownRefundedCount('', 40)).toBeNull();
    expect(knownRefundedCount('refunded', 40)).toBe(40);
    expect(knownRefundedCount('completed', 40)).toBe(0);
  });

  it('says which days of this month the month total covers', () => {
    expect(currentMonthWindow({ dateFrom: '2026-08-12', dateTo: '2026-09-11' }, '2026-09-11'))
      .toEqual({ from: '2026-09-01', to: '2026-09-11' });
    expect(currentMonthWindow({ dateFrom: '2026-09-05', dateTo: '2026-09-08' }, '2026-09-11'))
      .toEqual({ from: '2026-09-05', to: '2026-09-08' });
    expect(currentMonthWindow({ dateFrom: '2026-09-01', dateTo: '2026-12-31' }, '2026-09-11'))
      .toEqual({ from: '2026-09-01', to: '2026-09-11' });
  });

  it('has no month total to show when the range does not reach this month', () => {
    expect(currentMonthWindow({ dateFrom: '2026-07-01', dateTo: '2026-08-31' }, '2026-09-11')).toBeNull();
  });

  it('counts pages of twenty, one at least', () => {
    expect(pageCountFor(0)).toBe(1);
    expect(pageCountFor(20)).toBe(1);
    expect(pageCountFor(21)).toBe(2);
  });
});

describe('a charge in its row', () => {
  const row = toChargeRow(charge());

  it('keeps what the tab always showed, and the refund rule', () => {
    expect(row).toMatchObject({
      source: 'payment',
      kind: 'standing_order',
      customer_name: 'רותי ניסן',
      amount: 250,
      transaction_reference: 'TX-9',
      branch_id: 'branch-1',
      canRefund: true,
    });
  });

  it('carries the dimensions the server sent', () => {
    expect(row).toMatchObject({
      city_id: 'city-1',
      course_type_id: 'type-1',
      age_key: '6-9',
      instructor_id: 'inst-1',
      business_id: null,
    });
  });

  it('names the class and the instructor under the customer', () => {
    expect(courseLine(row)).toBe('בלט מתחילות · שירה לוי');
    expect(courseLine(toChargeRow(charge({ instructor_name: '' })))).toBe('בלט מתחילות');
  });

  it('describes the charge without repeating the customer and the class shown beside it', () => {
    expect(row.description).toBe('חיוב הוראת קבע · ספטמבר 2026 · בלט מתחילות · רותי ניסן');
    expect(chargeDescription(row)).toBe('חיוב הוראת קבע · ספטמבר 2026');
  });

  it('keeps the class in the description when the row names no course of its own', () => {
    expect(chargeDescription(toChargeRow(charge({ course_name: '' }))))
      .toBe('חיוב הוראת קבע · ספטמבר 2026 · בלט מתחילות');
  });

  it('leaves a store purchase’s description whole', () => {
    const store = toStoreRow(invoice({ line_items: [] }), new Map());
    expect(chargeDescription(store)).toBe(store.description);
  });
});

describe('store purchases', () => {
  const cities = new Map([['branch-1', 'city-1']]);
  const website = toStoreRow(invoice({ id: 'inv-w', website_order_number: 'CG-260830-ABCD' }), cities);
  const counter = toStoreRow(invoice({ id: 'inv-c', branch: 'branch-1', branch_name: 'כפר סבא' }), cities);
  const all = [website, counter];
  const kept = (chosen: LedgerFilters, fields: PaymentsOwnFilters = own()) =>
    all.filter((row) => matchesStoreRow(row, chosen, fields)).map((row) => row.id);

  it('knows a website order from a counter sale, and puts the sale in its branch city', () => {
    expect(website).toMatchObject({ origin: 'store_website', source: 'store' });
    expect(website.city_id).toBeUndefined();
    expect(counter).toMatchObject({ origin: 'store_counter', branch_id: 'branch-1', city_id: 'city-1' });
  });

  it('keeps every purchase under חנות and under כל ההכנסות', () => {
    expect(kept(filters({ business: 'store' }))).toEqual(['inv-w', 'inv-c']);
    expect(kept(filters(), own({ kind: 'store' }))).toEqual(['inv-w', 'inv-c']);
  });

  it('narrows to a branch or a city by the branch the sale was made in', () => {
    expect(kept(filters({ business: 'branches', branchId: 'branch-1' }), own({ kind: 'store' }))).toEqual(['inv-c']);
    expect(kept(filters({ business: 'branches', cityId: 'city-1' }), own({ kind: 'store' }))).toEqual(['inv-c']);
    expect(kept(filters({ business: 'branches', cityId: 'city-2' }), own({ kind: 'store' }))).toEqual([]);
  });

  it('משלוח מהאתר keeps the website orders only', () => {
    expect(kept(filters(), own({ kind: 'delivery' }))).toEqual(['inv-w']);
  });

  it('keeps none under a business, a class filter or a CRM kind — and says why', () => {
    expect(kept(filters({ business: 'biz-1' }))).toEqual([]);
    expect(kept(filters({ business: 'store', instructorId: 'inst-1' }))).toEqual([]);
    expect(kept(filters({ business: 'store' }), own({ kind: 'trial' }))).toEqual([]);
    expect(storeFilterConflict(filters({ business: 'biz-1' }), own())).toMatch(/עסק/);
    expect(storeFilterConflict(filters({ ageKey: '6-9' }), own())).toMatch(/גיל/);
    expect(storeFilterConflict(filters({ business: 'branches', branchId: 'branch-1' }), own({ kind: 'delivery' })))
      .toMatch(/סניף/);
    expect(storeFilterConflict(filters({ business: 'store' }), own({ kind: 'trial' }))).toMatch(/סוג החיוב/);
  });

  it('has nothing to explain when the filters can match a purchase', () => {
    expect(storeFilterConflict(filters({ business: 'store', search: 'רותי' }), own({ status: 'completed' }))).toBe('');
    expect(storeFilterConflict(filters({ business: 'branches', branchId: 'branch-1' }), own({ kind: 'store' }))).toBe('');
  });

  it('matches the status and the search, a phone typed with dashes included', () => {
    const refunded = toStoreRow(invoice({ id: 'inv-r', payment_status: 'refunded' }), cities);
    expect(matchesStoreRow(refunded, filters(), own({ status: 'refunded' }))).toBe(true);
    expect(matchesStoreRow(counter, filters(), own({ status: 'refunded' }))).toBe(false);
    expect(matchesStoreRow(counter, filters({ search: '052-123-4567' }), own())).toBe(true);
    expect(matchesStoreRow(counter, filters({ search: 'אין כזה' }), own())).toBe(false);
  });
});

describe('compareChargesNewestFirst', () => {
  const order = (rows: PaymentRecord[]) => [...rows].sort(compareChargesNewestFirst).map((row) => row.id);

  it('puts the newest charge first, to the minute', () => {
    expect(order([
      record({ id: 'a', created_at: '2026-09-01T10:00:00Z' }),
      record({ id: 'b', created_at: '2026-09-10T08:00:00Z' }),
      record({ id: 'c', created_at: '2026-09-10T09:30:00Z' }),
    ])).toEqual(['c', 'b', 'a']);
  });

  it('breaks a tie by invoice number, highest first, digits as numbers', () => {
    expect(order([
      record({ id: 'x', invoice_number: 'ST-999' }),
      record({ id: 'y', invoice_number: 'ST-1000' }),
    ])).toEqual(['y', 'x']);
  });

  it('puts a row without a date last', () => {
    expect(order([
      record({ id: 'undated', created_at: '' }),
      record({ id: 'dated', created_at: '2025-01-01T00:00:00Z' }),
    ])).toEqual(['dated', 'undated']);
  });
});

describe('optionRowsFromLists — the full lists behind סוג חוג and מדריך', () => {
  const rows = optionRowsFromLists(
    [
      { id: 'type-2', name: 'שחייה', is_active: true },
      { id: 'type-1', name: 'בלט' },
      { id: 'type-9', name: 'ישן', is_active: false },
      { id: 'type-8', name: '  ' },
    ],
    [
      { id: 'inst-2', full_name: 'שירה לוי' },
      { id: 7, first_name: 'אבי', last_name: 'כהן' },
      { id: 'inst-0', full_name: '', first_name: '', last_name: '' },
    ],
  );

  it('offers every active course type, sorted by name', () => {
    expect(ledgerRowOptions(rows, 'courseTypeId')).toEqual([
      { value: 'type-1', label: 'בלט' },
      { value: 'type-2', label: 'שחייה' },
    ]);
  });

  it('offers every instructor that has a name, ids as text', () => {
    expect(ledgerRowOptions(rows, 'instructorId')).toEqual([
      { value: '7', label: 'אבי כהן' },
      { value: 'inst-2', label: 'שירה לוי' },
    ]);
  });

  it('adds what a loaded row names on top of the lists', () => {
    const withPage = [...rows, toChargeRow(charge({ age_key: '6-9', age_label: 'גילאי 6–9' }))];
    expect(ledgerRowOptions(withPage, 'ageKey')).toEqual([{ value: '6-9', label: 'גילאי 6–9' }]);
  });
});
