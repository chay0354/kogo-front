/**
 * The collection tab's own rules: which debts it lists and what each one
 * carries for the shared filter bar, the aging tiles that also filter, the
 * chasing order, and where the reminder bell may appear. The shared helpers
 * underneath are covered in collection.test.ts and ledgerFilters.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreInvoice } from '@/types/store';
import type { DocumentRow, LedgerFilters } from './types';
import { ORIGIN_OPTIONS } from './constants';
import { getAgingBuckets, shiftISODate } from './utils';
import {
  agingKeyOf,
  buildDebtRows,
  canRemindDebt,
  compareMostOverdueFirst,
  debtCustomerOptions,
  inAgingBucket,
  matchesDebtFilters,
  matchesDebtSearch,
  nextAgingBucket,
  reminderUnavailableReason,
  sumOpen,
  type DebtRow,
} from './CollectionTab';

const TODAY = '2026-09-11';
const daysAgo = (days: number) => shiftISODate(TODAY, -days);
const cities = new Map([['branch-1', 'city-1']]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 11, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

function filters(overrides: Partial<LedgerFilters> = {}): LedgerFilters {
  return {
    dateFrom: '2026-08-12',
    dateTo: TODAY,
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

/** A ledger document. Like the ledger, it names its origin (origin_label) whenever it has one. */
function doc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  const row: DocumentRow = {
    id: 'doc-1',
    document_number: 'INV-202609-00012',
    issue_date: daysAgo(10),
    customer_name: 'גן הפרחים',
    document_type: 'חשבונית מס',
    document_type_code: 'tax_invoice',
    total_amount: 1000,
    amount_paid: 0,
    open_balance: 1000,
    status: 'pending',
    origin: 'manual',
    ...overrides,
  };
  const label = ORIGIN_OPTIONS.find((option) => option.value === row.origin)?.label;
  return label && !row.origin_label ? { ...row, origin_label: label } : row;
}

function storeInvoice(overrides: Partial<StoreInvoice> = {}): StoreInvoice {
  return {
    id: 'st-1',
    invoice_number: 'ST-2026-0044',
    child: null,
    child_name: null,
    customer_name: 'רותי ניסן',
    customer_phone: '',
    customer_email: '',
    shipping_address: '',
    customer_notes: '',
    website_order_number: null,
    total_amount: 200,
    amount_paid: 0,
    payment_method: 'monthly_billing',
    payment_status: 'pending',
    tranzila_transaction_id: '',
    tranzila_confirmation_code: '',
    charged_with_token: false,
    branch: 'branch-1',
    branch_name: 'אם המושבות',
    issue_date: `${daysAgo(120)}T10:00:00Z`,
    notes: '',
    line_items: [],
    created_at: `${daysAgo(120)}T10:00:00Z`,
    ...overrides,
  };
}

/** A subscription receipt, as the ledger sends it. */
const subscription = doc({
  id: 'crm-inv-7',
  document_number: 'R-7',
  origin: 'subscription',
  document_type_code: 'IR',
  status: 'failed',
  branch_id: 'branch-1',
  course_type_id: 'type-1',
  course_type_name: 'בלט',
  age_key: '6-9',
  age_label: 'גילאי 6–9',
  instructor_id: 'inst-1',
  instructor_name: 'שירה לוי',
  course_name: 'בלט מתחילות',
});

/** A store invoice of the range, as the documents ledger lists it. */
const ledgerStore = doc({
  id: 'st-9',
  store_invoice_id: 'st-9',
  document_number: 'ST-2026-0090',
  origin: 'store_counter',
  document_type: 'חשבונית עסקה',
  document_type_code: 'DI',
  total_amount: 300,
  open_balance: 300,
  branch_id: 'branch-1',
  city_id: 'city-1',
  branch: 'אם המושבות',
});

describe('the debts listed', () => {
  it('lists an open store invoice once when both the ledger and the store hold it', () => {
    const rows = buildDebtRows([ledgerStore], [storeInvoice({ id: 'st-9', total_amount: 300 })], cities);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'document', id: 'st-9', open: 300 });
    expect(sumOpen(rows)).toBe(300);
  });

  it('also when the ledger holds it through the tax document issued for it', () => {
    const formal = doc({ id: 'formal-1', store_invoice_id: 'st-1' });
    const rows = buildDebtRows([formal], [storeInvoice({ id: 'st-1' })], cities);
    expect(rows.map((row) => row.id)).toEqual(['formal-1']);
  });

  it('keeps a store invoice the ledger does not hold open — one issued outside the range', () => {
    const settled = doc({ id: 'st-1', store_invoice_id: 'st-1', origin: 'store_counter', open_balance: 0, status: 'completed' });
    const rows = buildDebtRows([settled], [storeInvoice({ id: 'st-1' })], cities);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'store', id: 'st-1', open: 200 });
  });

  it('still leaves out drafts, credit notes and settled documents', () => {
    const rows = buildDebtRows(
      [
        doc({ id: 'draft', is_draft: true }),
        doc({ id: 'credit', document_type_code: 'credit_invoice' }),
        doc({ id: 'paid', open_balance: 0, status: 'completed' }),
      ],
      [storeInvoice({ id: 'paid-store', payment_status: 'completed' })],
    );
    expect(rows).toEqual([]);
  });
});

describe('the dimensions a debt carries', () => {
  it('a document row carries the ledger dimensions of its document', () => {
    const [row] = buildDebtRows([subscription], [], cities);
    expect(row).toMatchObject({
      origin: 'subscription',
      branch_id: 'branch-1',
      city_id: 'city-1',
      course_type_id: 'type-1',
      age_key: '6-9',
      instructor_id: 'inst-1',
      originLabel: 'מנוי',
    });
    expect(row.doc).toBe(subscription);
  });

  it('a store row is a store sale that knows its branch, and its city through the branch', () => {
    const [counter] = buildDebtRows([], [storeInvoice()], cities);
    expect(counter).toMatchObject({
      kind: 'store',
      origin: 'store_counter',
      branch_id: 'branch-1',
      city_id: 'city-1',
      originLabel: 'חנות · סניף',
      originDetail: 'אם המושבות',
    });
    expect(counter.business_id).toBeUndefined();
    expect(counter.course_type_id).toBeUndefined();

    const [website] = buildDebtRows([], [storeInvoice({ website_order_number: 'CG-260830-ABCD', branch: null, branch_name: null })]);
    expect(website).toMatchObject({ origin: 'store_website', originLabel: 'חנות · אתר', originDetail: 'הזמנה CG-260830-ABCD' });
  });

  describe('matched against the shared filters', () => {
    const tagged = doc({ id: 'tagged', business_id: 'biz-1', business_name: 'הפקות' });
    const rows = buildDebtRows([doc(), subscription, tagged, ledgerStore], [storeInvoice()], cities);
    const kept = (chosen: LedgerFilters, customer = '') =>
      rows.filter((row) => matchesDebtFilters(row, chosen, customer)).map((row) => row.id);

    it('עסק: חנות keeps every store debt, from either source, and nothing else', () => {
      expect(kept(filters({ business: 'store' }))).toEqual(['st-9', 'st-1']);
    });

    it('עסק: סניפים keeps what the branches earned — no store sale, no business', () => {
      expect(kept(filters({ business: 'branches' }))).toEqual(['doc-1', 'crm-inv-7']);
    });

    it('עסק: a business keeps only the debts tagged to it', () => {
      expect(kept(filters({ business: 'biz-1' }))).toEqual(['tagged']);
    });

    it('a branch or a city finds the store rows too, the city through the branch', () => {
      expect(kept(filters({ branchId: 'branch-1' }))).toEqual(['crm-inv-7', 'st-9', 'st-1']);
      expect(kept(filters({ cityId: 'city-1' }))).toEqual(['crm-inv-7', 'st-9', 'st-1']);
    });

    it('סוג חוג, גיל and מדריך pass only the rows that name them — never a store row', () => {
      expect(kept(filters({ courseTypeId: 'type-1' }))).toEqual(['crm-inv-7']);
      expect(kept(filters({ ageKey: '6-9' }))).toEqual(['crm-inv-7']);
      expect(kept(filters({ instructorId: 'inst-1' }))).toEqual(['crm-inv-7']);
    });

    it('the customer is the tab’s own filter, on top of the shared ones', () => {
      expect(kept(filters(), 'רותי ניסן')).toEqual(['st-1']);
      expect(kept(filters({ business: 'branches' }), 'רותי ניסן')).toEqual([]);
    });

    it('the search reads a document as the documents tab does, and a store row by its order or branch', () => {
      expect(kept(filters({ search: 'בלט' }))).toEqual(['crm-inv-7']);
      expect(kept(filters({ search: 'ST-2026-0044' }))).toEqual(['st-1']);
      const [website] = buildDebtRows([], [storeInvoice({ website_order_number: 'CG-260830-ABCD' })]);
      expect(matchesDebtSearch(website, 'cg-260830')).toBe(true);
      expect(matchesDebtSearch(website, 'אין כזה')).toBe(false);
    });
  });
});

describe('the aging tiles', () => {
  const byAge = [10, 45, 75, 120].map((days) =>
    buildDebtRows([doc({ id: `age-${days}`, issue_date: daysAgo(days), open_balance: days, total_amount: days })], [])[0],
  );

  it('puts each debt in its age', () => {
    expect(byAge.map(agingKeyOf)).toEqual(['current', 'd31_60', 'd61_90', 'd90_plus']);
  });

  it('measures from the due date when there is one', () => {
    const [late] = buildDebtRows([doc({ issue_date: daysAgo(100), due_date: daysAgo(40) })], []);
    expect(agingKeyOf(late)).toBe('d31_60');
    const [notYetDue] = buildDebtRows([doc({ issue_date: daysAgo(100), due_date: shiftISODate(TODAY, 20) })], []);
    expect(agingKeyOf(notYetDue)).toBe('current');
  });

  it('a chosen tile keeps only its own debts; none chosen keeps every one', () => {
    expect(byAge.filter((row) => inAgingBucket(row, 'd61_90')).map((row) => row.id)).toEqual(['age-75']);
    expect(byAge.filter((row) => inAgingBucket(row, ''))).toHaveLength(4);
  });

  it('a tile shows exactly the debts its click keeps', () => {
    getAgingBuckets(byAge).forEach((bucket) => {
      const shown = byAge.filter((row) => inAgingBucket(row, bucket.key));
      expect(shown).toHaveLength(bucket.count);
      expect(sumOpen(shown)).toBe(bucket.total);
    });
  });

  it('clicking the chosen tile again clears it', () => {
    expect(nextAgingBucket('', 'd61_90')).toBe('d61_90');
    expect(nextAgingBucket('d61_90', 'd61_90')).toBe('');
    expect(nextAgingBucket('d61_90', 'd90_plus')).toBe('d90_plus');
  });
});

describe('the chasing order', () => {
  it('puts the most overdue first; at the same age, past-due and then the larger balance', () => {
    const rows = buildDebtRows(
      [
        doc({ id: 'not-yet-due', issue_date: daysAgo(5), due_date: shiftISODate(TODAY, 10) }),
        doc({ id: 'small', issue_date: daysAgo(10), open_balance: 100 }),
        doc({ id: 'issued-45', issue_date: daysAgo(45) }),
        doc({ id: 'oldest', issue_date: daysAgo(120) }),
        doc({ id: 'big', issue_date: daysAgo(10), open_balance: 5000 }),
        doc({ id: 'due-45', issue_date: daysAgo(75), due_date: daysAgo(45) }),
      ],
      [],
    );
    expect([...rows].sort(compareMostOverdueFirst).map((row) => row.id))
      .toEqual(['oldest', 'due-45', 'issued-45', 'big', 'small', 'not-yet-due']);
  });
});

describe('the reminder bell', () => {
  const rows = buildDebtRows([doc(), subscription, ledgerStore], [storeInvoice()], cities);
  const byId = (id: string) => rows.find((row) => row.id === id) as DebtRow;

  it('rings on an open document issued by hand', () => {
    expect(canRemindDebt(byId('doc-1'))).toBe(true);
  });

  it('not on a subscription receipt — the endpoint does not know crm-inv ids', () => {
    expect(canRemindDebt(byId('crm-inv-7'))).toBe(false);
    expect(reminderUnavailableReason(byId('crm-inv-7'))).toBe('חיוב מנוי — תזכורת במייל נשלחת רק ממסמך ידני');
  });

  it('not on a store sale, whether the ledger or the store listed it', () => {
    expect(canRemindDebt(byId('st-9'))).toBe(false);
    expect(canRemindDebt(byId('st-1'))).toBe(false);
    expect(reminderUnavailableReason(byId('st-1'))).toBe('מכירה בחנות — תזכורת במייל נשלחת רק ממסמך ידני');
  });

  it('not on a row whose document does not say it was issued by hand', () => {
    const [unknown] = buildDebtRows([doc({ origin: undefined, source: 'local' })], []);
    expect(canRemindDebt(unknown)).toBe(false);
  });
});

describe('the customer filter', () => {
  it('offers each customer with a debt once, by name, and names a row without one', () => {
    const rows = buildDebtRows([doc({ customer_name: 'תמר' }), doc({ id: 'b', customer_name: 'אבי' }), doc({ id: 'c', customer_name: '' })], []);
    expect(debtCustomerOptions(rows, '')).toEqual([
      { value: '—', label: 'ללא שם לקוח' },
      { value: 'אבי', label: 'אבי' },
      { value: 'תמר', label: 'תמר' },
    ]);
  });

  it('keeps a chosen customer visible once their debt is gone', () => {
    expect(debtCustomerOptions([], 'דנה')).toEqual([{ value: 'דנה', label: 'דנה (אין חוב פתוח)' }]);
  });
});
