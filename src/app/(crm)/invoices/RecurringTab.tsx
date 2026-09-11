'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, FileSearch, Repeat, Send, X } from 'lucide-react';
import EditStandingOrderDialog from '@/components/dialogs/EditStandingOrderDialog';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import api from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import type { BranchOption } from '@/lib/scopedFilters';
import type { RecurringPayment } from '@/types/payment';
import BodyPortal from './BodyPortal';
import LedgerFilterBar, { LedgerSelect } from './LedgerFilterBar';
import type { LedgerDimensions, LedgerFilterKey, LedgerFilters } from './types';
import type { LedgerFiltersState } from './useLedgerFilters';
import {
  formatAmount,
  formatDate,
  formatHebrewMonth,
  getRecurringStatusClass,
  getRecurringStatusLabel,
  matchesLedgerFilters,
  withBranchCity,
} from './utils';
import pageStyles from './invoices.module.css';
import styles from './recurringTab.module.css';

// ---------------------------------------------------------------------------
// The rows and the rules — exported so recurringTab.test.ts can hold them.
// ---------------------------------------------------------------------------

/** One month billed differently from the standing figure (RecurringChargeOverride). */
export interface StandingOrderOverride {
  id: string;
  /** Always the 1st of the month it replaces. */
  billing_month: string;
  amount: number | string;
  /** 'manual' — set by the office · 'store' — a store purchase added to the month. */
  source?: string;
  reason?: string;
  /** Stamped once the month was charged. */
  applied_at?: string | null;
}

/**
 * A standing order as /customers/recurring-payments/ sends it: the order, the
 * ledger dimensions of the lesson behind it — business, city, course, course
 * type, age group, instructor — which are empty when the order has no lesson,
 * and branch_id, the branch of its initial payment (null when that has none).
 * An answer without branch_id (an older server) names the branch only;
 * withStandingOrderBranch places such an order from the name.
 *
 * course_name comes from the dimensions: '' without a lesson (older servers
 * sent null), so read it with ||, never ??.
 */
export interface StandingOrderRow extends Omit<RecurringPayment, 'course_name'>, LedgerDimensions {
  upcoming_overrides?: StandingOrderOverride[];
}

/** The standing figure moving to a new amount from a date (schedule-amount). */
export interface AmountChange {
  amount: number;
  /** YYYY-MM-DD */
  from: string;
}

export interface StandingOrderSummary {
  /** Orders in scope. */
  total: number;
  active: number;
  /** The standing monthly figures of the active orders, summed. */
  activeMonthly: number;
  /** Charge failed. Nothing retries them on its own. */
  failed: number;
  /** Not ended, and a new amount or a one-month exception is still ahead. */
  scheduled: number;
}

/** The tab's own status field, in the order the list is sorted by. */
export const STANDING_ORDER_STATUS_OPTIONS = [
  { value: 'active', label: 'פעיל' },
  { value: 'paused', label: 'מושהה' },
  { value: 'failed', label: 'נכשל' },
  { value: 'cancelled', label: 'מבוטל' },
  { value: 'expired', label: 'פג תוקף' },
] as const;

/** Active first, then paused, then the rest. */
const STATUS_RANK: Readonly<Record<string, number>> = { active: 0, paused: 1 };
const REST_RANK = 2;

function isEnded(status: string): boolean {
  return status === 'cancelled' || status === 'expired';
}

/** The branch the order was signed up in — the name the table shows. */
export function standingOrderBranchName(row: StandingOrderRow): string {
  return row.initial_payment_details?.branch_name || row.branch_name || '';
}

/** What the order pays for: the course of its lesson, or its description when it has none. */
export function standingOrderCourse(row: StandingOrderRow): string {
  return (
    row.initial_payment_details?.lesson_name
    || row.course_name
    || row.initial_payment_details?.description
    || ''
  );
}

/**
 * The order with the branch id the shared filter matches on.
 *
 * The list sends each order's branch_id, and a row that has one — even null —
 * keeps it. The branch's name is the fallback for a row sent without it (an
 * older server): it is looked up among the branches the user can see. Where
 * two branches share a name, the one chosen in the filter answers for it — as
 * the name comparison this replaced did — and otherwise the order is left
 * without an id rather than guessed into one.
 */
export function withStandingOrderBranch(
  row: StandingOrderRow,
  branches: readonly BranchOption[],
  selectedBranchId = '',
): StandingOrderRow {
  if (row.branch_id !== undefined) return row;
  const name = standingOrderBranchName(row);
  if (!name) return row;
  const selected = selectedBranchId ? branches.find((branch) => branch.id === selectedBranchId) : undefined;
  if (selected && selected.name === name) return { ...row, branch_id: selected.id };
  const named = branches.filter((branch) => branch.name === name);
  return named.length === 1 ? { ...row, branch_id: named[0].id } : row;
}

/**
 * Whether an order answers a free-text search: the child, what the order is
 * for, where, who teaches it, and the group's number as the badge shows it.
 */
export function matchesStandingOrderSearch(row: StandingOrderRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const displayId = row.initial_payment_details?.lesson_course_display_id;
  return [
    row.child_name,
    standingOrderCourse(row),
    row.course_name,
    standingOrderBranchName(row),
    row.city_name,
    row.business_name,
    row.course_type_name,
    row.instructor_name,
    displayId !== null && displayId !== undefined ? `#${displayId}` : '',
  ].some((field) => String(field ?? '').toLowerCase().includes(q));
}

/**
 * Whether an order passes the page's shared filters and search. The range is
 * not among them: a standing order is not dated, so the tab hides the dates and
 * never matches on them.
 */
export function matchesStandingOrderFilters(row: StandingOrderRow, filters: LedgerFilters): boolean {
  return matchesLedgerFilters(row, filters) && matchesStandingOrderSearch(row, filters.search);
}

/**
 * The day the order is next due: the charge ahead for an active or paused one,
 * the charge that did not go through for a failed one (the cron leaves the date
 * where it failed). A cancelled or expired order has none. '' when there is none.
 */
export function standingOrderDueDay(row: Pick<StandingOrderRow, 'status' | 'next_billing_date'>): string {
  if (isEnded(row.status)) return '';
  return String(row.next_billing_date ?? '').slice(0, 10);
}

/**
 * Active first, then paused, then the rest; within each, the soonest charge
 * first and an order without one last; then by the child's name, then by id,
 * so the order holds still between renders.
 */
export function compareStandingOrders(a: StandingOrderRow, b: StandingOrderRow): number {
  const rank = (STATUS_RANK[a.status] ?? REST_RANK) - (STATUS_RANK[b.status] ?? REST_RANK);
  if (rank !== 0) return rank;
  const dayA = standingOrderDueDay(a);
  const dayB = standingOrderDueDay(b);
  if (dayA !== dayB) {
    if (!dayA) return 1;
    if (!dayB) return -1;
    return dayA < dayB ? -1 : 1;
  }
  return (
    String(a.child_name ?? '').localeCompare(String(b.child_name ?? ''), 'he')
    || String(a.id).localeCompare(String(b.id))
  );
}

/** A new standing amount waiting for its date, or null. */
export function pendingAmountChange(
  row: Pick<StandingOrderRow, 'pending_amount' | 'pending_amount_effective_date'>,
): AmountChange | null {
  const raw = row.pending_amount;
  if (raw === null || raw === undefined || raw === '' || !row.pending_amount_effective_date) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  return { amount, from: String(row.pending_amount_effective_date).slice(0, 10) };
}

/** The months still ahead that bill differently, nearest first. */
export function upcomingMonthOverrides(row: Pick<StandingOrderRow, 'upcoming_overrides'>): StandingOrderOverride[] {
  return (row.upcoming_overrides ?? [])
    .filter((override) => !override.applied_at && Number.isFinite(Number(override.amount)))
    .sort((a, b) => String(a.billing_month).localeCompare(String(b.billing_month)));
}

/** An order not ended whose coming charges will not all be its standing figure. */
export function hasScheduledChange(row: StandingOrderRow): boolean {
  if (isEnded(row.status)) return false;
  return pendingAmountChange(row) !== null || upcomingMonthOverrides(row).length > 0;
}

/** The KPI row's figures over the orders in scope. Money is added in agorot, so it does not drift. */
export function summarizeStandingOrders(rows: readonly StandingOrderRow[]): StandingOrderSummary {
  let active = 0;
  let activeAgorot = 0;
  let failed = 0;
  let scheduled = 0;
  rows.forEach((row) => {
    if (row.status === 'active') {
      active += 1;
      activeAgorot += Math.round((Number(row.amount) || 0) * 100);
    }
    if (row.status === 'failed') failed += 1;
    if (hasScheduledChange(row)) scheduled += 1;
  });
  return { total: rows.length, active, activeMonthly: activeAgorot / 100, failed, scheduled };
}

/** The standing order's rhythm, as the line under the child reads it. */
export function billingRhythm(billingDay: number | null | undefined): string {
  return billingDay ? `חודשי, ב-${billingDay} בחודש` : 'חודשי';
}

/** Every standing order. The list is unpaginated today; a paginated answer is followed to its end. */
async function fetchAllStandingOrders(): Promise<StandingOrderRow[]> {
  const items: StandingOrderRow[] = [];
  let page = 1;
  while (page <= 100) {
    const response = await api.get('/customers/recurring-payments/', {
      params: page === 1 ? {} : { page },
    });
    const data = response.data;
    if (Array.isArray(data)) {
      items.push(...data);
      break;
    }
    const batch = Array.isArray(data?.results) ? data.results : [];
    items.push(...batch);
    if (!data?.next || batch.length === 0) break;
    page += 1;
  }
  return items;
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

/** A standing order is not dated, so the shared range has nothing to narrow here. */
const HIDDEN_FIELDS: readonly LedgerFilterKey[] = ['dateFrom', 'dateTo'];
const TABLE_COLUMNS = 7;

type LoadState = 'loading' | 'ready' | 'error';

const count = (n: number) => n.toLocaleString('he-IL');

interface RecurringTabProps {
  /** The page's shared filters. All of them apply here except the dates. */
  ledger: LedgerFiltersState;
}

/**
 * הוראת קבע — every standing order of the class customers: active first, then
 * paused, then the rest, each group by its nearest charge.
 *
 * The list arrives whole, so the page's shared filters — business, city and
 * branch, course type, age group, instructor, and the search — narrow it here in
 * the browser. The range is hidden. The tab adds one field of its own, סטטוס.
 */
export default function RecurringTab({ ledger }: RecurringTabProps) {
  const { filters } = ledger;
  const { branches } = useScopedBranches();

  const [orders, setOrders] = useState<StandingOrderRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StandingOrderRow | null>(null);
  const latestRequest = useRef(0);
  const loadedOnce = useRef(false);

  // An answer that arrives after a newer request went out is dropped. A reload
  // that fails keeps the orders already on screen instead of emptying the list.
  const loadOrders = useCallback(async () => {
    const request = ++latestRequest.current;
    setRefreshFailed(false);
    try {
      const rows = await fetchAllStandingOrders();
      if (request !== latestRequest.current) return;
      loadedOnce.current = true;
      setOrders(rows);
      setLoadState('ready');
    } catch (error) {
      if (request !== latestRequest.current) return;
      console.error('Error loading recurring payments:', error);
      if (loadedOnce.current) setRefreshFailed(true);
      else setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    // An answer still on its way when the tab closes has nowhere to go.
    return () => {
      latestRequest.current += 1;
    };
  }, [loadOrders]);

  function retry() {
    setLoadState('loading');
    void loadOrders();
  }

  async function handleCancel(order: StandingOrderRow) {
    if (!window.confirm(`לבטל את הוראת הקבע של ${order.child_name}?`)) return;
    setActionId(order.id);
    try {
      await api.post(`/customers/recurring-payments/${order.id}/cancel/`, {
        cancellation_reason: 'בוטל ממסך הוראות קבע',
      });
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id
            ? { ...item, status: 'cancelled', cancelled_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (error) {
      console.error('Error cancelling recurring payment:', error);
      window.alert('שגיאה בביטול הוראת הקבע');
    } finally {
      setActionId(null);
    }
  }

  async function handleSendCardUpdate(order: StandingOrderRow) {
    if (!window.confirm(`לשלוח לוואטסאפ קישור לעדכון כרטיס עבור ${order.child_name}?`)) return;
    setActionId(order.id);
    try {
      await api.post(`/customers/recurring-payments/${order.id}/send-card-update/`);
      window.alert('ההודעה נשלחה ב-ManyChat');
    } catch (error) {
      const msg =
        (error as { response?: { data?: { error?: string; reason?: string } } })?.response?.data?.error
        || (error as { response?: { data?: { reason?: string } } })?.response?.data?.reason
        || 'שגיאה בשליחת ההודעה';
      window.alert(msg);
    } finally {
      setActionId(null);
    }
  }

  // Every failed order that was loaded — the bulk link goes to all of them,
  // whatever the filters show, as it always has.
  const failedIds = useMemo(
    () => orders.filter((order) => order.status === 'failed').map((order) => order.id),
    [orders],
  );

  async function handleSendCardUpdateFailed() {
    if (failedIds.length === 0) {
      window.alert('אין הוראות קבע בסטטוס נכשל');
      return;
    }
    if (!window.confirm(`לשלוח קישור לעדכון כרטיס ל-${failedIds.length} הוראות קבע שנכשלו?`)) return;
    setActionId('bulk');
    try {
      const res = await api.post('/customers/recurring-payments/send-card-update-failed/', {
        ids: failedIds,
      });
      const sent = Number(res.data?.sent ?? 0);
      const failed = Number(res.data?.failed ?? 0);
      window.alert(`נשלח: ${sent}. לא נשלח: ${failed}.`);
    } catch (error) {
      console.error('Error sending card-update WhatsApp:', error);
      window.alert('שגיאה בשליחת ההודעות');
    } finally {
      setActionId(null);
    }
  }

  // Until a row says which city it is in, its branch answers for it.
  const cityByBranch = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      if (branch.city) map.set(branch.id, String(branch.city));
    });
    return map;
  }, [branches]);

  // Every order, placed in its branch and city so the shared filters can match it.
  const rows = useMemo(
    () => orders.map((order) => withBranchCity(
      withStandingOrderBranch(order, branches, filters.branchId),
      cityByBranch,
    )),
    [orders, branches, filters.branchId, cityByBranch],
  );

  // What the shared filters and the search keep: the scope the figures describe.
  const scoped = useMemo(
    () => rows.filter((row) => matchesStandingOrderFilters(row, filters)),
    [rows, filters],
  );
  const visible = useMemo(
    () => scoped.filter((row) => !status || row.status === status).sort(compareStandingOrders),
    [scoped, status],
  );
  const summary = useMemo(() => summarizeStandingOrders(scoped), [scoped]);

  const loading = loadState === 'loading';
  const extraActiveCount = status ? 1 : 0;

  function clearAllFilters() {
    ledger.reset();
    setStatus('');
  }

  function renderRow(row: StandingOrderRow): ReactNode {
    const child = row.child_name || '';
    const course = standingOrderCourse(row);
    const displayId = row.initial_payment_details?.lesson_course_display_id;
    const meta = [row.instructor_name, row.age_label, billingRhythm(row.billing_day)].filter(Boolean).join(' · ');
    const branch = standingOrderBranchName(row);
    const place = [row.city_name, row.business_name].filter(Boolean).join(' · ');
    const ended = isEnded(row.status);
    const change = ended ? null : pendingAmountChange(row);
    const months = ended ? [] : upcomingMonthOverrides(row);
    const due = standingOrderDueDay(row);
    const busy = actionId === row.id;

    return (
      <tr key={row.id}>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{child || '—'}</span>
          {course && (
            <span className={styles.subLine}>
              {course} <GroupIdBadge displayId={displayId} />
            </span>
          )}
          <span className={styles.subLine}>{meta}</span>
        </td>
        <td className={styles.wrapCell}>
          {branch ? <span>{branch}</span> : <span className={styles.dash}>—</span>}
          {place && <span className={styles.subLine}>{place}</span>}
        </td>
        <td className={`${theme.n} ${styles.money}`}>
          <span className={styles.strong}>{formatAmount(Number(row.amount))}</span>
          {change && (
            <span className={styles.change}>
              <span className={styles.changeTag}>שינוי מתוזמן</span>
              {formatAmount(change.amount)} מ-{formatDate(change.from)}
            </span>
          )}
          {months.length > 0 && (
            <span
              className={`${styles.change} ${styles.changeMonth}`}
              title={months
                .map((month) => `${formatHebrewMonth(month.billing_month)}: ${formatAmount(Number(month.amount))}`)
                .join('\n')}
            >
              <span className={styles.changeTag}>חודש חריג</span>
              {formatHebrewMonth(months[0].billing_month)}: {formatAmount(Number(months[0].amount))}
              {months.length > 1 ? ` ועוד ${months.length - 1}` : ''}
            </span>
          )}
        </td>
        <td>
          {due ? (
            <span className={row.status === 'paused' ? styles.muted : undefined}>{formatDate(due)}</span>
          ) : (
            <span className={styles.dash}>—</span>
          )}
          {row.status === 'paused' && <span className={styles.subLine}>לא יחויב בזמן ההשהיה</span>}
          {row.status === 'failed' && due && (
            <span className={`${styles.subLine} ${styles.failNote}`}>החיוב הזה לא נגבה</span>
          )}
          {row.last_charge_date && (
            <span className={styles.subLine}>אחרון: {formatDate(row.last_charge_date)}</span>
          )}
        </td>
        <td>
          {row.start_date ? formatDate(row.start_date) : <span className={styles.dash}>—</span>}
          {row.end_date && <span className={styles.subLine}>עד {formatDate(row.end_date)}</span>}
        </td>
        <td>
          <span className={`${pageStyles.statusBadge} ${getRecurringStatusClass(row.status)}`}>
            {getRecurringStatusLabel(row.status)}
          </span>
          {row.status === 'cancelled' && row.cancelled_at && (
            <span className={styles.subLine} title={row.cancellation_reason || undefined}>
              ב-{formatDate(row.cancelled_at)}
            </span>
          )}
        </td>
        <td>
          <div className={styles.actions}>
            {row.status === 'active' ? (
              <>
                <button
                  type="button"
                  className={styles.actionBtn}
                  disabled={busy}
                  aria-label={`עריכה — ${child}`}
                  onClick={() => setEditing(row)}
                >
                  עריכה
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionDanger}`}
                  disabled={busy}
                  aria-label={`${busy ? 'מבטל' : 'ביטול'} — ${child}`}
                  onClick={() => void handleCancel(row)}
                >
                  {busy ? 'מבטל...' : 'ביטול'}
                </button>
              </>
            ) : row.status === 'failed' ? (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionAccent}`}
                disabled={busy}
                aria-label={`${busy ? 'שולח' : 'שלח קישור לכרטיס'} — ${child}`}
                onClick={() => void handleSendCardUpdate(row)}
              >
                {busy ? 'שולח...' : 'שלח קישור לכרטיס'}
              </button>
            ) : (
              <span className={styles.dash}>—</span>
            )}
          </div>
        </td>
      </tr>
    );
  }

  function renderList(): ReactNode {
    if (loading) {
      return <TableSkeleton columns={TABLE_COLUMNS} tableClassName={theme.table} label="טוען הוראות קבע" />;
    }

    if (loadState === 'error') {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את הוראות הקבע"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (orders.length === 0) {
      return (
        <EmptyPanel
          icon={<Repeat className={styles.emptyIcon} aria-hidden="true" />}
          title="אין עדיין הוראות קבע"
          text="כשלקוח נרשם לחוג בתשלום חודשי באשראי, הוראת הקבע שלו מופיעה כאן."
        />
      );
    }

    if (visible.length === 0) {
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title="אף הוראת קבע לא מתאימה לסינון"
          text={`יש ${count(orders.length)} הוראות קבע, אבל הסינון שנבחר מסתיר את כולן. נקו את הסינון כדי לראות אותן.`}
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={clearAllFilters}>
            נקה סינון
          </button>
        </EmptyPanel>
      );
    }

    return (
      <div className={theme.tableScroll}>
        <table className={`${theme.table} ${styles.table}`}>
          <caption className={styles.srOnly}>
            הוראות הקבע: פעילות קודם, אחריהן מושהות ושאר ההוראות; בכל קבוצה החיוב הקרוב ראשון
          </caption>
          <thead>
            <tr>
              <th scope="col">ילד וחוג</th>
              <th scope="col">סניף</th>
              <th scope="col" className={theme.n}>סכום חודשי</th>
              <th scope="col">חיוב הבא</th>
              <th scope="col">התחלה</th>
              <th scope="col">סטטוס</th>
              <th scope="col" className={theme.n}>פעולות</th>
            </tr>
          </thead>
          <tbody>{visible.map(renderRow)}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.tab}>
      <div className={`${theme.grid} ${theme.g4} ${styles.kpis}`}>
        <Kpi
          label="פעילות"
          loading={loading}
          value={count(summary.active)}
          foot={
            ledger.activeCount > 0
              ? `מתוך ${count(summary.total)} בסינון · ${count(orders.length)} בסך הכול`
              : `מתוך ${count(summary.total)} הוראות קבע`
          }
        />
        <Kpi
          label="סכום חודשי פעיל"
          loading={loading}
          value={formatAmount(summary.activeMonthly)}
          foot="הסכום הקבוע של ההוראות הפעילות"
        />
        <Kpi
          label="נכשלו · דורשות טיפול"
          loading={loading}
          value={count(summary.failed)}
          foot={summary.failed > 0 ? 'אין ניסיון חיוב חוזר אוטומטי' : 'אין הוראות שנכשלו'}
          negative={summary.failed > 0}
        />
        <Kpi
          label="מתוזמנות לשינוי"
          loading={loading}
          value={count(summary.scheduled)}
          foot="סכום חדש או חודש חריג שעוד לא חויב"
        />
      </div>

      <LedgerFilterBar
        ledger={ledger}
        rows={rows}
        rowsLoading={loading}
        hide={HIDDEN_FIELDS}
        searchPlaceholder="ילד, חוג, מדריך, סניף…"
        extraActiveCount={extraActiveCount}
        onClearExtra={() => setStatus('')}
        result={loading || loadState === 'error'
          ? undefined
          : { shown: visible.length, total: orders.length, noun: 'הוראות קבע' }}
        idPrefix="recurring"
      >
        <LedgerSelect
          id="recurring-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={STANDING_ORDER_STATUS_OPTIONS}
          allLabel="כל הסטטוסים"
        />
      </LedgerFilterBar>

      <section className={theme.card} aria-labelledby="recurring-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="recurring-list-title" className={theme.cardTitle}>
              הוראות הקבע
            </h2>
            <p className={styles.cardSub}>פעילות קודם, אחריהן מושהות ושאר ההוראות · בכל קבוצה החיוב הקרוב ראשון</p>
          </div>

          {failedIds.length > 0 && (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={actionId === 'bulk'}
              title="נשלח לכל ההוראות שנכשלו, בלי קשר לסינון"
              onClick={() => void handleSendCardUpdateFailed()}
            >
              <Send size={15} aria-hidden="true" />
              {actionId === 'bulk' ? 'שולח...' : `שלח קישור לכל הנכשלים (${count(failedIds.length)})`}
            </button>
          )}
        </div>

        {refreshFailed && (
          <div className={styles.notice} role="alert">
            <span>רענון הרשימה נכשל. מוצגות ההוראות שנטענו קודם.</span>
            <button
              type="button"
              className={styles.noticeClose}
              onClick={() => setRefreshFailed(false)}
              aria-label="סגירת ההודעה"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {renderList()}
      </section>

      <BodyPortal>
        <EditStandingOrderDialog
          order={editing}
          isOpen={Boolean(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => { void loadOrders(); }}
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
  /** Something that needs a person — shown in the theme's negative colour. */
  negative?: boolean;
}

function Kpi({ label, value, foot, loading, negative = false }: KpiProps) {
  return (
    <div className={theme.kpi}>
      <div className={theme.kpiLbl}>{label}</div>
      {loading ? (
        <Skeleton className="h-7 w-24 my-1" />
      ) : (
        <div className={`${theme.kpiVal} ${negative ? theme.down : ''}`}>{value}</div>
      )}
      <div className={theme.kpiFoot}>{loading ? ' ' : foot}</div>
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
