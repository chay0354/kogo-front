import type {
  ExistingTenantMatch,
  Tenancy,
  TenancyAgreementWrite,
  TenancyCreatePayload,
  TenancyImportPayload,
  TenancySlot,
  TenancyStatus,
  TenancySuggestion,
  TenancyTenant,
  TenancyUpdatePayload,
  TenantFields,
} from '@/lib/rentalsApi';
import type { WeeklyDayTimes } from '@/types/schedule';

// ---------------------------------------------------------------------------
// The rules of the tenants screen — pure, so tenancyUtils.test.ts can pin
// them down without a browser or a server.
// ---------------------------------------------------------------------------

/** Israeli VAT, the rate the rental agreement PDF adds (rental_agreement/generator.py). */
export const VAT_RATE = 0.18;

/**
 * The agreement's month is "global": four sessions for every weekday a slot
 * runs on, and a fifth in a long month is free (rental_agreement/content.py).
 * The suggestion uses the same rule, so it matches the PDF the office already
 * hands out.
 */
export const SESSIONS_PER_WEEKDAY_PER_MONTH = 4;

/** 1–28, so every month has the billing day. */
export const BILLING_DAYS: readonly number[] = Array.from({ length: 28 }, (_, index) => index + 1);

export const TENANCY_STATUS_OPTIONS: ReadonlyArray<{ value: TenancyStatus; label: string }> = [
  { value: 'draft', label: 'טיוטה' },
  { value: 'sent', label: 'נשלח לחתימה' },
  { value: 'signed', label: 'נחתם' },
  { value: 'active', label: 'פעיל' },
  { value: 'ended', label: 'הסתיים' },
  { value: 'cancelled', label: 'בוטל' },
];

const STATUS_VALUES: ReadonlySet<string> = new Set(TENANCY_STATUS_OPTIONS.map((option) => option.value));

export function isTenancyStatus(value: unknown): value is TenancyStatus {
  return typeof value === 'string' && STATUS_VALUES.has(value);
}

/** The server's label when it sent one — it is the source of the wording — else ours. */
export function tenancyStatusLabel(status: string, serverLabel?: string | null): string {
  const label = (serverLabel ?? '').trim();
  if (label) return label;
  return TENANCY_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? (status || '—');
}

export type StatusTone = 'ok' | 'progress' | 'signed' | 'off' | 'bad';

/** How the status chip is coloured: running, on its way, closed, or called off. */
export function tenancyStatusTone(status: string): StatusTone {
  switch (status) {
    case 'active':
      return 'ok';
    case 'sent':
      return 'progress';
    case 'signed':
      return 'signed';
    case 'cancelled':
      return 'bad';
    default:
      return 'off';
  }
}

// ---- days and times ----

const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

/** 0 (Sunday) → 'א׳' … 6 → 'ש׳'. '' for anything that is not a weekday. */
export function hebrewDayLetter(day: number): string {
  return Number.isInteger(day) && day >= 0 && day <= 6 ? DAY_LETTERS[day] : '';
}

/** '17:00:00' → '17:00'. '' when there is no time. */
export function formatClock(time: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec((time ?? '').trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

/** The weekdays a slot repeats on, once each, Sunday first. Empty for a one-off rental. */
export function slotDays(slot: Pick<TenancySlot, 'weekly_repeat_days'>): number[] {
  const days = (slot.weekly_repeat_days ?? [])
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

type SlotTimes = Pick<TenancySlot, 'weekly_day_times' | 'start_time' | 'end_time'>;

/** A day's own hours when the calendar gave it some, else the slot's. */
function slotTimesOn(slot: SlotTimes, day: number): { start: string; end: string } {
  const own = slot.weekly_day_times?.[String(day) as keyof WeeklyDayTimes];
  return {
    start: formatClock(own?.start_time || slot.start_time),
    end: formatClock(own?.end_time || slot.end_time),
  };
}

function timeRange(start: string, end: string): string {
  return start && end ? `${start}–${end}` : start || end;
}

type SlotForSummary = Pick<
  TenancySlot,
  'name' | 'studio_name' | 'weekly_repeat_days' | 'weekly_day_times' | 'start_time' | 'end_time'
> & Partial<Pick<TenancySlot, 'event_type' | 'event_date'>>;

/** The weekday of a 'YYYY-MM-DD' date, 0 = Sunday as the calendar counts. Null without one. */
function weekdayOf(iso: string | null | undefined): number | null {
  const [year, month, day] = (iso ?? '').slice(0, 10).split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day).getDay() : null;
}

/**
 * "א׳ 17:00–19:00, ד׳ 18:00–20:00". A one-off rental is a date, not a weekday:
 * "6.9.2026 09:00–11:30". A weekly rental saved before the weekday list existed
 * runs on its first date's weekday.
 */
export function slotDayTimes(slot: Omit<SlotForSummary, 'name' | 'studio_name'>): string {
  const days = slotDays(slot);
  if (days.length === 0) {
    const hours = timeRange(formatClock(slot.start_time), formatClock(slot.end_time));
    if (slot.event_type === 'one_time') {
      return [formatDay(slot.event_date), hours].filter(Boolean).join(' ');
    }
    const anchor = weekdayOf(slot.event_date);
    if (anchor === null) return hours;
    return hours ? `${hebrewDayLetter(anchor)} ${hours}` : hebrewDayLetter(anchor);
  }
  return days
    .map((day) => {
      const { start, end } = slotTimesOn(slot, day);
      const range = timeRange(start, end);
      return range ? `${hebrewDayLetter(day)} ${range}` : hebrewDayLetter(day);
    })
    .join(', ');
}

/** "סטודיו 2 · א׳ 17:00–19:00, ד׳ 18:00–20:00" — the studio, or the rental's name when it has none. */
export function slotSummary(slot: SlotForSummary): string {
  const where = (slot.studio_name ?? '').trim() || (slot.name ?? '').trim();
  return [where, slotDayTimes(slot)].filter(Boolean).join(' · ') || '—';
}

function firstStart(slot: SlotForSummary): string {
  const [day] = slotDays(slot);
  return day === undefined ? formatClock(slot.start_time) : slotTimesOn(slot, day).start;
}

/** The week's order: the first day a slot runs on, then its first hour, then its line. */
export function compareSlots(a: SlotForSummary, b: SlotForSummary): number {
  const dayA = slotDays(a)[0] ?? 7;
  const dayB = slotDays(b)[0] ?? 7;
  if (dayA !== dayB) return dayA - dayB;
  const byTime = firstStart(a).localeCompare(firstStart(b));
  if (byTime !== 0) return byTime;
  return slotSummary(a).localeCompare(slotSummary(b), 'he');
}

export function sortSlots<T extends SlotForSummary>(slots: readonly T[]): T[] {
  return [...slots].sort(compareSlots);
}

/** Every slot of a tenancy on one line, in the week's order. '' when it has none. */
export function slotsSummary(slots: readonly SlotForSummary[]): string {
  return sortSlots(slots).map(slotSummary).join(' | ');
}

// ---- money ----

/** A decimal string or number from the API as a number. Anything unreadable is 0. */
export function toAmount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? '').replace(/[,\s₪]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** What was typed in an amount field. Null unless it is a non-negative amount with at most agorot. */
export function parseAmountInput(value: string): number | null {
  const cleaned = String(value ?? '').replace(/[,\s₪]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function roundAgorot(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Two decimals, as the API's decimal fields take an amount. */
export function toDecimalString(n: number): string {
  return roundAgorot(n).toFixed(2);
}

/** An amount as the amount field shows it: '1200', '1234.5'. '' when there is none. */
export function amountFieldValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return String(roundAgorot(toAmount(value)));
}

/** "₪1,200", or "₪1,180.5" — agorot only when there are some. */
export function formatShekels(value: string | number | null | undefined): string {
  return `₪${toAmount(value).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** The amount with VAT, to the agora — worked in whole agorot so no float drift reaches the screen. */
export function withVat(net: number): number {
  const agorot = Math.round(net * 100);
  const percent = Math.round(VAT_RATE * 100);
  return Math.round((agorot * (100 + percent)) / 100) / 100;
}

// ---- the agreement ----

export function isValidBillingDay(day: unknown): boolean {
  const n = typeof day === 'number' ? day : Number(day);
  return Number.isInteger(n) && n >= 1 && n <= 28;
}

/** "ב־1 לחודש". '—' when the day is missing or out of range. */
export function billingDayLabel(day: number | string | null | undefined): string {
  if (day === null || day === undefined || day === '') return '—';
  const n = Number(day);
  return isValidBillingDay(n) ? `ב־${n} לחודש` : '—';
}

/** '2026-09-01' → '1.9.2026', the invoices page's form. '' when there is no date. */
export function formatDay(iso: string | null | undefined): string {
  const [year, month, day] = (iso ?? '').slice(0, 10).split('-').map(Number);
  return year && month && day ? `${day}.${month}.${year}` : '';
}

/** "1.9.2026 – 31.8.2027", or the one end there is. */
export function contractRangeLabel(start: string | null | undefined, end: string | null | undefined): string {
  const from = formatDay(start);
  const to = formatDay(end);
  if (from && to) return `${from} – ${to}`;
  if (from) return `מ־${from}`;
  if (to) return `עד ${to}`;
  return '—';
}

/** A date as the date inputs and the API write it, in local time. */
export function isoDateOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

type SlotForMoney = Pick<TenancySlot, 'price_per_session' | 'weekly_repeat_days'>
  & Partial<Pick<TenancySlot, 'event_type' | 'is_active'>>;

/**
 * What these slots come to a month by the agreement's rule — the server's
 * suggested_monthly_amount, so the dialog and the import cards show one
 * number: the price per session × 4 for every weekday a weekly slot runs on,
 * one weekday when the calendar lists none (a weekly rental saved before the
 * list existed). A one-off rental is not monthly and adds nothing; neither
 * does an inactive slot.
 */
export function estimateMonthlyAmount(slots: readonly SlotForMoney[]): number {
  const total = slots.reduce((sum, slot) => {
    if (slot.is_active === false || slot.event_type === 'one_time') return sum;
    const weekdays = slotDays(slot).length || 1;
    return sum + toAmount(slot.price_per_session) * SESSIONS_PER_WEEKDAY_PER_MONTH * weekdays;
  }, 0);
  return roundAgorot(total);
}

/** "לפי המשבצות: ₪1,200". '' when there is nothing worth suggesting. */
export function suggestedAmountLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = toAmount(value);
  return n > 0 ? `לפי המשבצות: ${formatShekels(n)}` : '';
}

/** Whether applying the suggestion would change what the amount field holds. */
export function canApplySuggestion(suggested: number, current: string): boolean {
  if (!(suggested > 0)) return false;
  const typed = parseAmountInput(current);
  return typed === null || roundAgorot(typed) !== roundAgorot(suggested);
}

/** "₪120 לפעם". '' without a price. */
export function slotPriceLabel(slot: Pick<TenancySlot, 'price_per_session'>): string {
  const price = toAmount(slot.price_per_session);
  return price > 0 ? `${formatShekels(price)} לפעם` : '';
}

// ---- the tenant ----

export function tenantName(tenant: Partial<TenancyTenant> | null | undefined): string {
  const full = (tenant?.full_name ?? '').trim();
  if (full) return full;
  const joined = [tenant?.first_name, tenant?.last_name]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return joined || 'ללא שם';
}

/** The line under the name: the company number, else the ID number. */
export function tenantIdentifier(tenant: Partial<Pick<TenancyTenant, 'company_number' | 'id_number'>> | null | undefined): string {
  const company = (tenant?.company_number ?? '').trim();
  if (company) return `ח.פ ${company}`;
  const id = (tenant?.id_number ?? '').trim();
  return id ? `ת.ז ${id}` : '';
}

export const EMPTY_TENANT: TenantFields = {
  first_name: '',
  last_name: '',
  company_number: '',
  id_number: '',
  phone: '',
  email: '',
  address: '',
};

const TENANT_KEYS = Object.keys(EMPTY_TENANT) as Array<keyof TenantFields>;

export function tenantFieldsOf(tenant: Partial<TenancyTenant> | null | undefined): TenantFields {
  const fields = { ...EMPTY_TENANT };
  TENANT_KEYS.forEach((key) => {
    fields[key] = String(tenant?.[key] ?? '');
  });
  return fields;
}

export function trimTenant(fields: TenantFields): TenantFields {
  const trimmed = { ...EMPTY_TENANT };
  TENANT_KEYS.forEach((key) => {
    trimmed[key] = (fields[key] ?? '').trim();
  });
  return trimmed;
}

export function sameTenantFields(a: TenantFields, b: TenantFields): boolean {
  return TENANT_KEYS.every((key) => (a[key] ?? '').trim() === (b[key] ?? '').trim());
}

/**
 * A calendar renter's name as the tenant's two name fields. The second field
 * doubles as the business name, so a single word — usually a business — goes
 * there rather than into the first name.
 */
export function splitRenterName(name: string | null | undefined): Pick<TenantFields, 'first_name' | 'last_name'> {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { first_name: '', last_name: '' };
  if (words.length === 1) return { first_name: '', last_name: words[0] };
  return { first_name: words[0], last_name: words.slice(1).join(' ') };
}

/**
 * The calendar keeps one "ת.ז / ח.פ" field. Nine digits starting with 5 is the
 * shape of a company number (51…, 58… for an association); anything else is
 * taken as an ID. The office sees both fields and can move it.
 */
export function splitRenterIdNumber(value: string | null | undefined): Pick<TenantFields, 'company_number' | 'id_number'> {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { company_number: '', id_number: '' };
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === 9 && digits.startsWith('5')
    ? { company_number: trimmed, id_number: '' }
    : { company_number: '', id_number: trimmed };
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only the name is required: a business may have no first name, and a draft may not have the rest yet. */
export function tenantFieldErrors(fields: TenantFields): string[] {
  const errors: string[] = [];
  if (!fields.last_name.trim()) errors.push('יש להזין שם משפחה או שם העסק');
  const email = fields.email.trim();
  if (email && !EMAIL_SHAPE.test(email)) errors.push('כתובת המייל אינה תקינה');
  return errors;
}

// ---- the list ----

/** Active first, then by the tenant's name. Equal names keep the order they were made in. */
export function compareTenancies(a: Tenancy, b: Tenancy): number {
  const rank = (tenancy: Tenancy) => (tenancy.status === 'active' ? 0 : 1);
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  const byName = tenantName(a.tenant).localeCompare(tenantName(b.tenant), 'he');
  if (byName !== 0) return byName;
  const byCreated = (a.created_at ?? '').localeCompare(b.created_at ?? '');
  if (byCreated !== 0) return byCreated;
  return String(a.id).localeCompare(String(b.id));
}

export function sortTenancies(list: readonly Tenancy[]): Tenancy[] {
  return [...list].sort(compareTenancies);
}

export interface TenancyListFilters {
  branchId: string;
  status: string;
  search: string;
}

export const EMPTY_TENANCY_FILTERS: TenancyListFilters = { branchId: '', status: '', search: '' };

function digitsOf(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * The free text looks at the tenant, the branch, the notes and the slots. A
 * number — typed with or without its dashes — also finds the company number,
 * the ID or the phone.
 */
export function matchesTenancySearch(tenancy: Tenancy, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const text = [
    tenantName(tenancy.tenant),
    tenancy.tenant?.email,
    tenancy.branch_name,
    tenancy.notes,
    ...(tenancy.slots ?? []).flatMap((slot) => [slot.name, slot.studio_name]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (text.includes(query)) return true;
  const queryDigits = digitsOf(query);
  const onlyNumber = queryDigits.length >= 3 && queryDigits.length === query.replace(/[\s-]/g, '').length;
  if (!onlyNumber) return false;
  return [tenancy.tenant?.company_number, tenancy.tenant?.id_number, tenancy.tenant?.phone].some((value) =>
    digitsOf(value).includes(queryDigits),
  );
}

export function matchesTenancyFilters(tenancy: Tenancy, filters: TenancyListFilters): boolean {
  if (filters.branchId && tenancy.branch !== filters.branchId) return false;
  if (filters.status && tenancy.status !== filters.status) return false;
  return matchesTenancySearch(tenancy, filters.search);
}

export function countActiveTenancyFilters(filters: TenancyListFilters): number {
  return [filters.branchId, filters.status, filters.search.trim()].filter(Boolean).length;
}

export interface TenancyKpis {
  /** Tenancies whose status is active, in the branch chosen (or every branch in scope). */
  activeCount: number;
  /** Their monthly amounts before VAT, summed. */
  activeMonthlyNet: number;
  /** The same with VAT, as the server worked out each tenancy's. */
  activeMonthlyGross: number;
  /** Every tenancy in the branch, whatever its status. */
  totalCount: number;
  /** Studio rentals in the calendar that no tenancy holds. */
  unlinkedSlots: number;
  /** The renter groups those rentals fall into. */
  unlinkedGroups: number;
}

/**
 * The figures above the list. They follow the branch only: a status or a
 * search narrows the rows, but "how many are active" should not drop to zero
 * because drafts are being looked at.
 */
export function tenancyKpis(
  tenancies: readonly Tenancy[],
  suggestions: readonly TenancySuggestion[],
  branchId = '',
): TenancyKpis {
  const inBranch = tenancies.filter((tenancy) => !branchId || tenancy.branch === branchId);
  const active = inBranch.filter((tenancy) => tenancy.status === 'active');
  const groups = suggestions.filter((group) => (!branchId || group.branch === branchId) && (group.slots?.length ?? 0) > 0);
  return {
    activeCount: active.length,
    activeMonthlyNet: roundAgorot(active.reduce((sum, tenancy) => sum + toAmount(tenancy.monthly_amount), 0)),
    activeMonthlyGross: roundAgorot(active.reduce((sum, tenancy) => sum + toAmount(tenancy.monthly_total), 0)),
    totalCount: inBranch.length,
    unlinkedSlots: groups.reduce((sum, group) => sum + group.slots.length, 0),
    unlinkedGroups: groups.length,
  };
}

export interface FreeSlot {
  slot: TenancySlot;
  /** Who the calendar says rents it — a hint when choosing, nothing more. */
  renterName: string;
}

/** The calendar's rentals in a branch that no tenancy holds, from the suggestions, in the week's order. */
export function freeSlotsForBranch(suggestions: readonly TenancySuggestion[], branchId: string): FreeSlot[] {
  if (!branchId) return [];
  const bySlot = new Map<string, FreeSlot>();
  suggestions
    .filter((group) => group.branch === branchId)
    .forEach((group) => {
      (group.slots ?? []).forEach((slot) => {
        if (!bySlot.has(slot.id)) bySlot.set(slot.id, { slot, renterName: (group.renter_name ?? '').trim() });
      });
    });
  return [...bySlot.values()].sort((a, b) => compareSlots(a.slot, b.slot));
}

// ---- the tenancy dialog ----

export type TenantMode = 'new' | 'existing';

export interface AgreementForm {
  branch: string;
  status: TenancyStatus;
  monthlyAmount: string;
  billingDay: string;
  startDate: string;
  endDate: string;
  notes: string;
}

export interface TenancyFormState extends AgreementForm {
  /** Creating only: a new business customer, or one that exists. Editing edits the linked one in place. */
  tenantMode: TenantMode;
  /** The business customer chosen, in 'existing' mode. */
  existingTenantId: string;
  tenant: TenantFields;
  slotIds: string[];
}

export function emptyTenancyForm(branch = ''): TenancyFormState {
  return {
    tenantMode: 'new',
    existingTenantId: '',
    tenant: { ...EMPTY_TENANT },
    branch,
    status: 'draft',
    monthlyAmount: '',
    billingDay: '1',
    startDate: '',
    endDate: '',
    notes: '',
    slotIds: [],
  };
}

export function tenancyFormFrom(tenancy: Tenancy): TenancyFormState {
  return {
    tenantMode: 'new',
    existingTenantId: tenancy.tenant?.id ?? '',
    tenant: tenantFieldsOf(tenancy.tenant),
    branch: tenancy.branch ?? '',
    status: isTenancyStatus(tenancy.status) ? tenancy.status : 'draft',
    monthlyAmount: amountFieldValue(tenancy.monthly_amount),
    billingDay: isValidBillingDay(tenancy.billing_day) ? String(tenancy.billing_day) : '1',
    startDate: tenancy.start_date ?? '',
    endDate: tenancy.end_date ?? '',
    notes: tenancy.notes ?? '',
    slotIds: (tenancy.slots ?? []).map((slot) => slot.id),
  };
}

export function agreementErrors(
  form: Pick<AgreementForm, 'monthlyAmount' | 'billingDay' | 'startDate' | 'endDate'> & { branch?: string },
  { requireBranch = true }: { requireBranch?: boolean } = {},
): string[] {
  const errors: string[] = [];
  if (requireBranch && !form.branch) errors.push('יש לבחור סניף');
  if (!form.monthlyAmount.trim()) errors.push('יש להזין סכום חודשי לפני מע״מ (אפשר 0)');
  else if (parseAmountInput(form.monthlyAmount) === null) {
    errors.push('הסכום החודשי צריך להיות מספר חיובי, עד שתי ספרות אחרי הנקודה');
  }
  if (!isValidBillingDay(form.billingDay)) errors.push('יום החיוב צריך להיות בין 1 ל־28');
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    errors.push('תאריך הסיום מוקדם מתאריך ההתחלה');
  }
  return errors;
}

export function tenancyFormErrors(form: TenancyFormState, { editing = false }: { editing?: boolean } = {}): string[] {
  const errors: string[] = [];
  if (!editing && form.tenantMode === 'existing') {
    if (!form.existingTenantId) errors.push('יש לבחור לקוח עסקי קיים, או לעבור ל"שוכר חדש"');
  } else {
    errors.push(...tenantFieldErrors(form.tenant));
  }
  errors.push(...agreementErrors(form));
  return errors;
}

function agreementWrite(form: AgreementForm): TenancyAgreementWrite {
  return {
    branch: form.branch,
    status: form.status,
    monthly_amount: toDecimalString(parseAmountInput(form.monthlyAmount) ?? 0),
    billing_day: Number(form.billingDay),
    start_date: form.startDate || null,
    end_date: form.endDate || null,
    notes: form.notes.trim(),
  };
}

export function buildCreatePayload(form: TenancyFormState): TenancyCreatePayload {
  const agreement = agreementWrite(form);
  return form.tenantMode === 'existing'
    ? { tenant_id: form.existingTenantId, ...agreement }
    : { tenant: trimTenant(form.tenant), ...agreement };
}

/**
 * The PATCH body: what differs from the tenancy as saved, and nothing else.
 * The tenant goes only when one of its fields changed, so an edit of the
 * agreement never touches the business customer. Empty when nothing changed.
 */
export function buildUpdatePayload(form: TenancyFormState, saved: Tenancy): TenancyUpdatePayload {
  const next = agreementWrite(form);
  const patch: TenancyUpdatePayload = {};
  if (next.branch !== saved.branch) patch.branch = next.branch;
  if (next.status !== saved.status) patch.status = next.status;
  if (next.monthly_amount !== toDecimalString(toAmount(saved.monthly_amount))) patch.monthly_amount = next.monthly_amount;
  if (next.billing_day !== Number(saved.billing_day)) patch.billing_day = next.billing_day;
  if (next.start_date !== (saved.start_date || null)) patch.start_date = next.start_date;
  if (next.end_date !== (saved.end_date || null)) patch.end_date = next.end_date;
  if (next.notes !== (saved.notes ?? '').trim()) patch.notes = next.notes;
  const tenant = trimTenant(form.tenant);
  if (!sameTenantFields(tenant, tenantFieldsOf(saved.tenant))) patch.tenant = tenant;
  return patch;
}

/** Which slots to link and which to let go, against what the server holds. */
export function slotChanges(saved: readonly string[], selected: readonly string[]): { link: string[]; unlink: string[] } {
  const before = new Set(saved);
  const after = new Set(selected);
  return {
    link: [...after].filter((id) => !before.has(id)),
    unlink: [...before].filter((id) => !after.has(id)),
  };
}

// ---- connecting the existing rentals ----

export interface ImportCardState {
  key: string;
  /** Unchecked until the office confirms this group. */
  include: boolean;
  slotIds: string[];
  /** The business customer the renter's ID matched is kept as the tenant. */
  useExisting: boolean;
  existingTenant: ExistingTenantMatch | null;
  /** The new tenant's details, when not using the match. */
  tenant: TenantFields;
  monthlyAmount: string;
  billingDay: string;
  startDate: string;
  endDate: string;
  status: TenancyStatus;
}

/** These rentals run already: active, unless their agreement has ended. */
export function defaultImportStatus(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string,
): TenancyStatus {
  return end && end < today ? 'ended' : 'active';
}

export function importCardFromSuggestion(suggestion: TenancySuggestion, today: string): ImportCardState {
  const slots = suggestion.slots ?? [];
  const fromServer = suggestion.suggested_monthly_amount;
  const amount = fromServer !== null && fromServer !== undefined && fromServer !== ''
    ? toAmount(fromServer)
    : estimateMonthlyAmount(slots);
  return {
    key: suggestion.key,
    include: false,
    slotIds: slots.map((slot) => slot.id),
    useExisting: Boolean(suggestion.existing_tenant),
    existingTenant: suggestion.existing_tenant ?? null,
    tenant: {
      ...EMPTY_TENANT,
      ...splitRenterName(suggestion.renter_name),
      ...splitRenterIdNumber(suggestion.renter_id_number),
    },
    // No price means no suggestion: the office types the amount rather than confirm a zero.
    monthlyAmount: amount > 0 ? amountFieldValue(amount) : '',
    billingDay: '1',
    startDate: suggestion.contract_start_date ?? '',
    endDate: suggestion.contract_end_date ?? '',
    status: defaultImportStatus(suggestion.contract_start_date, suggestion.contract_end_date, today),
  };
}

/**
 * Fresh suggestions over cards already on screen: what the office typed on a
 * group still offered stays, a new group gets a card, and a group that went —
 * linked meanwhile — goes. The slots are always the server's.
 */
export function mergeImportCards(
  previous: readonly ImportCardState[],
  suggestions: readonly TenancySuggestion[],
  today: string,
): ImportCardState[] {
  const byKey = new Map(previous.map((card) => [card.key, card]));
  return suggestions.map((suggestion) => {
    const kept = byKey.get(suggestion.key);
    if (!kept) return importCardFromSuggestion(suggestion, today);
    const existingTenant = suggestion.existing_tenant ?? null;
    return {
      ...kept,
      slotIds: (suggestion.slots ?? []).map((slot) => slot.id),
      existingTenant,
      useExisting: kept.useExisting && Boolean(existingTenant),
    };
  });
}

export function importCardErrors(card: ImportCardState): string[] {
  const errors: string[] = [];
  if (card.slotIds.length === 0) errors.push('אין בקבוצה משבצות לחבר');
  if (card.useExisting) {
    if (!card.existingTenant?.id) errors.push('הלקוח הקיים לא נמצא');
  } else {
    errors.push(...tenantFieldErrors(card.tenant));
  }
  errors.push(...agreementErrors(card, { requireBranch: false }));
  return errors;
}

/** The import body: the included cards only, in their order on screen. */
export function buildImportPayload(cards: readonly ImportCardState[]): TenancyImportPayload {
  return {
    groups: cards
      .filter((card) => card.include)
      .map((card) => {
        const agreement = {
          slot_ids: [...card.slotIds],
          monthly_amount: toDecimalString(parseAmountInput(card.monthlyAmount) ?? 0),
          billing_day: Number(card.billingDay),
          start_date: card.startDate || null,
          end_date: card.endDate || null,
          status: card.status,
        };
        return card.useExisting && card.existingTenant
          ? { tenant_id: card.existingTenant.id, ...agreement }
          : { tenant: trimTenant(card.tenant), ...agreement };
      }),
  };
}

// ---- what the server said ----

const FIELD_LABELS: Record<string, string> = {
  tenant_id: 'שוכר',
  first_name: 'שם פרטי',
  last_name: 'שם משפחה / שם העסק',
  company_number: 'ח.פ',
  id_number: 'ת.ז',
  phone: 'טלפון',
  email: 'מייל',
  address: 'כתובת',
  branch: 'סניף',
  status: 'סטטוס',
  monthly_amount: 'סכום חודשי',
  billing_day: 'יום חיוב',
  start_date: 'תאריך התחלה',
  end_date: 'תאריך סיום',
  notes: 'הערות',
  slot_ids: 'משבצות',
  slot_id: 'משבצת',
};

/** Keys whose messages speak for themselves; a label in front would only add noise. */
const UNLABELLED_KEYS: ReadonlySet<string> = new Set(['error', 'detail', 'non_field_errors', 'tenant', 'groups']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectMessages(value: unknown, path: string[], out: string[], groupLabels: readonly string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) out.push(path.length ? `${path.join(' · ')}: ${text}` : text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectMessages(item, path, out, groupLabels));
    return;
  }
  if (!isPlainObject(value)) return;
  Object.entries(value).forEach(([key, item]) => {
    // An import's errors come back one entry per group, in the order sent.
    if (key === 'groups' && Array.isArray(item) && item.some(isPlainObject)) {
      item.forEach((group, index) => {
        collectMessages(group, [...path, groupLabels[index] || `קבוצה ${index + 1}`], out, groupLabels);
      });
      return;
    }
    const label = UNLABELLED_KEYS.has(key) ? '' : FIELD_LABELS[key] ?? key;
    collectMessages(item, label ? [...path, label] : path, out, groupLabels);
  });
}

/**
 * Every message in an error body — { error }, { detail } or DRF's field errors,
 * nested — each behind the Hebrew name of its field. An import's group errors
 * are named by `groupLabels`, in the order the groups were sent.
 */
export function apiErrorMessages(data: unknown, groupLabels: readonly string[] = []): string[] {
  const out: string[] = [];
  collectMessages(data, [], out, groupLabels);
  return [...new Set(out)];
}

/** The message to show for a failed request, or the fallback when the server gave nothing usable. */
export function tenancyApiError(err: unknown, fallback: string, groupLabels: readonly string[] = []): string {
  const response = (err as { response?: { status?: number; data?: unknown } } | null)?.response;
  if (!response) return fallback;
  if (response.status === 403) return 'אין הרשאה לפעולה הזאת';
  if (response.status === 404) return `${fallback} — לא נמצא בשרת`;
  const { data } = response;
  if (typeof data === 'string') {
    const text = data.trim();
    // An HTML error page from the server itself says nothing the office can act on.
    return !text || text.startsWith('<') ? fallback : text;
  }
  const messages = apiErrorMessages(data, groupLabels);
  return messages.length ? messages.join('\n') : fallback;
}

/**
 * No answer came back — a timeout or a dropped connection. The server may
 * have done it anyway, so trying again blind could make it twice.
 */
export function isUnknownOutcome(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const failure = err as { response?: unknown; request?: unknown; code?: string };
  if (failure.response) return false;
  return Boolean(failure.request) || ['ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK'].includes(failure.code ?? '');
}
