'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Banknote, FileSearch, Plus, X } from 'lucide-react';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import { cancelCheckPlan, fetchCheckPlans, type CheckItemRow, type CheckPlanRow } from '@/lib/documentsApi';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import BodyPortal from './BodyPortal';
import LedgerFilterBar, { LedgerSelect } from './LedgerFilterBar';
import RegisterChecksDialog from './RegisterChecksDialog';
import type { LedgerDimensions, LedgerFilterKey, LedgerFilters } from './types';
import { useLedgerFilters, type LedgerFiltersState } from './useLedgerFilters';
import { formatAmount, formatDate, localISODate, matchesLedgerFilters, withBranchCity } from './utils';
import pageStyles from './invoices.module.css';
import styles from './checks.module.css';

// ---------------------------------------------------------------------------
// The rows and the rules — exported so checksTab.test.ts can hold them.
// ---------------------------------------------------------------------------

/**
 * A check plan as a ledger row. The plan arrives with the dimensions of its
 * lesson — business, city, course type, age group, instructor — and its
 * branch_id, so every shared filter matches it as it matches a charge; a plan
 * without a lesson has its branch and city only. An answer without branch_id
 * (an older server) is placed by `branch`, and the branch places it in its city.
 */
export interface CheckPlanLedgerRow extends CheckPlanRow, LedgerDimensions {}

export interface CheckPlanSummary {
  /** Plans in scope. */
  total: number;
  active: number;
  /** Checks of active plans still waiting for their tax invoice. */
  pendingCount: number;
  pendingAmount: number;
  /** Of those, the ones whose date has passed — their invoice did not go out. */
  late: number;
  /** The nearest check still ahead (today counts), with every check due that day. */
  next: { date: string; count: number; amount: number; childName: string } | null;
}

/** The tab's own status field. */
export const CHECK_PLAN_STATUS_OPTIONS = [
  { value: 'active', label: 'פעיל' },
  { value: 'completed', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
] as const;

/**
 * What a check plan cannot be narrowed by: its dates. A plan is not one dated
 * row but a series, and a range over its registration day would hide live plans.
 */
export const CHECKS_HIDDEN_FIELDS: readonly LedgerFilterKey[] = ['dateFrom', 'dateTo'];

const PLAN_RANK: Readonly<Record<string, number>> = { active: 0, completed: 1, cancelled: 2 };
const OTHER_RANK = 3;

export function planStatusLabel(status: string): string {
  if (status === 'active') return 'פעיל';
  if (status === 'completed') return 'הושלם';
  if (status === 'cancelled') return 'בוטל';
  return status;
}

function planStatusClass(status: string): string {
  if (status === 'active') return pageStyles.statusCompleted;
  if (status === 'completed') return styles.statusDone;
  if (status === 'cancelled') return pageStyles.statusRefunded;
  return '';
}

export function itemStatusLabel(status: string): string {
  if (status === 'pending') return 'ממתין לחשבונית';
  if (status === 'invoiced') return 'הופקה חשבונית';
  if (status === 'cancelled') return 'בוטל';
  return status;
}

function itemStatusClass(status: string): string {
  if (status === 'pending') return pageStyles.statusPending;
  if (status === 'invoiced') return pageStyles.statusCompleted;
  if (status === 'cancelled') return pageStyles.statusRefunded;
  return '';
}

/** The plan with the branch id and city the shared filters match on. What the server sent itself is kept. */
export function checkPlanLedgerRow(
  plan: CheckPlanRow,
  cityByBranch: ReadonlyMap<string, string>,
): CheckPlanLedgerRow {
  const row: CheckPlanLedgerRow = plan;
  const placed = row.branch_id !== undefined ? row : { ...row, branch_id: plan.branch };
  return withBranchCity(placed, cityByBranch);
}

/** Whether a plan answers a free-text search: the child, the class, the receipt, a check or its invoice. */
export function matchesCheckPlanSearch(plan: CheckPlanRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const has = (value: string | null | undefined) => String(value ?? '').toLowerCase().includes(q);
  return (
    [plan.child_name, plan.description, plan.lesson_name, plan.receipt_number, plan.branch_name].some(has)
    || plan.items.some((item) => has(item.check_number) || has(item.tax_invoice_number))
  );
}

/**
 * Whether a plan passes the page's shared filters and search — the class, the
 * age group and the instructor too, read from its lesson. The dates are never
 * matched on: the tab hides them (CHECKS_HIDDEN_FIELDS).
 */
export function matchesCheckPlanFilters(row: CheckPlanLedgerRow, filters: LedgerFilters): boolean {
  return matchesLedgerFilters(row, filters) && matchesCheckPlanSearch(row, filters.search);
}

/**
 * Active plans first, then completed, then cancelled; within each, the plan
 * whose next check is nearest first and a plan with none left last; then the
 * newest registration, the child's name and the id, so the order holds still.
 */
export function compareCheckPlans(a: CheckPlanRow, b: CheckPlanRow): number {
  const rank = (PLAN_RANK[a.status] ?? OTHER_RANK) - (PLAN_RANK[b.status] ?? OTHER_RANK);
  if (rank !== 0) return rank;
  const dueA = String(a.next_due_date ?? '').slice(0, 10);
  const dueB = String(b.next_due_date ?? '').slice(0, 10);
  if (dueA !== dueB) {
    if (!dueA) return 1;
    if (!dueB) return -1;
    return dueA < dueB ? -1 : 1;
  }
  const created = String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  return (
    created
    || String(a.child_name ?? '').localeCompare(String(b.child_name ?? ''), 'he')
    || String(a.id).localeCompare(String(b.id))
  );
}

/**
 * A check of a live plan whose date has passed and that still has no tax
 * invoice. The recurring-billing cron issues each check's invoice on its date,
 * several times a day, so a check left pending past its day did not go out.
 */
export function isCheckItemLate(item: CheckItemRow, planStatus: string, today: string): boolean {
  const day = String(item.due_date ?? '').slice(0, 10);
  return planStatus === 'active' && item.status === 'pending' && Boolean(day) && day < today;
}

/** The KPI row's figures over the plans in scope. Money is added in agorot, so it does not drift. */
export function summarizeCheckPlans(plans: readonly CheckPlanRow[], today: string): CheckPlanSummary {
  let active = 0;
  let pendingCount = 0;
  let pendingAgorot = 0;
  let late = 0;
  let nextDate = '';
  let nextChecks: Array<{ agorot: number; childName: string }> = [];

  plans.forEach((plan) => {
    // A pending check outside an active plan is waiting on nothing: the cron skips it.
    if (plan.status !== 'active') return;
    active += 1;
    plan.items.forEach((item) => {
      if (item.status !== 'pending') return;
      const agorot = Math.round((Number(item.amount) || 0) * 100);
      pendingCount += 1;
      pendingAgorot += agorot;
      if (isCheckItemLate(item, plan.status, today)) {
        late += 1;
        return;
      }
      const day = String(item.due_date ?? '').slice(0, 10);
      if (!day) return;
      if (!nextDate || day < nextDate) {
        nextDate = day;
        nextChecks = [];
      }
      if (day === nextDate) nextChecks.push({ agorot, childName: plan.child_name });
    });
  });

  return {
    total: plans.length,
    active,
    pendingCount,
    pendingAmount: pendingAgorot / 100,
    late,
    next: nextDate
      ? {
          date: nextDate,
          count: nextChecks.length,
          amount: nextChecks.reduce((sum, check) => sum + check.agorot, 0) / 100,
          childName: nextChecks[0]?.childName ?? '',
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

const TABLE_COLUMNS = 7;

type LoadState = 'loading' | 'ready' | 'error';

const count = (n: number) => n.toLocaleString('he-IL');

interface ChecksTabProps {
  /**
   * The page's shared filters. Until the page hands them in, the tab keeps
   * filters of its own, opened on the page's branch (branchFilter).
   */
  ledger?: LedgerFiltersState;
  /** @deprecated The page's former props. The tab formats with utils; kept so the page's call type-checks. */
  formatAmount?: (value: number) => string;
  /** @deprecated See formatAmount. */
  formatDate?: (value: string) => string;
  /** @deprecated Read from `ledger` once the page passes it; until then it seeds the tab's own filters. */
  branchFilter?: string;
}

/**
 * צ׳קים — the office check plans: a receipt when they are registered, and a
 * tax invoice for each check on its date.
 *
 * The plans arrive whole, so the filters narrow them here in the browser:
 * עסק and, under סניפים, עיר and סניף; סוג חוג, גיל and מדריך, from each plan's
 * lesson; the search; and the tab's own status. The dates are hidden
 * (CHECKS_HIDDEN_FIELDS).
 */
export default function ChecksTab({ ledger: pageLedger, branchFilter }: ChecksTabProps) {
  const ownLedger = useLedgerFilters(branchFilter ? { branchId: branchFilter } : undefined);
  const ledger = pageLedger ?? ownLedger;
  const { filters } = ledger;
  const { branches } = useScopedBranches();

  const [plans, setPlans] = useState<CheckPlanRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const loadedOnce = useRef(false);

  // An answer that arrives after a newer request went out is dropped. A reload
  // that fails keeps the plans already on screen instead of emptying the list.
  const loadPlans = useCallback(async () => {
    const request = ++latestRequest.current;
    setRefreshFailed(false);
    try {
      const rows = await fetchCheckPlans();
      if (request !== latestRequest.current) return;
      loadedOnce.current = true;
      setPlans(rows);
      setLoadState('ready');
    } catch (error) {
      if (request !== latestRequest.current) return;
      console.error('Error loading check plans:', error);
      if (loadedOnce.current) setRefreshFailed(true);
      else setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadPlans();
    // An answer still on its way when the tab closes has nowhere to go.
    return () => {
      latestRequest.current += 1;
    };
  }, [loadPlans]);

  function retry() {
    setLoadState('loading');
    void loadPlans();
  }

  async function handleCancel(plan: CheckPlanRow) {
    if (!window.confirm(`לבטל את תוכנית הצ׳קים של ${plan.child_name}? הקבלה שכבר הופקה לא תבוטל.`)) {
      return;
    }
    setActionId(plan.id);
    try {
      const updated = await cancelCheckPlan(plan.id);
      setPlans((prev) => prev.map((row) => (row.id === plan.id ? updated : row)));
    } catch {
      window.alert('שגיאה בביטול תוכנית הצ׳קים');
    } finally {
      setActionId(null);
    }
  }

  const { cityByBranch, cityNameByBranch } = useMemo(() => {
    const ids = new Map<string, string>();
    const names = new Map<string, string>();
    branches.forEach((branch) => {
      if (branch.city) ids.set(branch.id, String(branch.city));
      if (branch.city_name) names.set(branch.id, branch.city_name);
    });
    return { cityByBranch: ids, cityNameByBranch: names };
  }, [branches]);

  const today = localISODate();
  const rows = useMemo(() => plans.map((plan) => checkPlanLedgerRow(plan, cityByBranch)), [plans, cityByBranch]);
  // What the shared filters and the search keep: the scope the figures describe.
  const scoped = useMemo(() => rows.filter((row) => matchesCheckPlanFilters(row, filters)), [rows, filters]);
  const visible = useMemo(
    () => scoped.filter((row) => !status || row.status === status).sort(compareCheckPlans),
    [scoped, status],
  );
  const summary = useMemo(() => summarizeCheckPlans(scoped, today), [scoped, today]);

  const loading = loadState === 'loading';

  function clearAllFilters() {
    ledger.reset();
    setStatus('');
  }

  function renderItems(plan: CheckPlanRow): ReactNode {
    return (
      <table className={styles.nestedTable}>
        <caption className={styles.srOnly}>הצ׳קים של {plan.child_name}</caption>
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">בנק</th>
            <th scope="col">סניף בנק</th>
            <th scope="col">מס׳ חשבון</th>
            <th scope="col">מס׳ צ׳ק</th>
            <th scope="col" className={theme.n}>סכום</th>
            <th scope="col">סטטוס</th>
            <th scope="col">חשבונית מס</th>
          </tr>
        </thead>
        <tbody>
          {plan.items.map((item) => (
            <tr key={item.id}>
              <td>{item.due_date ? formatDate(item.due_date) : '—'}</td>
              <td>{item.bank || '—'}</td>
              <td>{item.bank_branch || '—'}</td>
              <td>{item.account_number || '—'}</td>
              <td className={styles.receiptNo}>{item.check_number || '—'}</td>
              <td className={`${theme.n} ${styles.money}`}>{formatAmount(Number(item.amount))}</td>
              <td>
                <span className={`${pageStyles.statusBadge} ${itemStatusClass(item.status)}`}>
                  {itemStatusLabel(item.status)}
                </span>
                {isCheckItemLate(item, plan.status, today) && (
                  <span className={`${styles.subLine} ${styles.lateNote}`}>המועד עבר</span>
                )}
              </td>
              <td className={item.tax_invoice_number ? styles.receiptNo : styles.dash}>
                {item.tax_invoice_number || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderRow(plan: CheckPlanLedgerRow): ReactNode {
    const open = expandedId === plan.id;
    const nestedId = `checks-items-${plan.id}`;
    const course = plan.lesson_name || plan.description || '';
    const city = plan.branch ? cityNameByBranch.get(plan.branch) ?? plan.city_name ?? '' : '';
    const invoiced = plan.items.filter((item) => item.status === 'invoiced').length;
    const lateCount = plan.items.filter((item) => isCheckItemLate(item, plan.status, today)).length;
    const busy = actionId === plan.id;

    return (
      <Fragment key={plan.id}>
        <tr>
          <td className={styles.wrapCell}>
            <span className={styles.strong}>{plan.child_name || '—'}</span>
            {course && <span className={styles.subLine}>{course}</span>}
          </td>
          <td className={styles.wrapCell}>
            {plan.branch_name ? <span>{plan.branch_name}</span> : <span className={styles.dash}>—</span>}
            {city && <span className={styles.subLine}>{city}</span>}
          </td>
          <td className={`${theme.n} ${styles.money}`}>
            <span className={styles.strong}>{formatAmount(Number(plan.total_amount))}</span>
            <span className={styles.subLine}>
              {plan.items.length === 1 ? 'צ׳ק אחד' : `${count(plan.items.length)} צ׳קים`}
            </span>
          </td>
          <td>
            {plan.receipt_number
              ? <span className={styles.receiptNo}>{plan.receipt_number}</span>
              : <span className={styles.dash}>—</span>}
          </td>
          <td>
            {plan.next_due_date ? formatDate(plan.next_due_date) : <span className={styles.dash}>—</span>}
            <span className={styles.subLine}>
              הופקו {count(invoiced)} מתוך {count(plan.items.length)} חשבוניות
            </span>
            {lateCount > 0 && (
              <span className={`${styles.subLine} ${styles.lateNote}`}>
                {lateCount === 1 ? 'צ׳ק אחד' : `${count(lateCount)} צ׳קים`} בלי חשבונית אחרי המועד
              </span>
            )}
          </td>
          <td>
            <span className={`${pageStyles.statusBadge} ${planStatusClass(plan.status)}`}>
              {planStatusLabel(plan.status)}
            </span>
          </td>
          <td>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionBtn}
                aria-expanded={open}
                aria-controls={open ? nestedId : undefined}
                onClick={() => setExpandedId(open ? null : plan.id)}
              >
                {open ? 'הסתר צ׳קים' : `צ׳קים (${plan.items.length})`}
              </button>
              {plan.status === 'active' ? (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionDanger}`}
                  disabled={busy}
                  aria-label={`${busy ? 'מבטל' : 'ביטול'} — ${plan.child_name}`}
                  onClick={() => void handleCancel(plan)}
                >
                  {busy ? 'מבטל...' : 'ביטול'}
                </button>
              ) : null}
            </div>
          </td>
        </tr>
        {open ? (
          <tr className={styles.nestedRow} id={nestedId}>
            <td colSpan={TABLE_COLUMNS}>{renderItems(plan)}</td>
          </tr>
        ) : null}
      </Fragment>
    );
  }

  function renderList(): ReactNode {
    if (loading) {
      return <TableSkeleton columns={TABLE_COLUMNS} tableClassName={theme.table} label="טוען צ׳קים" />;
    }

    if (loadState === 'error') {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את הצ׳קים"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (plans.length === 0) {
      return (
        <EmptyPanel
          icon={<Banknote className={styles.emptyIcon} aria-hidden="true" />}
          title="אין עדיין רישומי צ׳קים"
          text="אחרי פתיחת הלקוח במשרד, רושמים כאן את הצ׳קים שלו: יוצאת קבלה עם כולם, ובכל חודש, ביום הצ׳ק, חשבונית מס."
        >
          <button
            type="button"
            className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`}
            onClick={() => setRegisterOpen(true)}
          >
            <Plus size={15} aria-hidden="true" />
            רישום צ׳קים
          </button>
        </EmptyPanel>
      );
    }

    if (visible.length === 0) {
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title="אף תוכנית צ׳קים לא מתאימה לסינון"
          text={`יש ${count(plans.length)} תוכניות צ׳קים, אבל הסינון שנבחר מסתיר את כולן. נקו את הסינון כדי לראות אותן.`}
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={clearAllFilters}>
            נקה סינון
          </button>
        </EmptyPanel>
      );
    }

    return (
      <>
        <div className={theme.tableScroll}>
          <table className={`${theme.table} ${styles.table}`}>
            <caption className={styles.srOnly}>
              תוכניות הצ׳קים: פעילות קודם, אחריהן שהושלמו ושבוטלו; בכל קבוצה הצ׳ק הקרוב ראשון
            </caption>
            <thead>
              <tr>
                <th scope="col">ילד וחוג</th>
                <th scope="col">סניף</th>
                <th scope="col" className={theme.n}>סה״כ</th>
                <th scope="col">קבלה</th>
                <th scope="col">הצ׳ק הבא</th>
                <th scope="col">סטטוס</th>
                <th scope="col" className={theme.n}>פעולות</th>
              </tr>
            </thead>
            <tbody>{visible.map(renderRow)}</tbody>
          </table>
        </div>
        <p className={styles.footnote}>
          חשבונית מס לכל צ׳ק יוצאת אוטומטית ביום הצ׳ק, בהרצה של הוראות הקבע. ביטול תוכנית לא מבטל את הקבלה שכבר הופקה.
        </p>
      </>
    );
  }

  const next = summary.next;

  return (
    <div className={styles.tab}>
      <div className={`${theme.grid} ${theme.g4} ${styles.kpis}`}>
        <Kpi
          label="תוכניות פעילות"
          loading={loading}
          value={count(summary.active)}
          foot={
            ledger.activeCount > 0
              ? `מתוך ${count(summary.total)} בסינון · ${count(plans.length)} בסך הכול`
              : `מתוך ${count(summary.total)} תוכניות`
          }
        />
        <Kpi
          label="צ׳קים ממתינים לחשבונית"
          loading={loading}
          value={count(summary.pendingCount)}
          foot={`${formatAmount(summary.pendingAmount)} · חשבונית ביום הצ׳ק`}
        />
        <Kpi
          label="הצ׳ק הבא"
          loading={loading}
          value={next ? formatDate(next.date) : '—'}
          foot={
            !next
              ? 'אין צ׳קים עתידיים'
              : next.count === 1
                ? `${formatAmount(next.amount)} · ${next.childName}`
                : `${count(next.count)} צ׳קים · ${formatAmount(next.amount)}`
          }
        />
        <Kpi
          label="חשבוניות באיחור"
          loading={loading}
          value={count(summary.late)}
          foot={summary.late > 0 ? 'עבר יום הצ׳ק ולא הופקה חשבונית' : 'כל החשבוניות הופקו בזמן'}
          negative={summary.late > 0}
        />
      </div>

      <LedgerFilterBar
        ledger={ledger}
        rows={rows}
        rowsLoading={loading}
        hide={CHECKS_HIDDEN_FIELDS}
        searchPlaceholder="ילד, חוג, מספר צ׳ק, מספר קבלה…"
        extraActiveCount={status ? 1 : 0}
        onClearExtra={() => setStatus('')}
        result={loading || loadState === 'error'
          ? undefined
          : { shown: visible.length, total: plans.length, noun: 'תוכניות צ׳קים' }}
        idPrefix="checks"
      >
        <LedgerSelect
          id="checks-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={CHECK_PLAN_STATUS_OPTIONS}
          allLabel="כל הסטטוסים"
        />
      </LedgerFilterBar>

      <section className={theme.card} aria-labelledby="checks-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="checks-list-title" className={theme.cardTitle}>
              תוכניות הצ׳קים
            </h2>
            <p className={styles.cardSub}>פעילות קודם, אחריהן שהושלמו ושבוטלו · בכל קבוצה הצ׳ק הקרוב ראשון</p>
          </div>
          <button type="button" className={styles.registerBtn} onClick={() => setRegisterOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            רישום צ׳קים
          </button>
        </div>

        {refreshFailed && (
          <div className={styles.notice} role="alert">
            <span>רענון הרשימה נכשל. מוצגות התוכניות שנטענו קודם.</span>
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

      {/* Out at the end of <body>, like the other tabs' dialogs: an entrance
          transform on an ancestor would otherwise pull its fixed overlay off
          the viewport. */}
      <BodyPortal>
        <RegisterChecksDialog
          open={registerOpen}
          onClose={() => setRegisterOpen(false)}
          onCreated={() => { void loadPlans(); }}
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
      <div className={theme.kpiFoot}>{loading ? ' ' : foot}</div>
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
