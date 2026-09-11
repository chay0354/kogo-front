/**
 * The tenants screen's rules: how a slot reads in its row, what the slots
 * come to a month, the order of the list and the figures above it, what the
 * tenancy dialog sends, how the confirmed rentals become one import, and how
 * the server's refusals read.
 */
import { describe, expect, it } from 'vitest';
import type { Tenancy, TenancySlot, TenancySuggestion, TenancyTenant } from '@/lib/rentalsApi';
import {
  EMPTY_TENANT,
  amountFieldValue,
  apiErrorMessages,
  billingDayLabel,
  buildCreatePayload,
  buildImportPayload,
  buildUpdatePayload,
  canApplySuggestion,
  compareTenancies,
  contractRangeLabel,
  countActiveTenancyFilters,
  defaultImportStatus,
  emptyTenancyForm,
  estimateMonthlyAmount,
  formatClock,
  formatDay,
  formatShekels,
  freeSlotsForBranch,
  hebrewDayLetter,
  importCardErrors,
  importCardFromSuggestion,
  isTenancyStatus,
  isUnknownOutcome,
  isValidBillingDay,
  isoDateOf,
  matchesTenancyFilters,
  mergeImportCards,
  parseAmountInput,
  slotChanges,
  slotDays,
  slotPriceLabel,
  slotSummary,
  slotsSummary,
  sortSlots,
  sortTenancies,
  splitRenterIdNumber,
  splitRenterName,
  suggestedAmountLabel,
  tenancyApiError,
  tenancyFormErrors,
  tenancyFormFrom,
  tenancyKpis,
  tenancyStatusLabel,
  tenancyStatusTone,
  tenantFieldErrors,
  tenantIdentifier,
  tenantName,
  toAmount,
  toDecimalString,
  withVat,
  type ImportCardState,
  type TenancyFormState,
} from './tenancyUtils';

const TODAY = '2026-09-11';

function slot(overrides: Partial<TenancySlot> = {}): TenancySlot {
  return {
    id: 's-1',
    name: 'שכירות לאולפן',
    studio_name: 'סטודיו 2',
    branch_name: 'כפר סבא',
    weekly_repeat_days: [0, 3],
    weekly_day_times: {
      '0': { start_time: '17:00:00', end_time: '19:00:00' },
      '3': { start_time: '18:00:00', end_time: '20:00:00' },
    },
    start_time: '17:00:00',
    end_time: '19:00:00',
    price_per_session: '120.00',
    is_active: true,
    contract_start_date: '2026-09-01',
    contract_end_date: '2027-08-31',
    ...overrides,
  };
}

function tenant(overrides: Partial<TenancyTenant> = {}): TenancyTenant {
  return {
    id: 'c-1',
    first_name: 'דנה',
    last_name: 'לוי',
    full_name: 'דנה לוי',
    company_number: '',
    id_number: '012345678',
    phone: '050-1234567',
    email: 'dana@example.com',
    address: 'הרצל 1, כפר סבא',
    ...overrides,
  };
}

function tenancy(overrides: Partial<Tenancy> = {}): Tenancy {
  return {
    id: 't-1',
    status: 'active',
    status_label: 'פעיל',
    branch: 'b-1',
    branch_name: 'כפר סבא',
    monthly_amount: '960.00',
    monthly_total: '1132.80',
    billing_day: 1,
    start_date: '2026-09-01',
    end_date: '2027-08-31',
    notes: '',
    created_at: '2026-09-01T08:00:00Z',
    suggested_monthly_amount: '960.00',
    tenant: tenant(),
    slots: [slot()],
    current_contract: null,
    ...overrides,
  };
}

function suggestion(overrides: Partial<TenancySuggestion> = {}): TenancySuggestion {
  return {
    key: 'g-1',
    renter_name: 'יוסי כהן',
    renter_id_number: '012345678',
    branch: 'b-1',
    branch_name: 'כפר סבא',
    slots: [slot({ id: 's-9' })],
    suggested_monthly_amount: '960.00',
    contract_start_date: '2026-09-01',
    contract_end_date: '2027-08-31',
    existing_tenant: null,
    ...overrides,
  };
}

function form(overrides: Partial<TenancyFormState> = {}): TenancyFormState {
  return {
    ...emptyTenancyForm('b-1'),
    tenant: { ...EMPTY_TENANT, first_name: 'דנה', last_name: 'לוי' },
    monthlyAmount: '1200',
    ...overrides,
  };
}

function card(overrides: Partial<ImportCardState> = {}): ImportCardState {
  return { ...importCardFromSuggestion(suggestion(), TODAY), ...overrides };
}

describe('day letters', () => {
  it('names every weekday by its letter, Sunday first', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(hebrewDayLetter)).toEqual(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']);
  });

  it('gives nothing for what is not a weekday', () => {
    expect([7, -1, 1.5, Number.NaN].map(hebrewDayLetter)).toEqual(['', '', '', '']);
  });

  it('reads a time without its seconds', () => {
    expect(formatClock('17:00:00')).toBe('17:00');
    expect(formatClock('9:05')).toBe('09:05');
    expect(formatClock('')).toBe('');
    expect(formatClock(null)).toBe('');
    expect(formatClock('soon')).toBe('');
  });

  it('takes each weekday once, in order, and drops the rest', () => {
    expect(slotDays({ weekly_repeat_days: [3, 0, 3, 9, -1] })).toEqual([0, 3]);
  });
});

describe('the slots summary', () => {
  it('reads a slot as its studio and its days with their own hours', () => {
    expect(slotSummary(slot())).toBe('סטודיו 2 · א׳ 17:00–19:00, ד׳ 18:00–20:00');
  });

  it("gives a day without hours of its own the slot's hours", () => {
    const weekly = slot({ weekly_repeat_days: [1], weekly_day_times: {}, start_time: '10:00:00', end_time: '12:00:00' });
    expect(slotSummary(weekly)).toBe('סטודיו 2 · ב׳ 10:00–12:00');
  });

  it('names the day alone when there are no hours at all', () => {
    expect(slotSummary(slot({ weekly_repeat_days: [5], weekly_day_times: {}, start_time: null, end_time: null }))).toBe(
      'סטודיו 2 · ו׳',
    );
  });

  it('reads a one-off rental as its date and hours', () => {
    const oneOff = slot({
      event_type: 'one_time',
      event_date: '2026-09-06',
      weekly_repeat_days: [],
      weekly_day_times: {},
      start_time: '09:00:00',
      end_time: '11:30:00',
    });
    expect(slotSummary(oneOff)).toBe('סטודיו 2 · 6.9.2026 09:00–11:30');
  });

  it("reads a weekly rental saved without weekdays on its first date's weekday", () => {
    // 6.9.2026 is a Sunday.
    const legacy = slot({ event_type: 'weekly', event_date: '2026-09-06', weekly_repeat_days: [], weekly_day_times: {} });
    expect(slotSummary(legacy)).toBe('סטודיו 2 · א׳ 17:00–19:00');
  });

  it("falls back to the rental's name without a studio, and to a dash with nothing", () => {
    expect(slotSummary(slot({ studio_name: '' }))).toBe('שכירות לאולפן · א׳ 17:00–19:00, ד׳ 18:00–20:00');
    expect(
      slotSummary(slot({ studio_name: '', name: '', weekly_repeat_days: [], weekly_day_times: {}, start_time: null, end_time: null })),
    ).toBe('—');
  });

  it("lists a tenancy's slots in the week's order", () => {
    const wednesday = slot({
      id: 'a',
      studio_name: 'סטודיו 3',
      weekly_repeat_days: [3],
      weekly_day_times: { '3': { start_time: '18:00:00', end_time: '20:00:00' } },
    });
    const sunday = slot({
      id: 'b',
      weekly_repeat_days: [0],
      weekly_day_times: { '0': { start_time: '17:00:00', end_time: '19:00:00' } },
    });
    expect(slotsSummary([wednesday, sunday])).toBe('סטודיו 2 · א׳ 17:00–19:00 | סטודיו 3 · ד׳ 18:00–20:00');
    expect(slotsSummary([])).toBe('');
  });

  it('puts a one-off rental after the weekly ones', () => {
    const oneOff = slot({ id: 'once', weekly_repeat_days: [], weekly_day_times: {} });
    const weekly = slot({ id: 'weekly', weekly_repeat_days: [6], weekly_day_times: {} });
    expect(sortSlots([oneOff, weekly]).map((item) => item.id)).toEqual(['weekly', 'once']);
  });
});

describe('money', () => {
  it('reads the API decimals and whatever else arrives', () => {
    expect(toAmount('1,200.50')).toBe(1200.5);
    expect(toAmount('₪ 300')).toBe(300);
    expect(toAmount(12)).toBe(12);
    expect(toAmount(null)).toBe(0);
    expect(toAmount('abc')).toBe(0);
    expect(toAmount(Number.NaN)).toBe(0);
  });

  it('accepts a typed amount only as a non-negative number with at most agorot', () => {
    expect(parseAmountInput('1200')).toBe(1200);
    expect(parseAmountInput('1,200.25')).toBe(1200.25);
    expect(parseAmountInput('0')).toBe(0);
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('-5')).toBeNull();
    expect(parseAmountInput('1.234')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
  });

  it('writes amounts as the API takes them and as the field shows them', () => {
    expect(toDecimalString(1200)).toBe('1200.00');
    expect(toDecimalString(0.1 + 0.2)).toBe('0.30');
    expect(amountFieldValue('1200.00')).toBe('1200');
    expect(amountFieldValue('1234.50')).toBe('1234.5');
    expect(amountFieldValue(0)).toBe('0');
    expect(amountFieldValue(null)).toBe('');
  });

  it('shows shekels with agorot only when there are some', () => {
    expect(formatShekels(1200)).toBe('₪1,200');
    expect(formatShekels('1180.5')).toBe('₪1,180.5');
    expect(formatShekels(null)).toBe('₪0');
  });

  it('adds 18% VAT to the agora', () => {
    expect(withVat(1000)).toBe(1180);
    expect(withVat(1234.56)).toBe(1456.78);
    expect(withVat(99.99)).toBe(117.99);
    expect(withVat(0)).toBe(0);
  });
});

describe('the agreement', () => {
  it('takes a billing day from 1 to 28 only', () => {
    expect([1, 28, '5'].map(isValidBillingDay)).toEqual([true, true, true]);
    expect([0, 29, 1.5, '', null].map(isValidBillingDay)).toEqual([false, false, false, false, false]);
  });

  it('reads the billing day as a day of the month', () => {
    expect(billingDayLabel(1)).toBe('ב־1 לחודש');
    expect(billingDayLabel('15')).toBe('ב־15 לחודש');
    expect(billingDayLabel(31)).toBe('—');
    expect(billingDayLabel(null)).toBe('—');
  });

  it("reads the contract's dates as a range, or the one end there is", () => {
    expect(formatDay('2026-09-01')).toBe('1.9.2026');
    expect(formatDay('2026-09-01T10:00:00Z')).toBe('1.9.2026');
    expect(formatDay('bad')).toBe('');
    expect(contractRangeLabel('2026-09-01', '2027-08-31')).toBe('1.9.2026 – 31.8.2027');
    expect(contractRangeLabel('2026-09-01', null)).toBe('מ־1.9.2026');
    expect(contractRangeLabel(null, '2027-08-31')).toBe('עד 31.8.2027');
    expect(contractRangeLabel(null, null)).toBe('—');
  });

  it('writes a local date as the inputs do', () => {
    expect(isoDateOf(new Date(2026, 8, 1))).toBe('2026-09-01');
  });

  it("names statuses by the server's label, else its own, and colours them", () => {
    expect(tenancyStatusLabel('active', 'פעיל כעת')).toBe('פעיל כעת');
    expect(tenancyStatusLabel('sent', '')).toBe('נשלח לחתימה');
    expect(tenancyStatusLabel('weird', null)).toBe('weird');
    expect(tenancyStatusLabel('', null)).toBe('—');
    expect(['active', 'sent', 'signed', 'cancelled', 'draft', 'ended'].map(tenancyStatusTone)).toEqual([
      'ok',
      'progress',
      'signed',
      'bad',
      'off',
      'off',
    ]);
    expect([isTenancyStatus('active'), isTenancyStatus('x'), isTenancyStatus(null)]).toEqual([true, false, false]);
  });
});

describe('the suggested amount', () => {
  it("prices a month as the agreement does: four sessions for each weekday", () => {
    expect(estimateMonthlyAmount([slot()])).toBe(960);
    expect(estimateMonthlyAmount([slot(), slot({ id: 's-2', price_per_session: '150', weekly_repeat_days: [4] })])).toBe(1560);
  });

  it('counts nothing for a one-off rental, an inactive slot or a slot without a price', () => {
    expect(estimateMonthlyAmount([slot({ event_type: 'one_time', weekly_repeat_days: [] })])).toBe(0);
    expect(estimateMonthlyAmount([slot({ is_active: false })])).toBe(0);
    expect(estimateMonthlyAmount([slot({ price_per_session: null })])).toBe(0);
    expect(estimateMonthlyAmount([])).toBe(0);
  });

  it('counts a weekly rental saved without weekdays as one weekday, as the server does', () => {
    expect(estimateMonthlyAmount([slot({ event_type: 'weekly', weekly_repeat_days: [] })])).toBe(480);
  });

  it('says what the slots come to, and nothing when there is nothing to say', () => {
    expect(suggestedAmountLabel(960)).toBe('לפי המשבצות: ₪960');
    expect(suggestedAmountLabel('1560.00')).toBe('לפי המשבצות: ₪1,560');
    expect(suggestedAmountLabel(0)).toBe('');
    expect(suggestedAmountLabel(null)).toBe('');
    expect(suggestedAmountLabel('')).toBe('');
  });

  it('offers to apply the suggestion only when it would change the amount', () => {
    expect(canApplySuggestion(960, '')).toBe(true);
    expect(canApplySuggestion(960, '900')).toBe(true);
    expect(canApplySuggestion(960, 'abc')).toBe(true);
    expect(canApplySuggestion(960, '960')).toBe(false);
    expect(canApplySuggestion(960, '960.00')).toBe(false);
    expect(canApplySuggestion(0, '')).toBe(false);
  });

  it('prices a single session', () => {
    expect(slotPriceLabel(slot())).toBe('₪120 לפעם');
    expect(slotPriceLabel(slot({ price_per_session: null }))).toBe('');
  });
});

describe('the tenant', () => {
  it('is named by its full name, else its parts', () => {
    expect(tenantName(tenant())).toBe('דנה לוי');
    expect(tenantName({ full_name: '', first_name: '', last_name: 'סטודיו אור' })).toBe('סטודיו אור');
    expect(tenantName(null)).toBe('ללא שם');
  });

  it('shows the company number under the name, else the ID', () => {
    expect(tenantIdentifier({ company_number: '512345678', id_number: '012345678' })).toBe('ח.פ 512345678');
    expect(tenantIdentifier({ company_number: '', id_number: '012345678' })).toBe('ת.ז 012345678');
    expect(tenantIdentifier({})).toBe('');
  });

  it("splits a calendar renter's name, a single word going to the business name", () => {
    expect(splitRenterName('יוסי כהן')).toEqual({ first_name: 'יוסי', last_name: 'כהן' });
    expect(splitRenterName('  דנה   בר  לב ')).toEqual({ first_name: 'דנה', last_name: 'בר לב' });
    expect(splitRenterName('סטודיו')).toEqual({ first_name: '', last_name: 'סטודיו' });
    expect(splitRenterName(null)).toEqual({ first_name: '', last_name: '' });
  });

  it('files a company-shaped number as ח.פ and anything else as ת.ז', () => {
    expect(splitRenterIdNumber('512345678')).toEqual({ company_number: '512345678', id_number: '' });
    expect(splitRenterIdNumber('51-234567-8')).toEqual({ company_number: '51-234567-8', id_number: '' });
    expect(splitRenterIdNumber('012345678')).toEqual({ company_number: '', id_number: '012345678' });
    expect(splitRenterIdNumber('')).toEqual({ company_number: '', id_number: '' });
  });

  it('requires a name and a readable email only', () => {
    expect(tenantFieldErrors({ ...EMPTY_TENANT })).toEqual(['יש להזין שם משפחה או שם העסק']);
    expect(tenantFieldErrors({ ...EMPTY_TENANT, last_name: 'לוי', email: 'dana@' })).toEqual(['כתובת המייל אינה תקינה']);
    expect(tenantFieldErrors({ ...EMPTY_TENANT, last_name: 'לוי', email: 'dana@example.com' })).toEqual([]);
  });
});

describe('the list', () => {
  it('puts the active tenancies first, then orders by name', () => {
    const list = [
      tenancy({ id: 'ended', status: 'ended', tenant: tenant({ full_name: 'אבי' }) }),
      tenancy({ id: 'ron', status: 'active', tenant: tenant({ full_name: 'רון' }) }),
      tenancy({ id: 'draft', status: 'draft', tenant: tenant({ full_name: 'בני' }) }),
      tenancy({ id: 'galit', status: 'active', tenant: tenant({ full_name: 'גלית' }) }),
    ];
    expect(sortTenancies(list).map((item) => item.id)).toEqual(['galit', 'ron', 'ended', 'draft']);
    expect(list[0].id).toBe('ended');
  });

  it('keeps equal names in the order they were made', () => {
    const later = tenancy({ id: 'later', created_at: '2026-02-01T00:00:00Z' });
    const earlier = tenancy({ id: 'earlier', created_at: '2026-01-01T00:00:00Z' });
    expect([later, earlier].sort(compareTenancies).map((item) => item.id)).toEqual(['earlier', 'later']);
  });

  it('narrows by branch and by status', () => {
    const filters = { branchId: 'b-1', status: 'active', search: '' };
    expect(matchesTenancyFilters(tenancy(), filters)).toBe(true);
    expect(matchesTenancyFilters(tenancy({ branch: 'b-2' }), filters)).toBe(false);
    expect(matchesTenancyFilters(tenancy({ status: 'draft' }), filters)).toBe(false);
  });

  it("searches the tenant, the email and the studios", () => {
    const search = (text: string) => matchesTenancyFilters(tenancy(), { branchId: '', status: '', search: text });
    expect(search('דנה')).toBe(true);
    expect(search('סטודיו 2')).toBe(true);
    expect(search('EXAMPLE')).toBe(true);
    expect(search('xyz')).toBe(false);
  });

  it('finds a number with or without its dashes, but not by two stray digits', () => {
    const search = (text: string) => matchesTenancyFilters(tenancy(), { branchId: '', status: '', search: text });
    expect(search('0501234567')).toBe(true);
    expect(search('050-123')).toBe(true);
    expect(search('012345678')).toBe(true);
    expect(search('12')).toBe(false);
  });

  it('counts the filters in force', () => {
    expect(countActiveTenancyFilters({ branchId: 'b-1', status: '', search: '  ' })).toBe(1);
    expect(countActiveTenancyFilters({ branchId: 'b-1', status: 'draft', search: 'דנה' })).toBe(3);
  });
});

describe('the figures above the list', () => {
  const tenancies = [
    tenancy({ id: 'a', branch: 'b-1', monthly_amount: '960.00', monthly_total: '1132.80' }),
    tenancy({ id: 'b', branch: 'b-2', monthly_amount: '500.00', monthly_total: '590.00' }),
    tenancy({ id: 'c', branch: 'b-1', status: 'draft', monthly_amount: '300.00', monthly_total: '354.00' }),
  ];
  const suggestions = [
    suggestion({ key: 'g-1', branch: 'b-1', slots: [slot({ id: 'x' }), slot({ id: 'y' })] }),
    suggestion({ key: 'g-2', branch: 'b-2', slots: [slot({ id: 'z' })] }),
    suggestion({ key: 'g-3', branch: 'b-1', slots: [] }),
  ];

  it('counts the active tenancies, their monthly amounts and the rentals left unlinked', () => {
    expect(tenancyKpis(tenancies, suggestions)).toEqual({
      activeCount: 2,
      activeMonthlyNet: 1460,
      activeMonthlyGross: 1722.8,
      totalCount: 3,
      unlinkedSlots: 3,
      unlinkedGroups: 2,
    });
  });

  it('follows the branch chosen', () => {
    expect(tenancyKpis(tenancies, suggestions, 'b-1')).toEqual({
      activeCount: 1,
      activeMonthlyNet: 960,
      activeMonthlyGross: 1132.8,
      totalCount: 2,
      unlinkedSlots: 2,
      unlinkedGroups: 1,
    });
  });

  it('adds decimal amounts without float drift', () => {
    const cents = [tenancy({ monthly_amount: '0.10' }), tenancy({ id: 't-2', monthly_amount: '0.20' })];
    expect(tenancyKpis(cents, []).activeMonthlyNet).toBe(0.3);
  });
});

describe('the free slots of a branch', () => {
  const groups = [
    suggestion({
      key: 'g-1',
      renter_name: 'יוסי כהן',
      slots: [
        slot({ id: 'wed', weekly_repeat_days: [3], weekly_day_times: {} }),
        slot({ id: 'sun', weekly_repeat_days: [0], weekly_day_times: {} }),
      ],
    }),
    suggestion({ key: 'g-2', branch: 'b-2', slots: [slot({ id: 'other-branch' })] }),
    suggestion({ key: 'g-3', renter_name: ' דנה ', slots: [slot({ id: 'mon', weekly_repeat_days: [1], weekly_day_times: {} })] }),
  ];

  it("lists the branch's unlinked rentals in the week's order, with who the calendar says rents them", () => {
    expect(freeSlotsForBranch(groups, 'b-1').map(({ slot: item, renterName }) => [item.id, renterName])).toEqual([
      ['sun', 'יוסי כהן'],
      ['mon', 'דנה'],
      ['wed', 'יוסי כהן'],
    ]);
  });

  it('offers nothing before a branch is chosen, and a slot only once', () => {
    expect(freeSlotsForBranch(groups, '')).toEqual([]);
    const twice = [suggestion({ key: 'a' }), suggestion({ key: 'b' })];
    expect(freeSlotsForBranch(twice, 'b-1')).toHaveLength(1);
  });
});

describe('the tenancy dialog', () => {
  it('opens a new tenancy as a draft in the branch chosen, billed on the 1st', () => {
    expect(emptyTenancyForm('b-1')).toMatchObject({ branch: 'b-1', status: 'draft', billingDay: '1', slotIds: [] });
  });

  it('opens an existing tenancy with its fields as the inputs show them', () => {
    expect(tenancyFormFrom(tenancy())).toMatchObject({
      monthlyAmount: '960',
      billingDay: '1',
      slotIds: ['s-1'],
      tenant: { first_name: 'דנה', last_name: 'לוי', phone: '050-1234567' },
    });
  });

  it('says everything missing from an empty form', () => {
    expect(tenancyFormErrors(emptyTenancyForm(''))).toEqual([
      'יש להזין שם משפחה או שם העסק',
      'יש לבחור סניף',
      'יש להזין סכום חודשי לפני מע״מ (אפשר 0)',
    ]);
  });

  it('asks for a pick in existing-customer mode, and ignores the mode when editing', () => {
    const picking = form({ tenantMode: 'existing', existingTenantId: '', tenant: { ...EMPTY_TENANT } });
    expect(tenancyFormErrors(picking)).toEqual(['יש לבחור לקוח עסקי קיים, או לעבור ל"שוכר חדש"']);
    expect(tenancyFormErrors(picking, { editing: true })).toEqual(['יש להזין שם משפחה או שם העסק']);
  });

  it('refuses an unreadable amount, a billing day past 28 and an end before the start', () => {
    expect(tenancyFormErrors(form({ monthlyAmount: '12.345', billingDay: '29', startDate: '2026-09-01', endDate: '2026-08-01' }))).toEqual([
      'הסכום החודשי צריך להיות מספר חיובי, עד שתי ספרות אחרי הנקודה',
      'יום החיוב צריך להיות בין 1 ל־28',
      'תאריך הסיום מוקדם מתאריך ההתחלה',
    ]);
  });

  it('creates a new tenant with trimmed details and the agreement as the API takes it', () => {
    const payload = buildCreatePayload(
      form({
        tenant: { ...EMPTY_TENANT, first_name: ' דנה ', last_name: ' לוי ', phone: ' 050-1234567 ' },
        billingDay: '5',
        startDate: '2026-09-01',
        notes: ' הערה ',
      }),
    );
    expect(payload).toEqual({
      tenant: { ...EMPTY_TENANT, first_name: 'דנה', last_name: 'לוי', phone: '050-1234567' },
      branch: 'b-1',
      status: 'draft',
      monthly_amount: '1200.00',
      billing_day: 5,
      start_date: '2026-09-01',
      end_date: null,
      notes: 'הערה',
    });
  });

  it('creates for an existing business customer by its id alone', () => {
    const payload = buildCreatePayload(form({ tenantMode: 'existing', existingTenantId: 'c-7' }));
    expect(payload).toMatchObject({ tenant_id: 'c-7', monthly_amount: '1200.00' });
    expect(payload).not.toHaveProperty('tenant');
  });

  it('patches nothing when nothing changed', () => {
    const saved = tenancy();
    expect(buildUpdatePayload(tenancyFormFrom(saved), saved)).toEqual({});
    expect(buildUpdatePayload({ ...tenancyFormFrom(saved), monthlyAmount: '960.00' }, saved)).toEqual({});
  });

  it('patches only the fields that changed', () => {
    const saved = tenancy({ notes: 'x' });
    const edited = { ...tenancyFormFrom(saved), monthlyAmount: '1000', status: 'signed' as const, endDate: '', notes: ' x ' };
    expect(buildUpdatePayload(edited, saved)).toEqual({ monthly_amount: '1000.00', status: 'signed', end_date: null });
  });

  it('sends the tenant only when one of its details changed', () => {
    const saved = tenancy();
    const edited = tenancyFormFrom(saved);
    edited.tenant = { ...edited.tenant, phone: '052-7654321' };
    expect(buildUpdatePayload(edited, saved)).toEqual({
      tenant: {
        first_name: 'דנה',
        last_name: 'לוי',
        company_number: '',
        id_number: '012345678',
        phone: '052-7654321',
        email: 'dana@example.com',
        address: 'הרצל 1, כפר סבא',
      },
    });
  });

  it('works out which slots to link and which to let go', () => {
    expect(slotChanges(['s-1', 's-2'], ['s-2', 's-3'])).toEqual({ link: ['s-3'], unlink: ['s-1'] });
    expect(slotChanges(['s-1'], ['s-1'])).toEqual({ link: [], unlink: [] });
  });
});

describe('connecting the existing rentals', () => {
  it('calls a rental whose agreement ended ended, and every other one active', () => {
    expect(defaultImportStatus('2025-01-01', '2025-12-31', TODAY)).toBe('ended');
    expect(defaultImportStatus('2026-09-01', '2027-08-31', TODAY)).toBe('active');
    expect(defaultImportStatus(null, null, TODAY)).toBe('active');
  });

  it('proposes a card from a group, unchecked, with the renter as a new tenant', () => {
    expect(importCardFromSuggestion(suggestion(), TODAY)).toEqual({
      key: 'g-1',
      include: false,
      slotIds: ['s-9'],
      useExisting: false,
      existingTenant: null,
      tenant: { ...EMPTY_TENANT, first_name: 'יוסי', last_name: 'כהן', id_number: '012345678' },
      monthlyAmount: '960',
      billingDay: '1',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      status: 'active',
    });
  });

  it('keeps the business customer the ID matched', () => {
    const match = { id: 'c-3', full_name: 'יוסי כהן', company_number: '', id_number: '012345678' };
    expect(importCardFromSuggestion(suggestion({ existing_tenant: match }), TODAY)).toMatchObject({
      useExisting: true,
      existingTenant: match,
    });
  });

  it("works the amount out from the slots when the server did not, and leaves it to the office without prices", () => {
    expect(importCardFromSuggestion(suggestion({ suggested_monthly_amount: null }), TODAY).monthlyAmount).toBe('960');
    const unpriced = suggestion({ suggested_monthly_amount: null, slots: [slot({ price_per_session: null })] });
    expect(importCardFromSuggestion(unpriced, TODAY).monthlyAmount).toBe('');
  });

  it("files a company-shaped renter ID under ח.פ", () => {
    expect(importCardFromSuggestion(suggestion({ renter_id_number: '512345678' }), TODAY).tenant).toMatchObject({
      company_number: '512345678',
      id_number: '',
    });
  });

  it('keeps what was typed on fresh suggestions, adds new groups and drops the ones that went', () => {
    const typed = [card({ include: true, monthlyAmount: '1000', useExisting: true }), card({ key: 'gone' })];
    const fresh = [
      suggestion({ slots: [slot({ id: 's-9' }), slot({ id: 's-10' })] }),
      suggestion({ key: 'g-new', slots: [slot({ id: 's-11' })] }),
    ];
    const merged = mergeImportCards(typed, fresh, TODAY);
    expect(merged.map((item) => item.key)).toEqual(['g-1', 'g-new']);
    expect(merged[0]).toMatchObject({ include: true, monthlyAmount: '1000', slotIds: ['s-9', 's-10'], useExisting: false });
    expect(merged[1]).toMatchObject({ include: false, slotIds: ['s-11'] });
  });

  it('checks a card before it is sent', () => {
    expect(importCardErrors(card())).toEqual([]);
    expect(importCardErrors(card({ tenant: { ...EMPTY_TENANT }, monthlyAmount: '' }))).toEqual([
      'יש להזין שם משפחה או שם העסק',
      'יש להזין סכום חודשי לפני מע״מ (אפשר 0)',
    ]);
    expect(importCardErrors(card({ slotIds: [] }))).toEqual(['אין בקבוצה משבצות לחבר']);
    const match = { id: 'c-3', full_name: 'יוסי כהן', company_number: '', id_number: '' };
    expect(importCardErrors(card({ useExisting: true, existingTenant: match, tenant: { ...EMPTY_TENANT } }))).toEqual([]);
  });

  it('sends the included cards only, in their order, each with its tenant', () => {
    const match = { id: 'c-3', full_name: 'רון בר', company_number: '', id_number: '' };
    const payload = buildImportPayload([
      card({ key: 'a', include: true, slotIds: ['s-1'], tenant: { ...EMPTY_TENANT, last_name: ' כהן ' }, endDate: '' }),
      card({ key: 'b', include: false, slotIds: ['s-2'] }),
      card({ key: 'c', include: true, slotIds: ['s-3'], useExisting: true, existingTenant: match, billingDay: '10', startDate: '' }),
    ]);
    expect(payload).toEqual({
      groups: [
        {
          slot_ids: ['s-1'],
          tenant: { ...EMPTY_TENANT, last_name: 'כהן' },
          monthly_amount: '960.00',
          billing_day: 1,
          start_date: '2026-09-01',
          end_date: null,
          status: 'active',
        },
        {
          slot_ids: ['s-3'],
          tenant_id: 'c-3',
          monthly_amount: '960.00',
          billing_day: 10,
          start_date: null,
          end_date: '2027-08-31',
          status: 'active',
        },
      ],
    });
  });

  it('sends an empty import when nothing was confirmed', () => {
    expect(buildImportPayload([card(), card({ key: 'g-2' })])).toEqual({ groups: [] });
  });
});

describe("the server's refusals", () => {
  it('reads a plain error and DRF field errors by their Hebrew names', () => {
    expect(apiErrorMessages({ error: 'אפשר למחוק רק טיוטה בלי משבצות' })).toEqual(['אפשר למחוק רק טיוטה בלי משבצות']);
    expect(apiErrorMessages({ monthly_amount: ['ערך לא תקין'], billing_day: ['מחוץ לטווח'] })).toEqual([
      'סכום חודשי: ערך לא תקין',
      'יום חיוב: מחוץ לטווח',
    ]);
    expect(apiErrorMessages({ tenant: { last_name: ['שדה חובה'] } })).toEqual(['שם משפחה / שם העסק: שדה חובה']);
    expect(apiErrorMessages({ non_field_errors: ['X'], foo: ['bar'] })).toEqual(['X', 'foo: bar']);
    expect(apiErrorMessages({ error: 'X', detail: 'X' })).toEqual(['X']);
  });

  it('names the reason a contract version is voided for', () => {
    expect(apiErrorMessages({ reason: ['שדה חובה'] })).toEqual(['סיבת הביטול: שדה חובה']);
  });

  it("names an import's failing group by the renter it was for", () => {
    const data = { groups: [{}, { tenant: { last_name: ['שדה חובה'] }, slot_ids: ['המשבצת כבר מחוברת'] }] };
    expect(apiErrorMessages(data, ['דנה לוי', 'יוסי כהן'])).toEqual([
      'יוסי כהן · שם משפחה / שם העסק: שדה חובה',
      'יוסי כהן · משבצות: המשבצת כבר מחוברת',
    ]);
    expect(apiErrorMessages(data)).toContain('קבוצה 2 · משבצות: המשבצת כבר מחוברת');
    expect(apiErrorMessages({ groups: ['הרשימה ריקה'] })).toEqual(['הרשימה ריקה']);
  });

  it('falls back when the server said nothing usable', () => {
    expect(tenancyApiError(new Error('offline'), 'המחיקה נכשלה')).toBe('המחיקה נכשלה');
    expect(tenancyApiError({ response: { status: 500, data: '<html>boom</html>' } }, 'המחיקה נכשלה')).toBe('המחיקה נכשלה');
    expect(tenancyApiError({ response: { status: 400, data: {} } }, 'המחיקה נכשלה')).toBe('המחיקה נכשלה');
    expect(tenancyApiError({ response: { status: 404, data: { detail: 'Not found.' } } }, 'המחיקה נכשלה')).toBe(
      'המחיקה נכשלה — לא נמצא בשרת',
    );
    expect(tenancyApiError({ response: { status: 403, data: { detail: 'Forbidden' } } }, 'המחיקה נכשלה')).toBe(
      'אין הרשאה לפעולה הזאת',
    );
  });

  it('puts several messages on their own lines', () => {
    const err = { response: { status: 400, data: { error: 'א', monthly_amount: ['ב'] } } };
    expect(tenancyApiError(err, 'נכשל')).toBe('א\nסכום חודשי: ב');
  });

  it('tells a lost answer from a refusal', () => {
    expect(isUnknownOutcome({ request: {}, code: 'ECONNABORTED' })).toBe(true);
    expect(isUnknownOutcome({ code: 'ERR_NETWORK' })).toBe(true);
    expect(isUnknownOutcome({ request: {}, response: { status: 500 } })).toBe(false);
    expect(isUnknownOutcome(new Error('x'))).toBe(false);
    expect(isUnknownOutcome(null)).toBe(false);
  });
});
