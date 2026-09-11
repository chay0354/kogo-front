import api from './api';
import { unwrapApiList } from '@/lib/scopedFilters';
import type { WeeklyDayTimes } from '@/types/schedule';

/**
 * The tenant path, phase 1: a tenancy is one business customer (the tenant)
 * in one branch, with its agreement — the monthly amount before VAT, the
 * billing day, the dates and a status — and the studio-rental slots of the
 * calendar that hang on it. Everything here lives under /rentals/tenancies/.
 */

export type TenancyStatus = 'draft' | 'sent' | 'signed' | 'active' | 'ended' | 'cancelled';

/** A studio rental in the calendar (a ScheduleEvent with is_studio_rental), as a tenancy holds it. */
export interface TenancySlot {
  id: string;
  name: string;
  studio_name: string;
  branch_name: string;
  /** 'weekly' repeats on weekly_repeat_days; a 'one_time' rental is its event_date alone. */
  event_type?: 'weekly' | 'one_time' | string;
  /** 'YYYY-MM-DD': a one-off rental's date, a weekly rental's first date. */
  event_date?: string | null;
  /**
   * 0 = Sunday … 6 = Saturday. Empty for a one-off rental — and for a weekly
   * rental saved before the list existed, which runs on event_date's weekday.
   */
  weekly_repeat_days: number[];
  /** Per-day times keyed '0'..'6'. A day missing here runs start_time–end_time. */
  weekly_day_times: WeeklyDayTimes;
  start_time: string | null;
  end_time: string | null;
  /** Decimal string, before VAT. */
  price_per_session: string | null;
  is_active: boolean;
  contract_start_date: string | null;
  contract_end_date: string | null;
}

/** The tenant: a business customer, which the server tags סוחרים. */
export interface TenancyTenant {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  company_number: string;
  id_number: string;
  phone: string;
  email: string;
  address: string;
}

export interface Tenancy {
  id: string;
  status: TenancyStatus;
  status_label: string;
  branch: string;
  branch_name: string;
  /** Decimal string, before VAT. */
  monthly_amount: string;
  /** Decimal string, with VAT. */
  monthly_total: string;
  /** 1–28, so every month has the day. */
  billing_day: number;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  created_at: string;
  /** What the linked slots come to a month, before VAT. */
  suggested_monthly_amount: string | null;
  tenant: TenancyTenant;
  slots: TenancySlot[];
}

/** A new tenant's details, as a write takes them. */
export interface TenantFields {
  first_name: string;
  last_name: string;
  company_number: string;
  id_number: string;
  phone: string;
  email: string;
  address: string;
}

/** The agreement half of a write. */
export interface TenancyAgreementWrite {
  branch: string;
  status: TenancyStatus;
  /** Decimal string, before VAT. */
  monthly_amount: string;
  billing_day: number;
  start_date: string | null;
  end_date: string | null;
  notes: string;
}

/** Who a new tenancy is for: an existing business customer, or a new one. */
export type TenancyTenantWrite = { tenant_id: string } | { tenant: TenantFields };

export type TenancyCreatePayload = TenancyTenantWrite & TenancyAgreementWrite;

/** A PATCH carries only what changed. */
export type TenancyUpdatePayload = Partial<TenancyAgreementWrite> & {
  tenant_id?: string;
  tenant?: TenantFields;
};

export interface TenancyFilters {
  branch?: string;
  status?: string;
  search?: string;
}

/** The business customer a group's renter ID already belongs to. */
export interface ExistingTenantMatch {
  id: string;
  full_name: string;
  company_number: string;
  id_number: string;
}

/**
 * Studio rentals no tenancy holds, grouped by the renter's ID and split by
 * branch. A rental without an ID is a group of its own.
 */
export interface TenancySuggestion {
  key: string;
  renter_name: string;
  renter_id_number: string;
  branch: string;
  branch_name: string;
  slots: TenancySlot[];
  suggested_monthly_amount: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  existing_tenant: ExistingTenantMatch | null;
}

export type TenancyImportGroup = TenancyTenantWrite & {
  slot_ids: string[];
  monthly_amount: string;
  billing_day: number;
  start_date: string | null;
  end_date: string | null;
  status: TenancyStatus;
};

export interface TenancyImportPayload {
  groups: TenancyImportGroup[];
}

const TENANCIES_URL = '/rentals/tenancies/';

function tenancyUrl(id: string): string {
  return `${TENANCIES_URL}${encodeURIComponent(id)}/`;
}

/** Only what is set goes on the query string, so a blank filter never narrows the list. */
export function tenancyQueryParams(filters: TenancyFilters = {}): Record<string, string> {
  const params: Record<string, string> = {};
  (['branch', 'status', 'search'] as const).forEach((key) => {
    const value = (filters[key] ?? '').trim();
    if (value) params[key] = value;
  });
  return params;
}

export async function fetchTenancies(filters?: TenancyFilters): Promise<Tenancy[]> {
  const res = await api.get(TENANCIES_URL, { params: tenancyQueryParams(filters) });
  return unwrapApiList<Tenancy>(res.data);
}

export async function fetchTenancy(id: string): Promise<Tenancy> {
  const res = await api.get(tenancyUrl(id));
  return res.data;
}

export async function createTenancy(payload: TenancyCreatePayload): Promise<Tenancy> {
  const res = await api.post(TENANCIES_URL, payload);
  return res.data;
}

export async function updateTenancy(id: string, payload: TenancyUpdatePayload): Promise<Tenancy> {
  const res = await api.patch(tenancyUrl(id), payload);
  return res.data;
}

/** Only a draft with no slots; anything else comes back 400 with a Hebrew `error`. */
export async function deleteTenancy(id: string): Promise<void> {
  await api.delete(tenancyUrl(id));
}

export async function linkTenancySlots(id: string, slotIds: string[]): Promise<void> {
  await api.post(`${tenancyUrl(id)}link-slots/`, { slot_ids: slotIds });
}

/** The slot stays in the calendar; it only stops belonging to this tenancy. */
export async function unlinkTenancySlot(id: string, slotId: string): Promise<void> {
  await api.post(`${tenancyUrl(id)}unlink-slot/`, { slot_id: slotId });
}

export async function fetchTenancySuggestions(): Promise<TenancySuggestion[]> {
  const res = await api.get(`${TENANCIES_URL}suggestions/`);
  return unwrapApiList<TenancySuggestion>(res.data);
}

/**
 * Create a tenancy for each confirmed group, all or nothing. It can be many
 * customers and tenancies in one transaction, so it gets longer than the
 * client's default wait.
 */
export async function importTenancies(payload: TenancyImportPayload): Promise<Tenancy[]> {
  const res = await api.post(`${TENANCIES_URL}import/`, payload, { timeout: 60000 });
  return unwrapApiList<Tenancy>(res.data);
}
