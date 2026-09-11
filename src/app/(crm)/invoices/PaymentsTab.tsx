'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileSearch, ShoppingBag, X } from 'lucide-react';
import RefundDialog from '@/components/dialogs/RefundDialog';
import { useAuth } from '@/components/AuthProvider';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import api, { fetchCourseTypesList, fetchInstructorsDropdown } from '@/lib/api';
import { fetchPaymentLedger, PAYMENTS_PAGE_SIZE } from '@/lib/documentsApi';
import { downloadStoreInvoicePdf, fetchAllInvoices } from '@/lib/storeApi';
import { unwrapApiList } from '@/lib/scopedFilters';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import type { StoreInvoice } from '@/types/store';
import BodyPortal from './BodyPortal';
import LedgerFilterBar, { LedgerSelect } from './LedgerFilterBar';
import type { LedgerFiltersState } from './useLedgerFilters';
import type { LedgerDimensions, LedgerFilters, PaymentLedgerItem, PaymentRecord } from './types';
import {
  CHARGE_KIND_OPTIONS,
  DELIVERY_FILTER,
  LEDGER_BUSINESS_ALL,
  LEDGER_BUSINESS_BRANCHES,
  LEDGER_BUSINESS_STORE,
} from './constants';
import {
  formatAmount,
  formatDate,
  formatHebrewMonth,
  getCurrentMonthTotal,
  getPaymentStatusClass,
  getPaymentStatusLabel,
  isWithinRange,
  ledgerRangeParams,
  localISODate,
  matchesBranchFilter,
  matchesLedgerFilters,
  matchesPaymentSearch,
  paymentToLedgerRow,
  storeContactLine,
  storeInvoiceToLedgerRow,
  widerRange,
  withBranchCity,
  type LedgerOption,
} from './utils';
import pageStyles from './invoices.module.css';
import styles from './paymentsTab.module.css';

// ---------------------------------------------------------------------------
// The rules of the tab — pure, so paymentsTab.test.ts can pin them down.
// ---------------------------------------------------------------------------

/**
 * One line of the list. A CRM charge carries the ledger dimensions the server
 * sends on every charge (business, city, course, age group, instructor); a
 * store purchase carries its branch, and its city is read off that branch.
 */
export type ChargeRow = PaymentRecord & LedgerDimensions;

/** The ledger row as the server sends it now: the charge and its dimensions. */
export type PaymentLedgerRow = PaymentLedgerItem & LedgerDimensions;

/** This tab's own fields, next to the shared ones. */
export interface PaymentsOwnFilters {
  kind: string;
  status: string;
}

/** The kinds the ledger endpoint filters by. חנות and משלוח מהאתר are store purchases, listed here instead. */
const SERVER_KINDS: ReadonlySet<string> = new Set(['standing_order', 'registration', 'trial', 'one_time']);

/**
 * סוג חיוב. משלוח מהאתר used to be a choice in the branch select; a website
 * order belongs to no branch, and the shared branch select lists branches
 * only, so it is the store's sub-kind here, right under חנות.
 */
export const PAYMENT_KIND_OPTIONS: ReadonlyArray<LedgerOption> = CHARGE_KIND_OPTIONS.flatMap((option) => (
  option.value === 'store'
    ? [option, { value: DELIVERY_FILTER, label: 'חנות · משלוח מהאתר' }]
    : [option]
));

export const PAYMENT_STATUS_OPTIONS: ReadonlyArray<LedgerOption> = [
  { value: 'completed', label: 'אושר' },
  { value: 'pending', label: 'ממתין' },
  { value: 'failed', label: 'נכשל' },
  { value: 'refunded', label: 'זוכה' },
];

/**
 * Whether the list is the store's purchases rather than the CRM charges: עסק
 * חנות (the ledger has no charges there), or סוג חיוב חנות / משלוח מהאתר.
 */
export function isStoreListing(business: string, kind: string): boolean {
  return business === LEDGER_BUSINESS_STORE || kind === 'store' || kind === DELIVERY_FILTER;
}

export type ChargeLedgerParams = NonNullable<Parameters<typeof fetchPaymentLedger>[0]>;

/**
 * The charges query, as the ledger endpoint takes it. Every shared filter goes
 * to the server — the list is paginated, so narrowing the page in hand would
 * hide rows that sit on other pages. Nothing unset is sent. The page is added
 * by the caller.
 */
export function chargeLedgerParams(filters: LedgerFilters, own: PaymentsOwnFilters): ChargeLedgerParams {
  const params: ChargeLedgerParams = { ...ledgerRangeParams(filters) };
  const optional: Array<[keyof ChargeLedgerParams, string]> = [
    ['search', filters.search.trim()],
    ['status', own.status],
    ['kind', SERVER_KINDS.has(own.kind) ? own.kind : ''],
    ['business', filters.business],
    ['city', filters.cityId],
    ['branch', filters.branchId],
    ['course_type', filters.courseTypeId],
    ['age', filters.ageKey],
    ['instructor', filters.instructorId],
  ];
  optional.forEach(([key, value]) => {
    if (value) (params as Record<string, string>)[key] = value;
  });
  return params;
}

/** The same query asked only for its totals: one row, page one. */
export function chargeCountParams(params: ChargeLedgerParams): ChargeLedgerParams {
  return { ...params, page: 1, page_size: 1 };
}

/**
 * How many refunded charges the זוכו figure shows, when the query already
 * says: a status filter of refunded makes it the whole count, any other status
 * makes it none. Null means it has to be asked for.
 */
export function knownRefundedCount(status: string, count: number): number | null {
  if (!status) return null;
  return status === 'refunded' ? count : 0;
}

/**
 * The days behind the server's month_total: this calendar month, inside the
 * range. Null when the range does not reach this month at all — the figure
 * would be a zero that means nothing.
 */
export function currentMonthWindow(
  filters: Pick<LedgerFilters, 'dateFrom' | 'dateTo'>,
  today: string,
): { from: string; to: string } | null {
  const { start_date: start, end_date: end } = ledgerRangeParams(filters);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = start > monthStart ? start : monthStart;
  const to = end < today ? end : today;
  return from <= to ? { from, to } : null;
}

/** A charge from the ledger, with the dimensions it arrived with. */
export function toChargeRow(item: PaymentLedgerRow): ChargeRow {
  return {
    ...paymentToLedgerRow(item),
    business_id: item.business_id,
    business_name: item.business_name,
    city_id: item.city_id,
    city_name: item.city_name,
    course_id: item.course_id,
    course_name: item.course_name,
    course_type_id: item.course_type_id,
    course_type_name: item.course_type_name,
    age_key: item.age_key,
    age_label: item.age_label,
    instructor_id: item.instructor_id,
    instructor_name: item.instructor_name,
  };
}

/** A store purchase as a row: a website order or a counter sale, in its branch's city. */
export function toStoreRow(invoice: StoreInvoice, cityByBranch: ReadonlyMap<string, string>): ChargeRow {
  return withBranchCity<ChargeRow>(
    {
      ...storeInvoiceToLedgerRow(invoice),
      origin: invoice.website_order_number ? 'store_website' : 'store_counter',
    },
    cityByBranch,
  );
}

/**
 * Whether a store purchase passes the filters (the range is checked apart, so
 * the result line can count what the range holds).
 *
 * עסק חנות and כל ההכנסות keep every purchase. Under סניפים the city and the
 * branch narrow the purchases to that place — a store row has a branch only,
 * and its city comes from it. A business id keeps none: a store sale is tagged
 * to no business. סוג חוג, גיל and מדריך are matched as on every tab, so a
 * purchase, which has none of them, does not pass while one is set.
 */
export function matchesStoreRow(row: ChargeRow, filters: LedgerFilters, own: PaymentsOwnFilters): boolean {
  const business = filters.business === LEDGER_BUSINESS_BRANCHES ? LEDGER_BUSINESS_ALL : filters.business;
  if (!matchesLedgerFilters(row, { ...filters, business })) return false;
  if (own.kind === DELIVERY_FILTER) {
    if (!matchesBranchFilter(row, DELIVERY_FILTER)) return false;
  } else if (own.kind && own.kind !== 'store') {
    return false;
  }
  if (own.status && row.status !== own.status) return false;
  return matchesPaymentSearch(row, filters.search);
}

/** Why a filter in force can never match a store purchase — said in the empty state. '' when none does. */
export function storeFilterConflict(filters: LedgerFilters, own: PaymentsOwnFilters): string {
  const { business } = filters;
  if (business && business !== LEDGER_BUSINESS_BRANCHES && business !== LEDGER_BUSINESS_STORE) {
    return 'רכישה בחנות אינה משויכת לעסק, ולכן סינון לפי עסק מסתיר את כולן.';
  }
  if (filters.courseTypeId || filters.ageKey || filters.instructorId) {
    return 'לרכישה בחנות אין סוג חוג, גיל או מדריך, ולכן סינון לפיהם מסתיר את כולן.';
  }
  if (own.kind === DELIVERY_FILTER && (filters.branchId || filters.cityId)) {
    return 'הזמנת משלוח מהאתר אינה שייכת לסניף, ולכן סינון לפי עיר או סניף מסתיר את כולן.';
  }
  if (own.kind && own.kind !== 'store' && own.kind !== DELIVERY_FILTER) {
    return 'סוג החיוב שנבחר אינו רכישה בחנות.';
  }
  return '';
}

function timeOf(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Newest first by the charge date. A tie falls back to the invoice number,
 * highest first with digits compared as numbers, so the order is stable; a row
 * without a date goes last.
 */
export function compareChargesNewestFirst(a: PaymentRecord, b: PaymentRecord): number {
  const ta = timeOf(a.created_at);
  const tb = timeOf(b.created_at);
  if (ta !== tb) return ta < tb ? 1 : -1;
  return String(b.invoice_number || b.id).localeCompare(String(a.invoice_number || a.id), 'he', { numeric: true });
}

/** The class and its instructor, for the line under the customer's name. */
export function courseLine(row: ChargeRow): string {
  return [row.course_name, row.instructor_name].filter(Boolean).join(' · ');
}

/**
 * What the charge was for, without what the row already says: the customer's
 * name is in its own column and the class sits under it, so a charge's
 * description drops those parts rather than repeat them. A store purchase
 * keeps its description whole.
 */
export function chargeDescription(row: ChargeRow): string {
  if (row.source !== 'payment') return row.description;
  const shown = new Set(
    [row.customer_name, row.course_name].map((part) => (part ?? '').trim()).filter(Boolean),
  );
  if (shown.size === 0) return row.description;
  return row.description
    .split(' · ')
    .filter((part) => !shown.has(part.trim()))
    .join(' · ');
}

export interface CourseTypeListItem {
  id: string | number;
  name?: string | null;
  is_active?: boolean;
}

export interface InstructorListItem {
  id: string | number;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/**
 * The full lists of course types and instructors, as rows the filter bar reads
 * its options from. The list is paginated, so the page in hand would offer
 * only the classes and instructors that happen to be on it. A retired course
 * type is left out; a row that still names one adds it back.
 */
export function optionRowsFromLists(
  courseTypes: readonly CourseTypeListItem[],
  instructors: readonly InstructorListItem[],
): LedgerDimensions[] {
  const types = courseTypes
    .filter((type) => type && type.id != null && type.is_active !== false && (type.name ?? '').trim())
    .map((type) => ({ course_type_id: String(type.id), course_type_name: String(type.name).trim() }));
  const people = instructors
    .filter((person) => person && person.id != null)
    .map((person) => ({
      instructor_id: String(person.id),
      instructor_name: (person.full_name || `${person.first_name ?? ''} ${person.last_name ?? ''}`).trim(),
    }))
    .filter((person) => person.instructor_name);
  return [...types, ...people];
}

export function pageCountFor(count: number): number {
  return Math.max(1, Math.ceil(count / PAYMENTS_PAGE_SIZE));
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** A search typed letter by letter, or a date typed digit by digit, asks once. */
const REQUEST_DELAY_MS = 300;

interface ChargeTotals {
  count: number;
  monthTotal: number;
  pending: number;
}

const NO_CHARGE_ROWS: ChargeRow[] = [];

interface ChargePageState {
  /** The query and page these rows answer. While it differs from the one asked, no stale row is shown. */
  key: string;
  /** The query alone — its totals hold on every page of it. */
  queryKey: string;
  rows: ChargeRow[];
  totals: ChargeTotals | null;
  error: string;
}

/**
 * One page of the CRM charges for a query, from the server. A new query waits
 * a moment first; another page of the same query, or a retry, goes at once.
 * An answer that arrives after a newer request went out is dropped rather
 * than painted over it. A null query asks nothing — the store is listed.
 */
function useChargePage(query: ChargeLedgerParams | null, page: number) {
  const [attempt, setAttempt] = useState(0);
  const queryKey = query ? JSON.stringify(query) : '';
  const key = query ? `${queryKey}#${page}#${attempt}` : '';
  const [state, setState] = useState<ChargePageState>({
    key: '',
    queryKey: '',
    rows: NO_CHARGE_ROWS,
    totals: null,
    error: '',
  });
  const latest = useRef(0);

  useEffect(() => {
    if (!query) return undefined;
    const request = ++latest.current;
    const delay = state.queryKey === queryKey ? 0 : REQUEST_DELAY_MS;
    const timer = window.setTimeout(() => {
      fetchPaymentLedger({ ...query, page, page_size: PAYMENTS_PAGE_SIZE })
        .then((data) => {
          if (request !== latest.current) return;
          setState({
            key,
            queryKey,
            rows: (data.results as PaymentLedgerRow[]).map(toChargeRow),
            totals: { count: data.count, monthTotal: data.month_total, pending: data.pending_count },
            error: '',
          });
        })
        .catch((error) => {
          if (request !== latest.current) return;
          console.error('Error loading payments:', error);
          setState({ key, queryKey, rows: NO_CHARGE_ROWS, totals: null, error: 'שגיאה בטעינת החיובים.' });
        });
    }, delay);
    return () => window.clearTimeout(timer);
    // `key` is the query, the page and the attempt; `query` is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // An answer still on its way when the tab closes has nowhere to go.
  useEffect(() => () => {
    latest.current += 1;
  }, []);

  // The refund flow as it always was: the row turns זוכה and loses its button.
  const markRefunded = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, status: 'refunded', canRefund: false } : row)),
    }));
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const exact = query !== null && state.key === key;
  const sameQuery = query !== null && state.queryKey === queryKey;
  return {
    rows: exact ? state.rows : NO_CHARGE_ROWS,
    error: exact ? state.error : '',
    loading: query !== null && !exact,
    // The totals do not change with the page, so paging keeps the figures on screen.
    totals: sameQuery ? state.totals : null,
    totalsLoading: query !== null && !sameQuery,
    markRefunded,
    retry,
  };
}

/**
 * The totals of a query without its rows — one row, page one. Behind the
 * figures the page request does not answer: the refunded count and the range
 * before any narrowing. `version` asks the same query again (after a refund).
 */
function useChargeTotals(params: ChargeLedgerParams | null, version = 0) {
  const key = params ? `${JSON.stringify(params)}#${version}` : '';
  const [state, setState] = useState<{ key: string; totals: ChargeTotals | null }>({ key: '', totals: null });
  const latest = useRef(0);

  useEffect(() => {
    if (!params) return undefined;
    const request = ++latest.current;
    const timer = window.setTimeout(() => {
      fetchPaymentLedger(chargeCountParams(params))
        .then((data) => {
          if (request !== latest.current) return;
          setState({ key, totals: { count: data.count, monthTotal: data.month_total, pending: data.pending_count } });
        })
        .catch((error) => {
          if (request !== latest.current) return;
          console.error('Error loading payment totals:', error);
          setState({ key, totals: null });
        });
    }, REQUEST_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => {
    latest.current += 1;
  }, []);

  const current = params !== null && state.key === key;
  return { totals: current ? state.totals : null, loading: params !== null && !current };
}

type StoreLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The store's invoices, asked for once — the first time the store is listed —
 * and kept, as before: the list arrives in one piece and is filtered here.
 */
function useStoreInvoices(active: boolean) {
  const [invoices, setInvoices] = useState<StoreInvoice[]>([]);
  const [load, setLoad] = useState<StoreLoad>('idle');
  const [attempt, setAttempt] = useState(0);
  const requested = useRef(false);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    setLoad('loading');
    fetchAllInvoices()
      .then((data) => {
        setInvoices(Array.isArray(data) ? data : []);
        setLoad('ready');
      })
      .catch((error) => {
        console.error('Error loading store invoices:', error);
        requested.current = false;
        setLoad('error');
      });
  }, [active, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    invoices,
    setInvoices,
    loading: active && (load === 'idle' || load === 'loading'),
    failed: load === 'error',
    retry,
  };
}

/**
 * Every course type and instructor, for the bar's סוג חוג and מדריך. Both are
 * cached queries; the course types share the dashboard's cache. A role that
 * may not read them (403) is left with what the rows name.
 */
function useListOptionRows() {
  const { user } = useAuth();
  const courseTypesQuery = useQuery({
    queryKey: ['course-types-list'],
    queryFn: fetchCourseTypesList,
    enabled: Boolean(user),
    retry: false,
  });
  const instructorsQuery = useQuery({
    queryKey: ['instructors-dropdown'],
    queryFn: fetchInstructorsDropdown,
    enabled: Boolean(user),
    retry: false,
  });

  const optionRows = useMemo(
    () => optionRowsFromLists(
      unwrapApiList<CourseTypeListItem>(courseTypesQuery.data),
      unwrapApiList<InstructorListItem>(instructorsQuery.data),
    ),
    [courseTypesQuery.data, instructorsQuery.data],
  );

  return { optionRows, loading: courseTypesQuery.isLoading || instructorsQuery.isLoading };
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

const TABLE_COLUMNS = 8;

interface PaymentsTabProps {
  /** The page's shared filters (useLedgerFilters). */
  ledger: LedgerFiltersState;
}

/**
 * תשלומים — every CRM charge in a date range (הרשמה, הוראת קבע, שיעור ניסיון,
 * חד-פעמי), newest first, with what it was for and a refund where the charge
 * allows one; and the store's purchases, when the store is chosen.
 *
 * The charges are paginated on the server, so every filter — the page's
 * shared ones and the tab's own two — is part of the query. The store's
 * invoices arrive in one piece and are narrowed here by the same rules.
 */
export default function PaymentsTab({ ledger }: PaymentsTabProps) {
  const { filters } = ledger;
  const { branches } = useScopedBranches();
  const { optionRows, loading: optionsLoading } = useListOptionRows();

  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [refundTarget, setRefundTarget] = useState<ChargeRow | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  // Refunds made while this query is shown: its figures are asked again after each.
  const [refunds, setRefunds] = useState({ queryKey: '', n: 0 });

  const ownFields = useMemo<PaymentsOwnFilters>(() => ({ kind, status }), [kind, status]);
  const storeListing = isStoreListing(filters.business, kind);
  const extraActiveCount = (kind ? 1 : 0) + (status ? 1 : 0);
  const narrowed = ledger.activeCount + extraActiveCount > 0;

  const query = useMemo(() => chargeLedgerParams(filters, ownFields), [filters, ownFields]);
  const queryKey = JSON.stringify(query);
  // A refund refreshes the figures of the query it was made on. A query shown
  // again later is asked afresh, not handed those older figures.
  useEffect(() => {
    setRefunds((prev) => (prev.n === 0 ? prev : { queryKey: '', n: 0 }));
  }, [queryKey]);
  // Any change to what is listed goes back to page one.
  const listKey = `${storeListing ? 'store' : 'charges'}|${kind}|${queryKey}`;
  const [pageState, setPageState] = useState({ listKey, page: 1 });
  const requestedPage = pageState.listKey === listKey ? pageState.page : 1;

  // ---- the CRM charges, a page at a time from the server ----
  const charges = useChargePage(storeListing ? null : query, requestedPage);
  const refreshN = refunds.queryKey === queryKey ? refunds.n : 0;
  const refreshed = useChargeTotals(!storeListing && refreshN > 0 ? query : null, refreshN);
  const refundedQuery = useChargeTotals(!storeListing && !status ? { ...query, status: 'refunded' } : null, refreshN);
  const rangeQuery = useChargeTotals(!storeListing && narrowed ? ledgerRangeParams(filters) : null);

  // ---- the store's purchases, one list narrowed here ----
  const store = useStoreInvoices(storeListing);
  // A store row names its branch only; the branch says which city it is in.
  const cityByBranch = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      if (branch.city) map.set(branch.id, String(branch.city));
    });
    return map;
  }, [branches]);
  const storeInRange = useMemo(
    () => store.invoices
      .map((invoice) => toStoreRow(invoice, cityByBranch))
      .filter((row) => isWithinRange(row.created_at, filters)),
    [store.invoices, cityByBranch, filters],
  );
  const storeVisible = useMemo(
    () => storeInRange.filter((row) => matchesStoreRow(row, filters, ownFields)).sort(compareChargesNewestFirst),
    [storeInRange, filters, ownFields],
  );
  const storeReady = storeListing && !store.loading && !store.failed;

  // ---- one view of whichever list is shown ----
  const totals: ChargeTotals | null = storeListing
    ? storeReady
      ? {
        count: storeVisible.length,
        monthTotal: getCurrentMonthTotal(storeVisible),
        pending: storeVisible.filter((row) => row.status === 'pending' || row.status === 'processing').length,
      }
      : null
    : refreshed.totals ?? charges.totals;
  const totalsLoading = storeListing ? store.loading : charges.totalsLoading;
  const rowsLoading = storeListing ? store.loading : charges.loading;
  const listFailed = storeListing ? store.failed : Boolean(charges.error);
  const count = totals?.count ?? 0;
  const pageCount = pageCountFor(count);
  const page = storeListing ? Math.min(requestedPage, pageCount) : requestedPage;
  const rows = storeListing
    ? storeVisible.slice((page - 1) * PAYMENTS_PAGE_SIZE, page * PAYMENTS_PAGE_SIZE)
    : charges.rows;
  const refundedCount = !totals
    ? null
    : storeListing
      ? storeVisible.filter((row) => row.status === 'refunded').length
      : knownRefundedCount(status, totals.count) ?? refundedQuery.totals?.count ?? null;
  const refundedLoading = !storeListing && !status && refundedQuery.loading;
  // What the range holds before any narrowing — the "מתוך" of the figures and the result line.
  const rangeCount = storeListing
    ? storeReady ? storeInRange.length : null
    : narrowed ? rangeQuery.totals?.count ?? null : totals?.count ?? null;

  const today = localISODate();
  const monthWindow = currentMonthWindow(filters, today);
  const range = ledgerRangeParams(filters);
  const rangeLabel = `${formatDate(range.start_date)} — ${formatDate(range.end_date)}`;
  const wider = widerRange(filters);
  const listTitle = storeListing
    ? kind === DELIVERY_FILTER ? 'הזמנות משלוח מהאתר' : 'רכישות בחנות'
    : 'רשימת החיובים';
  const noun = storeListing ? 'רכישות' : 'חיובים';

  // סוג חוג and מדריך offer the full lists; the page's rows add the age groups
  // and anything the lists do not hold.
  const barRows = useMemo(
    () => (charges.rows.length > 0 ? [...optionRows, ...charges.rows] : optionRows),
    [optionRows, charges.rows],
  );

  function goToPage(next: number) {
    setPageState({ listKey, page: next });
  }

  function clearTabFields() {
    setKind('');
    setStatus('');
  }

  function clearAllFilters() {
    ledger.reset();
    clearTabFields();
  }

  function widenRange() {
    if (wider) ledger.setFilter('dateFrom', wider.dateFrom);
  }

  async function handleRefundConfirm(amount: number | null, reason: string) {
    if (!refundTarget) return;
    setRefundLoading(true);
    try {
      const endpoint = refundTarget.source === 'payment'
        ? `/customers/payments/${refundTarget.id}/refund/`
        : `/store/invoices/${refundTarget.id}/refund/`;
      await api.post(endpoint, { amount, reason });
      if (refundTarget.source === 'payment') {
        charges.markRefunded(refundTarget.id);
        setRefunds((prev) => ({ queryKey, n: prev.queryKey === queryKey ? prev.n + 1 : 1 }));
      } else {
        store.setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === refundTarget.id
              ? { ...inv, payment_status: 'refunded' }
              : inv,
          ),
        );
      }
      setRefundTarget(null);
    } catch (error: unknown) {
      const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
      window.alert(data?.error || 'שגיאה בביצוע הזיכוי');
    } finally {
      setRefundLoading(false);
    }
  }

  async function handleDownload(row: ChargeRow) {
    if (!row.store_invoice_id) return;
    setDownloadingId(row.id);
    setActionError('');
    try {
      await downloadStoreInvoicePdf(row.store_invoice_id, row.invoice_number || 'order');
    } catch {
      setActionError('הורדת הקובץ נכשלה');
    } finally {
      setDownloadingId(null);
    }
  }

  function renderRow(row: ChargeRow): ReactNode {
    const statusLabel = getPaymentStatusLabel(row.status);
    const course = row.source === 'payment' ? courseLine(row) : '';
    const contact = row.source === 'store' ? storeContactLine(row) : '';
    const description = chargeDescription(row);
    const hasPdf = row.source === 'store' && Boolean(row.store_invoice_id);

    return (
      <tr key={`${row.source}-${row.id}`}>
        <td>{row.created_at ? formatDate(row.created_at) : '—'}</td>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{row.customer_name || '—'}</span>
          {course && <span className={styles.subLine}>{course}</span>}
          {contact && <span className={styles.contactLine}>{contact}</span>}
        </td>
        <td className={styles.chargeCell}>
          <span className={`${theme.tag} ${theme.tagType}`}>{row.kind_label}</span>
          {description && <span className={styles.description}>{description}</span>}
        </td>
        <td className={`${theme.n} ${styles.money}`}>{formatAmount(row.amount)}</td>
        <td className={styles.muted}>{row.payment_method || 'אשראי'}</td>
        <td className={styles.reference}>{row.transaction_reference || '—'}</td>
        <td>
          <span className={`${pageStyles.statusBadge} ${getPaymentStatusClass(row.status)}`} aria-label={statusLabel}>
            {statusLabel}
          </span>
        </td>
        <td>
          <div className={styles.actions}>
            {hasPdf && (
              <button
                type="button"
                className={styles.iconBtn}
                title="הורד PDF"
                aria-label={`הורדת PDF של הזמנה ${row.invoice_number}`}
                disabled={downloadingId === row.id}
                onClick={() => void handleDownload(row)}
              >
                <Download size={16} aria-hidden="true" />
              </button>
            )}
            {row.canRefund ? (
              <button type="button" className={styles.refundBtn} onClick={() => setRefundTarget(row)}>
                זיכוי
              </button>
            ) : (
              !hasPdf && <span className={styles.dash}>—</span>
            )}
          </div>
        </td>
      </tr>
    );
  }

  function renderList(): ReactNode {
    if (rowsLoading) {
      return (
        <TableSkeleton
          columns={TABLE_COLUMNS}
          tableClassName={theme.table}
          label={storeListing ? 'טוען רכישות בחנות' : 'טוען תשלומים'}
        />
      );
    }

    if (listFailed) {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title={storeListing ? 'לא הצלחנו לטעון את רכישות החנות' : 'לא הצלחנו לטעון את החיובים'}
          text={
            storeListing
              ? 'אפשר לנסות שוב בעוד רגע.'
              : `${charges.error} אפשר לנסות שוב; אם זה חוזר, נסו טווח תאריכים קצר יותר.`
          }
        >
          <button
            type="button"
            className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`}
            onClick={storeListing ? store.retry : charges.retry}
          >
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (rows.length === 0) {
      const rangeEmpty = storeListing ? storeInRange.length === 0 : !narrowed || rangeCount === 0;
      if (rangeEmpty) {
        return (
          <EmptyPanel
            icon={
              storeListing
                ? <ShoppingBag className={styles.emptyIcon} aria-hidden="true" />
                : <FileSearch className={styles.emptyIcon} aria-hidden="true" />
            }
            title={storeListing ? 'אין רכישות בחנות בטווח הזה' : 'אין חיובים בטווח הזה'}
            text={`בין ${formatDate(range.start_date)} ל-${formatDate(range.end_date)} ${
              storeListing ? 'לא נרשמו רכישות בחנות' : 'לא נרשמו חיובים'
            }. ${wider ? 'הרחיבו את הטווח, או בחרו' : 'בחרו'} תאריכים אחרים בשדות למעלה.`}
          >
            {wider && (
              <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={widenRange}>
                {wider.label}
              </button>
            )}
          </EmptyPanel>
        );
      }

      const hidden = rangeCount !== null
        ? `בטווח יש ${rangeCount.toLocaleString('he-IL')} ${noun}, אבל הסינון שנבחר מסתיר את ${storeListing ? 'כולן' : 'כולם'}.`
        : `הסינון שנבחר מסתיר את כל ה${noun} בטווח.`;
      const conflict = storeListing ? storeFilterConflict(filters, ownFields) : '';
      const wayOut = `נקו את הסינון${wider ? ' או הרחיבו את הטווח' : ''} כדי לראות ${storeListing ? 'אותן' : 'אותם'}.`;
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title={storeListing ? 'אף רכישה לא מתאימה לסינון' : 'אף חיוב לא מתאים לסינון'}
          text={[hidden, conflict, wayOut].filter(Boolean).join(' ')}
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={clearAllFilters}>
            נקה סינון
          </button>
          {wider && (
            <button type="button" className={styles.emptyBtn} onClick={widenRange}>
              {wider.label}
            </button>
          )}
        </EmptyPanel>
      );
    }

    return (
      <div className={theme.tableScroll}>
        <table className={`${theme.table} ${styles.table}`}>
          <caption className={styles.srOnly}>
            {listTitle} בין {rangeLabel}, מהחדש לישן
          </caption>
          <thead>
            <tr>
              <th scope="col">תאריך</th>
              <th scope="col">לקוח</th>
              <th scope="col">על מה החיוב</th>
              <th scope="col" className={theme.n}>סכום</th>
              <th scope="col">אמצעי</th>
              <th scope="col">אסמכתא</th>
              <th scope="col">סטטוס</th>
              <th scope="col" className={theme.n}>פעולות</th>
            </tr>
          </thead>
          <tbody>{rows.map(renderRow)}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.tab}>
      <div className={`${theme.grid} ${theme.g4} ${styles.kpis}`}>
        <Kpi
          label={storeListing ? 'רכישות בטווח' : 'חיובים בטווח'}
          loading={totalsLoading}
          value={totals ? count.toLocaleString('he-IL') : '—'}
          foot={
            narrowed && rangeCount !== null
              ? `מתוך ${rangeCount.toLocaleString('he-IL')} · ${rangeLabel}`
              : rangeLabel
          }
        />
        <Kpi
          label="נגבה החודש"
          loading={totalsLoading}
          value={monthWindow && totals ? formatAmount(totals.monthTotal) : '—'}
          foot={
            monthWindow
              ? `אושרו ${formatDate(monthWindow.from)} — ${formatDate(monthWindow.to)}`
              : `הטווח לא כולל את ${formatHebrewMonth(today)}`
          }
        />
        <Kpi
          label="ממתינים"
          loading={totalsLoading}
          value={totals ? totals.pending.toLocaleString('he-IL') : '—'}
          foot="ממתינים לאישור או בעיבוד"
        />
        <Kpi
          label="זוכו"
          loading={totalsLoading || refundedLoading}
          value={refundedCount === null ? '—' : refundedCount.toLocaleString('he-IL')}
          foot={`${noun} שזוכו, לפי הסינון`}
        />
      </div>

      <LedgerFilterBar
        ledger={ledger}
        rows={barRows}
        rowsLoading={optionsLoading || charges.loading}
        searchPlaceholder={storeListing ? 'לקוח, טלפון, מספר הזמנה, כתובת…' : 'שם הילד או המשפחה…'}
        extraActiveCount={extraActiveCount}
        onClearExtra={clearTabFields}
        result={
          totals && rangeCount !== null && !totalsLoading
            ? { shown: count, total: rangeCount, noun: storeListing ? 'רכישות בחנות בטווח' : 'חיובים בטווח' }
            : undefined
        }
        idPrefix="payments"
      >
        <LedgerSelect
          id="payments-kind"
          label="סוג חיוב"
          value={kind}
          onChange={setKind}
          options={PAYMENT_KIND_OPTIONS}
          allLabel="כל סוגי החיוב"
        />
        <LedgerSelect
          id="payments-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={PAYMENT_STATUS_OPTIONS}
          allLabel="כל הסטטוסים"
        />
      </LedgerFilterBar>

      <section className={theme.card} aria-labelledby="payments-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="payments-list-title" className={theme.cardTitle}>
              {listTitle}
            </h2>
            <p className={styles.cardSub}>{rangeLabel} · מהחדש לישן</p>
          </div>
          {/* The charges come from the CRM; the store's purchases are another
              list, so say where to find them. */}
          {!storeListing && (
            <p className={styles.cardHint}>
              <ShoppingBag size={14} aria-hidden="true" />
              <span>
                רכישות בחנות מופיעות בבחירת <b>חנות</b> בעסק או בסוג החיוב
              </span>
            </p>
          )}
        </div>

        {actionError && (
          <div className={styles.notice} role="alert">
            <span>{actionError}</span>
            <button
              type="button"
              className={styles.noticeClose}
              onClick={() => setActionError('')}
              aria-label="סגירת ההודעה"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {renderList()}

        {totals && !listFailed && count > PAYMENTS_PAGE_SIZE && (
          <nav className={styles.pager} aria-label="עמודי הרשימה">
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page <= 1 || rowsLoading}
              onClick={() => goToPage(Math.max(1, page - 1))}
            >
              <ChevronRight size={15} aria-hidden="true" />
              הקודם
            </button>
            <span className={styles.pagerStatus}>
              עמוד <b>{page}</b> מתוך <b>{pageCount}</b> · {count.toLocaleString('he-IL')} {noun}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page >= pageCount || rowsLoading}
              onClick={() => goToPage(page + 1)}
            >
              הבא
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
          </nav>
        )}
      </section>

      <BodyPortal>
        <RefundDialog
          isOpen={Boolean(refundTarget)}
          onClose={() => { if (!refundLoading) setRefundTarget(null); }}
          onConfirm={handleRefundConfirm}
          title="זיכוי חיוב"
          maxAmount={refundTarget?.amount ?? 0}
          itemDescription={refundTarget?.description}
          loading={refundLoading}
        />
      </BodyPortal>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  foot: string;
  loading: boolean;
}

function Kpi({ label, value, foot, loading }: KpiProps) {
  return (
    <div className={theme.kpi}>
      <div className={theme.kpiLbl}>{label}</div>
      {loading ? <Skeleton className="h-7 w-24 my-1" /> : <div className={theme.kpiVal}>{value}</div>}
      <div className={theme.kpiFoot}>{foot}</div>
    </div>
  );
}

interface EmptyPanelProps {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}

function EmptyPanel({ icon, title, text, children }: EmptyPanelProps) {
  return (
    <div className={styles.empty} role="status">
      {icon}
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyText}>{text}</p>
      {children ? <div className={styles.emptyActions}>{children}</div> : null}
    </div>
  );
}
