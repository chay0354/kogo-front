/**
 * The standing-orders tab: which orders the page's shared filters keep, how an
 * order is placed in its branch — by the id the list sends, or by the branch's
 * name when an answer has none — the order the list is read in, and the
 * figures and marks over it.
 */
import { describe, expect, it } from 'vitest';
import type { BranchOption } from '@/lib/scopedFilters';
import type { LedgerFilters } from './types';
import {
  billingRhythm,
  compareStandingOrders,
  hasScheduledChange,
  matchesStandingOrderFilters,
  matchesStandingOrderSearch,
  pendingAmountChange,
  standingOrderCourse,
  standingOrderDueDay,
  summarizeStandingOrders,
  upcomingMonthOverrides,
  withStandingOrderBranch,
  type StandingOrderRow,
} from './RecurringTab';

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

type Details = NonNullable<StandingOrderRow['initial_payment_details']>;

/** The slim initial payment the list sends — not the full Payment the type describes. */
function details(fields: Partial<Details>): Details {
  return fields as Details;
}

function order(overrides: Partial<StandingOrderRow> = {}): StandingOrderRow {
  return {
    id: 'sto-1',
    child: 'child-1',
    child_name: 'נועה כהן',
    initial_payment: 'pay-1',
    initial_payment_details: null,
    status: 'active',
    amount: '320.00',
    pending_amount: null,
    pending_amount_effective_date: null,
    billing_day: 5,
    start_date: '2026-01-05',
    end_date: null,
    next_billing_date: '2026-10-05',
    last_charge_date: '2026-09-05',
    cancelled_at: null,
    cancellation_reason: '',
    lesson_name: null,
    branch_name: 'אם המושבות',
    lesson_details: null,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-09-05T10:00:00Z',
    ...overrides,
  };
}

const branches: BranchOption[] = [
  { id: 'b-1', name: 'אם המושבות', city: 'c-1', city_name: 'פתח תקווה' },
  { id: 'b-2', name: 'כפר גנים', city: 'c-1', city_name: 'פתח תקווה' },
  { id: 'b-3', name: 'מרכז', city: 'c-2', city_name: 'רעננה' },
  { id: 'b-4', name: 'מרכז', city: 'c-3', city_name: 'הוד השרון' },
];

describe('compareStandingOrders', () => {
  const sorted = (rows: StandingOrderRow[]) => [...rows].sort(compareStandingOrders).map((row) => row.id);

  it('puts active first, then paused, then the rest', () => {
    expect(sorted([
      order({ id: 'cancelled', status: 'cancelled' }),
      order({ id: 'paused', status: 'paused' }),
      order({ id: 'failed', status: 'failed' }),
      order({ id: 'active', status: 'active' }),
    ]).slice(0, 2)).toEqual(['active', 'paused']);
  });

  it('within a group puts the soonest charge first and an order without one last', () => {
    expect(sorted([
      order({ id: 'later', next_billing_date: '2026-10-20' }),
      order({ id: 'none', next_billing_date: null }),
      order({ id: 'sooner', next_billing_date: '2026-09-14' }),
    ])).toEqual(['sooner', 'later', 'none']);
  });

  it('keeps the groups apart even when a later group charges sooner', () => {
    expect(sorted([
      order({ id: 'paused-soon', status: 'paused', next_billing_date: '2026-09-12' }),
      order({ id: 'active-late', status: 'active', next_billing_date: '2026-12-01' }),
    ])).toEqual(['active-late', 'paused-soon']);
  });

  it('among the rest, a failed charge comes before an ended order, whatever date that one kept', () => {
    expect(sorted([
      order({ id: 'cancelled', status: 'cancelled', next_billing_date: '2026-01-01' }),
      order({ id: 'expired', status: 'expired', next_billing_date: '2026-02-01' }),
      order({ id: 'failed', status: 'failed', next_billing_date: '2026-09-05' }),
    ])[0]).toBe('failed');
  });

  it('breaks a tie by the child name, then by id, so the order holds still', () => {
    expect(sorted([
      order({ id: 'b', child_name: 'תמר' }),
      order({ id: 'c', child_name: 'אורי' }),
      order({ id: 'a', child_name: 'תמר' }),
    ])).toEqual(['c', 'a', 'b']);
  });
});

describe('standingOrderDueDay', () => {
  it('is the next charge of a live order and the failed charge of a failed one', () => {
    expect(standingOrderDueDay(order({ next_billing_date: '2026-10-05' }))).toBe('2026-10-05');
    expect(standingOrderDueDay(order({ status: 'paused', next_billing_date: '2026-10-05' }))).toBe('2026-10-05');
    expect(standingOrderDueDay(order({ status: 'failed', next_billing_date: '2026-09-05' }))).toBe('2026-09-05');
  });

  it('is empty for an ended order, and for one without a date', () => {
    expect(standingOrderDueDay(order({ status: 'cancelled' }))).toBe('');
    expect(standingOrderDueDay(order({ status: 'expired' }))).toBe('');
    expect(standingOrderDueDay(order({ next_billing_date: null }))).toBe('');
  });
});

describe('withStandingOrderBranch', () => {
  it('places an order in the branch its name belongs to', () => {
    expect(withStandingOrderBranch(order(), branches).branch_id).toBe('b-1');
  });

  it('reads the name of the initial payment first', () => {
    const row = order({ branch_name: 'אם המושבות', initial_payment_details: details({ branch_name: 'כפר גנים' }) });
    expect(withStandingOrderBranch(row, branches).branch_id).toBe('b-2');
  });

  it('where two branches share the name, the chosen one answers; otherwise none is guessed', () => {
    const row = order({ branch_name: 'מרכז' });
    expect(withStandingOrderBranch(row, branches, 'b-4').branch_id).toBe('b-4');
    expect(withStandingOrderBranch(row, branches, 'b-3').branch_id).toBe('b-3');
    expect(withStandingOrderBranch(row, branches).branch_id).toBeUndefined();
    expect(withStandingOrderBranch(row, branches, 'b-1').branch_id).toBeUndefined();
  });

  it('keeps a branch_id the server sent, even an empty one', () => {
    expect(withStandingOrderBranch(order({ branch_id: 'b-9' }), branches).branch_id).toBe('b-9');
    expect(withStandingOrderBranch(order({ branch_id: null }), branches).branch_id).toBeNull();
  });

  it('takes the id the list sends where two branches share the name, whichever is chosen', () => {
    const row = order({ branch_name: 'מרכז', branch_id: 'b-4' });
    expect(withStandingOrderBranch(row, branches).branch_id).toBe('b-4');
    expect(withStandingOrderBranch(row, branches, 'b-3').branch_id).toBe('b-4');
    expect(matchesStandingOrderFilters(row, filters({ business: 'branches', branchId: 'b-4' }))).toBe(true);
    expect(matchesStandingOrderFilters(row, filters({ business: 'branches', branchId: 'b-3' }))).toBe(false);
  });

  it('leaves an order without a known branch alone', () => {
    const nameless = order({ branch_name: null });
    expect(withStandingOrderBranch(nameless, branches)).toBe(nameless);
    expect(withStandingOrderBranch(order({ branch_name: 'סניף אחר' }), branches).branch_id).toBeUndefined();
  });
});

describe('matchesStandingOrderFilters', () => {
  const placed = (row: StandingOrderRow, branchId = '') => withStandingOrderBranch(row, branches, branchId);

  it('keeps the orders of the chosen branch, found by its name', () => {
    const chosen = filters({ business: 'branches', branchId: 'b-1' });
    expect(matchesStandingOrderFilters(placed(order(), 'b-1'), chosen)).toBe(true);
    expect(matchesStandingOrderFilters(placed(order({ branch_name: 'כפר גנים' }), 'b-1'), chosen)).toBe(false);
  });

  it('keeps the orders of the chosen city, from the city the list sends', () => {
    expect(matchesStandingOrderFilters(order({ city_id: 'c-1' }), filters({ business: 'branches', cityId: 'c-1' }))).toBe(true);
    expect(matchesStandingOrderFilters(order({ city_id: 'c-2' }), filters({ business: 'branches', cityId: 'c-1' }))).toBe(false);
  });

  it('סניפים leaves out an order whose course belongs to a business; the business keeps it', () => {
    const tagged = order({ business_id: 'biz-1', business_name: 'הפקות' });
    expect(matchesStandingOrderFilters(tagged, filters({ business: 'branches' }))).toBe(false);
    expect(matchesStandingOrderFilters(order(), filters({ business: 'branches' }))).toBe(true);
    expect(matchesStandingOrderFilters(tagged, filters({ business: 'biz-1' }))).toBe(true);
    expect(matchesStandingOrderFilters(order(), filters({ business: 'biz-1' }))).toBe(false);
  });

  it('no standing order is a store sale', () => {
    expect(matchesStandingOrderFilters(order(), filters({ business: 'store' }))).toBe(false);
  });

  it('matches course type, age group and instructor exactly', () => {
    const row = order({ course_type_id: 't-1', age_key: '6-9', instructor_id: 'i-1' });
    expect(matchesStandingOrderFilters(row, filters({ courseTypeId: 't-1', ageKey: '6-9', instructorId: 'i-1' }))).toBe(true);
    expect(matchesStandingOrderFilters(row, filters({ instructorId: 'i-2' }))).toBe(false);
    expect(matchesStandingOrderFilters(order(), filters({ courseTypeId: 't-1' }))).toBe(false);
  });

  it('does not look at the range: a standing order is not dated', () => {
    const farAway = filters({ dateFrom: '2030-01-01', dateTo: '2030-01-31' });
    expect(matchesStandingOrderFilters(order({ start_date: '2026-01-05' }), farAway)).toBe(true);
  });

  it('applies the search too', () => {
    expect(matchesStandingOrderFilters(order(), filters({ search: 'נועה' }))).toBe(true);
    expect(matchesStandingOrderFilters(order(), filters({ search: 'דנה' }))).toBe(false);
  });
});

describe('matchesStandingOrderSearch', () => {
  const row = order({
    child_name: 'נועה כהן',
    course_name: 'בלט מתחילות',
    instructor_name: 'שירה לוי',
    city_name: 'פתח תקווה',
    business_name: 'הפקות קוגו',
    course_type_name: 'מחול',
    initial_payment_details: details({ lesson_course_display_id: 123, branch_name: 'אם המושבות' }),
  });

  it('finds an order by child, class, instructor, place, business, type or group number', () => {
    ['נועה', 'בלט', 'שירה', 'המושבות', 'פתח', 'קוגו', 'מחול', '#123', '12'].forEach((query) => {
      expect(matchesStandingOrderSearch(row, query)).toBe(true);
    });
    expect(matchesStandingOrderSearch(row, 'אין כזה')).toBe(false);
  });

  it('an empty query matches everything, and missing fields do not trip it', () => {
    expect(matchesStandingOrderSearch(row, '   ')).toBe(true);
    expect(matchesStandingOrderSearch(order({ branch_name: null }), 'שירה')).toBe(false);
  });
});

describe('standingOrderCourse', () => {
  it('prefers the lesson, then the course, then the description', () => {
    expect(standingOrderCourse(order({
      course_name: 'בלט',
      initial_payment_details: details({ lesson_name: 'בלט מתחילות', description: 'מנוי' }),
    }))).toBe('בלט מתחילות');
    expect(standingOrderCourse(order({ course_name: 'בלט' }))).toBe('בלט');
  });

  it('falls through an empty course name — what the list sends for an order without a lesson', () => {
    expect(standingOrderCourse(order({
      course_name: '',
      initial_payment_details: details({ lesson_name: null, description: 'מנוי חודשי' }),
    }))).toBe('מנוי חודשי');
    expect(standingOrderCourse(order({ course_name: '' }))).toBe('');
  });
});

describe('amount changes', () => {
  it('reads a new standing amount waiting for its date', () => {
    expect(pendingAmountChange(order({ pending_amount: '350.00', pending_amount_effective_date: '2026-10-05' })))
      .toEqual({ amount: 350, from: '2026-10-05' });
  });

  it('there is none without an amount or without a date', () => {
    expect(pendingAmountChange(order())).toBeNull();
    expect(pendingAmountChange(order({ pending_amount: '350.00' }))).toBeNull();
    expect(pendingAmountChange(order({ pending_amount: '', pending_amount_effective_date: '2026-10-05' }))).toBeNull();
  });

  it('lists the months still ahead, nearest first, without the ones already charged', () => {
    const row = order({
      upcoming_overrides: [
        { id: 'o-3', billing_month: '2026-12-01', amount: '200.00' },
        { id: 'o-1', billing_month: '2026-10-01', amount: '160.00' },
        { id: 'o-2', billing_month: '2026-11-01', amount: '180.00', applied_at: '2026-11-05T08:00:00Z' },
      ],
    });
    expect(upcomingMonthOverrides(row).map((month) => month.id)).toEqual(['o-1', 'o-3']);
    expect(upcomingMonthOverrides(order())).toEqual([]);
  });

  it('an ended order has nothing scheduled, whatever it still carries', () => {
    const pending = { pending_amount: '350.00', pending_amount_effective_date: '2026-10-05' };
    expect(hasScheduledChange(order(pending))).toBe(true);
    expect(hasScheduledChange(order({ ...pending, status: 'paused' }))).toBe(true);
    expect(hasScheduledChange(order({ ...pending, status: 'cancelled' }))).toBe(false);
    expect(hasScheduledChange(order({ upcoming_overrides: [{ id: 'o', billing_month: '2026-10-01', amount: 90 }] }))).toBe(true);
    expect(hasScheduledChange(order())).toBe(false);
  });
});

describe('summarizeStandingOrders', () => {
  it('counts the orders by what they need, and sums only the active amounts, to the agora', () => {
    const summary = summarizeStandingOrders([
      order({ id: '1', amount: '0.10' }),
      order({ id: '2', amount: '0.20', pending_amount: '1', pending_amount_effective_date: '2026-10-05' }),
      order({ id: '3', status: 'paused', amount: '500' }),
      order({ id: '4', status: 'failed', amount: '250' }),
      order({ id: '5', status: 'cancelled', amount: '999', pending_amount: '1', pending_amount_effective_date: '2026-10-05' }),
    ]);
    expect(summary).toEqual({ total: 5, active: 2, activeMonthly: 0.3, failed: 1, scheduled: 1 });
  });

  it('is all zeros over nothing', () => {
    expect(summarizeStandingOrders([])).toEqual({ total: 0, active: 0, activeMonthly: 0, failed: 0, scheduled: 0 });
  });
});

describe('billingRhythm', () => {
  it('says the order charges monthly, and on which day when it knows', () => {
    expect(billingRhythm(5)).toBe('חודשי, ב-5 בחודש');
    expect(billingRhythm(0)).toBe('חודשי');
    expect(billingRhythm(undefined)).toBe('חודשי');
  });
});
