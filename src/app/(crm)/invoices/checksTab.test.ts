/**
 * The checks tab: which plans the page's shared filters keep — only the
 * dimensions a check plan carries — the order the list is read in, and the
 * figures over it, including the checks whose invoice did not go out.
 */
import { describe, expect, it } from 'vitest';
import type { CheckItemRow, CheckPlanRow } from '@/lib/documentsApi';
import type { LedgerFilters } from './types';
import {
  CHECKS_HIDDEN_FIELDS,
  checkPlanLedgerRow,
  compareCheckPlans,
  isCheckItemLate,
  itemStatusLabel,
  matchesCheckPlanFilters,
  matchesCheckPlanSearch,
  planStatusLabel,
  summarizeCheckPlans,
  type CheckPlanLedgerRow,
} from './ChecksTab';

const TODAY = '2026-09-11';
const cities = new Map([['b-1', 'c-1']]);

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

function item(overrides: Partial<CheckItemRow> = {}): CheckItemRow {
  return {
    id: 'item-1',
    due_date: '2026-10-01',
    amount: '300.00',
    bank: 'לאומי',
    bank_branch: '812',
    account_number: '123456',
    check_number: '1001',
    status: 'pending',
    tax_invoice: null,
    tax_invoice_number: null,
    invoiced_at: null,
    ...overrides,
  };
}

function plan(overrides: Partial<CheckPlanRow> = {}): CheckPlanRow {
  return {
    id: 'plan-1',
    child: 'child-1',
    child_name: 'אורי לוי',
    lesson: 'lesson-1',
    lesson_name: 'ג׳ודו',
    description: 'מנוי צ׳קים — ג׳ודו',
    status: 'active',
    receipt: 'rcpt-1',
    receipt_number: 'RC-2026-0042',
    branch: 'b-1',
    branch_name: 'אם המושבות',
    items: [item()],
    total_amount: '300.00',
    next_due_date: '2026-10-01',
    created_at: '2026-09-01T09:00:00Z',
    ...overrides,
  };
}

const row = (overrides: Partial<CheckPlanRow> = {}) => checkPlanLedgerRow(plan(overrides), cities);

describe('checkPlanLedgerRow', () => {
  it('matches on the plan branch, and the branch places it in its city', () => {
    expect(row()).toMatchObject({ branch_id: 'b-1', city_id: 'c-1' });
  });

  it('a plan without a branch has none, and no city', () => {
    expect(row({ branch: null, branch_name: null })).toMatchObject({ branch_id: null });
    expect(row({ branch: null }).city_id).toBeUndefined();
  });

  it('keeps what the server sends itself, once it does', () => {
    const tagged = { ...plan(), branch_id: 'b-7', city_id: null } as CheckPlanLedgerRow;
    expect(checkPlanLedgerRow(tagged, cities)).toMatchObject({ branch_id: 'b-7', city_id: null });
  });
});

describe('matchesCheckPlanFilters', () => {
  it('keeps the plans of the chosen branch and city', () => {
    expect(matchesCheckPlanFilters(row(), filters({ business: 'branches', branchId: 'b-1' }))).toBe(true);
    expect(matchesCheckPlanFilters(row(), filters({ business: 'branches', branchId: 'b-2' }))).toBe(false);
    expect(matchesCheckPlanFilters(row(), filters({ business: 'branches', cityId: 'c-1' }))).toBe(true);
    expect(matchesCheckPlanFilters(row(), filters({ business: 'branches', cityId: 'c-2' }))).toBe(false);
  });

  it('a plan with no branch does not pass a branch choice, but passes when none is made', () => {
    expect(matchesCheckPlanFilters(row({ branch: null }), filters({ business: 'branches', branchId: 'b-1' }))).toBe(false);
    expect(matchesCheckPlanFilters(row({ branch: null }), filters())).toBe(true);
  });

  it('סניפים keeps the plans; no plan is a store sale; a business keeps only plans tagged to it', () => {
    expect(matchesCheckPlanFilters(row(), filters({ business: 'branches' }))).toBe(true);
    expect(matchesCheckPlanFilters(row(), filters({ business: 'store' }))).toBe(false);
    expect(matchesCheckPlanFilters(row(), filters({ business: 'biz-1' }))).toBe(false);
    const tagged = { ...row(), business_id: 'biz-1' };
    expect(matchesCheckPlanFilters(tagged, filters({ business: 'biz-1' }))).toBe(true);
  });

  it('ignores the fields the tab hides — a class chosen on another tab does not empty the list', () => {
    const elsewhere = filters({ courseTypeId: 't-1', ageKey: '6-9', instructorId: 'i-1' });
    expect(matchesCheckPlanFilters(row(), elsewhere)).toBe(true);
    expect(matchesCheckPlanFilters(row(), filters({ dateFrom: '2030-01-01', dateTo: '2030-01-31' }))).toBe(true);
  });

  it('applies the search', () => {
    expect(matchesCheckPlanFilters(row(), filters({ search: 'אורי' }))).toBe(true);
    expect(matchesCheckPlanFilters(row(), filters({ search: 'דנה' }))).toBe(false);
  });

  it('hides the range and the class fields, and keeps business, place and search on screen', () => {
    expect([...CHECKS_HIDDEN_FIELDS].sort()).toEqual(['ageKey', 'courseTypeId', 'dateFrom', 'dateTo', 'instructorId']);
  });
});

describe('matchesCheckPlanSearch', () => {
  const searched = plan({
    items: [item({ check_number: '5577' }), item({ id: 'item-2', status: 'invoiced', tax_invoice_number: 'TI-2026-0310' })],
  });

  it('finds a plan by child, class, description, receipt, branch, check number or tax invoice', () => {
    ['אורי', 'ג׳ודו', 'מנוי', 'rc-2026-0042', 'המושבות', '5577', 'ti-2026-0310'].forEach((query) => {
      expect(matchesCheckPlanSearch(searched, query)).toBe(true);
    });
    expect(matchesCheckPlanSearch(searched, 'אין כזה')).toBe(false);
  });

  it('an empty query matches everything, and missing fields do not trip it', () => {
    expect(matchesCheckPlanSearch(searched, '  ')).toBe(true);
    expect(matchesCheckPlanSearch(plan({ lesson_name: null, receipt_number: null, branch_name: null }), 'ג׳ודו')).toBe(true);
  });
});

describe('compareCheckPlans', () => {
  const sorted = (plans: CheckPlanRow[]) => [...plans].sort(compareCheckPlans).map((p) => p.id);

  it('puts active plans first, then completed, then cancelled', () => {
    expect(sorted([
      plan({ id: 'cancelled', status: 'cancelled', next_due_date: null }),
      plan({ id: 'completed', status: 'completed', next_due_date: null }),
      plan({ id: 'active', status: 'active' }),
    ])).toEqual(['active', 'completed', 'cancelled']);
  });

  it('within a group puts the nearest next check first, and a plan with none last', () => {
    expect(sorted([
      plan({ id: 'later', next_due_date: '2026-11-01' }),
      plan({ id: 'none', next_due_date: null }),
      plan({ id: 'sooner', next_due_date: '2026-09-15' }),
    ])).toEqual(['sooner', 'later', 'none']);
  });

  it('breaks a tie by the newest registration, then the child name', () => {
    expect(sorted([
      plan({ id: 'old', created_at: '2026-06-01T09:00:00Z' }),
      plan({ id: 'new', created_at: '2026-09-01T09:00:00Z' }),
    ])).toEqual(['new', 'old']);
    expect(sorted([
      plan({ id: 'tamar', child_name: 'תמר' }),
      plan({ id: 'ori', child_name: 'אורי' }),
    ])).toEqual(['ori', 'tamar']);
  });
});

describe('isCheckItemLate', () => {
  it('is a pending check of an active plan whose day has passed', () => {
    expect(isCheckItemLate(item({ due_date: '2026-09-10' }), 'active', TODAY)).toBe(true);
  });

  it('not on its day — the cron still has the day to issue it — nor ahead of it', () => {
    expect(isCheckItemLate(item({ due_date: TODAY }), 'active', TODAY)).toBe(false);
    expect(isCheckItemLate(item({ due_date: '2026-10-01' }), 'active', TODAY)).toBe(false);
  });

  it('not once invoiced or cancelled, nor in a plan that is not active, nor without a date', () => {
    expect(isCheckItemLate(item({ due_date: '2026-09-01', status: 'invoiced' }), 'active', TODAY)).toBe(false);
    expect(isCheckItemLate(item({ due_date: '2026-09-01', status: 'cancelled' }), 'active', TODAY)).toBe(false);
    expect(isCheckItemLate(item({ due_date: '2026-09-01' }), 'cancelled', TODAY)).toBe(false);
    expect(isCheckItemLate(item({ due_date: '' }), 'active', TODAY)).toBe(false);
  });
});

describe('summarizeCheckPlans', () => {
  it('counts what is waiting, what is late and what comes next — only in active plans', () => {
    const summary = summarizeCheckPlans([
      plan({
        id: 'a',
        child_name: 'אורי לוי',
        items: [
          item({ id: 'a1', due_date: '2026-09-05', amount: '300' }),
          item({ id: 'a2', due_date: '2026-10-01', amount: '300' }),
          item({ id: 'a3', due_date: '2026-08-01', amount: '300', status: 'invoiced' }),
        ],
      }),
      plan({
        id: 'b',
        child_name: 'נועה כהן',
        items: [
          item({ id: 'b1', due_date: '2026-10-01', amount: '250' }),
          item({ id: 'b2', due_date: '2026-11-01', amount: '250' }),
        ],
      }),
      plan({ id: 'c', status: 'cancelled', items: [item({ id: 'c1', due_date: '2026-09-01', amount: '400' })] }),
      plan({ id: 'd', status: 'completed', items: [item({ id: 'd1', status: 'invoiced' })] }),
    ], TODAY);

    expect(summary).toEqual({
      total: 4,
      active: 2,
      pendingCount: 4,
      pendingAmount: 1100,
      late: 1,
      next: { date: '2026-10-01', count: 2, amount: 550, childName: 'אורי לוי' },
    });
  });

  it('adds money to the agora, and counts today as still ahead', () => {
    const summary = summarizeCheckPlans([
      plan({ items: [item({ id: '1', amount: '0.10', due_date: TODAY }), item({ id: '2', amount: '0.20', due_date: TODAY })] }),
    ], TODAY);
    expect(summary.pendingAmount).toBe(0.3);
    expect(summary.late).toBe(0);
    expect(summary.next).toEqual({ date: TODAY, count: 2, amount: 0.3, childName: 'אורי לוי' });
  });

  it('is all zeros over nothing', () => {
    expect(summarizeCheckPlans([], TODAY)).toEqual({
      total: 0,
      active: 0,
      pendingCount: 0,
      pendingAmount: 0,
      late: 0,
      next: null,
    });
  });
});

describe('status labels', () => {
  it('names the plan and check statuses, and passes an unknown one through', () => {
    expect(['active', 'completed', 'cancelled', 'other'].map(planStatusLabel)).toEqual(['פעיל', 'הושלם', 'בוטל', 'other']);
    expect(['pending', 'invoiced', 'cancelled'].map(itemStatusLabel)).toEqual(['ממתין לחשבונית', 'הופקה חשבונית', 'בוטל']);
  });
});
