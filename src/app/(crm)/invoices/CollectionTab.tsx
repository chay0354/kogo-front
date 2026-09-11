'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Bell, CheckCircle2, FileSearch, X } from 'lucide-react';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { fetchAllInvoices } from '@/lib/storeApi';
import { sendDocumentReminder } from '@/lib/documentsApi';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import type { StoreInvoice } from '@/types/store';
import LedgerFilterBar, { LedgerSelect } from './LedgerFilterBar';
import type { LedgerFiltersState } from './useLedgerFilters';
import { useLedgerDocuments } from './useLedgerDocuments';
import type { AgingBucket, CollectionRow, DocumentRow, LedgerDimensions, LedgerFilterKey, LedgerFilters } from './types';
import { ORIGIN_OPTIONS } from './constants';
import {
  buildCollectionRows,
  canSendDocumentReminder,
  collectionDueDate,
  daysAgoLocalISO,
  formatAmount,
  formatDate,
  getAgingBuckets,
  getCollectionAge,
  getCollectionAgeLabel,
  getOriginClass,
  getOriginDetail,
  getOriginLabel,
  getStatusClass,
  getStatusLabel,
  isStoreOrigin,
  isWithinRange,
  ledgerRangeParams,
  localISODate,
  matchesDocumentSearch,
  matchesLedgerFilters,
  withBranchCity,
  withSelectedOption,
  type LedgerOption,
} from './utils';
import pageStyles from './invoices.module.css';
import styles from './collectionTab.module.css';

/**
 * Aging looks at every debt still open, not at the page's date range. On the
 * default last-month view a document could only ever land in the 0–30 tile,
 * so the older tiles were always empty. Two years covers any debt still worth
 * chasing; "older debts" widens it on request.
 */
const DEBT_LOOKBACK_DAYS = 730;
const MAX_DEBT_LOOKBACK_DAYS = 3650;
// This tab keeps its own window, so the page's date fields would change nothing.
const DEBT_HIDDEN_FILTERS: readonly LedgerFilterKey[] = ['dateFrom', 'dateTo'];

// ---------------------------------------------------------------------------
// The rows and the rules of the tab. Pure, and exported for the tests.
// ---------------------------------------------------------------------------

export type AgingKey = AgingBucket['key'];

/**
 * One debt on the collection tab: the shared CollectionRow, the dimensions
 * the shared filter bar narrows on, and what the table says about its source.
 */
export interface DebtRow extends CollectionRow, LedgerDimensions {
  /** The ledger document behind a document row. A store invoice has none. */
  doc?: DocumentRow;
  /** Which system issued it, named as on the documents tab. */
  originLabel: string;
  /** Where exactly: the business, the website order or the branch. */
  originDetail: string;
}

const STORE_WEBSITE = 'store_website';
const STORE_COUNTER = 'store_counter';
const NO_CUSTOMER = '—';

/** The filter-bar dimensions a ledger document carries, field by field. */
function documentDimensions(doc: DocumentRow): LedgerDimensions {
  return {
    origin: doc.origin,
    branch_id: doc.branch_id,
    business_id: doc.business_id,
    business_name: doc.business_name,
    city_id: doc.city_id,
    city_name: doc.city_name,
    course_id: doc.course_id,
    course_name: doc.course_name,
    course_type_id: doc.course_type_id,
    course_type_name: doc.course_type_name,
    age_key: doc.age_key,
    age_label: doc.age_label,
    instructor_id: doc.instructor_id,
    instructor_name: doc.instructor_name,
  };
}

function originLabelOf(origin: string): string {
  return ORIGIN_OPTIONS.find((option) => option.value === origin)?.label ?? 'חנות';
}

/**
 * The debts of the tab: every document with an open balance, then every open
 * store invoice the documents do not already hold.
 *
 * The documents ledger lists the store's invoices of the range too, so an
 * open store invoice arrived from both sources — on screen twice and in the
 * total twice. It is kept once, as the ledger's row, which knows more (its
 * city, its order number). A store invoice the ledger does not hold open —
 * one issued outside the range — still comes from the store, as it always did.
 *
 * A store row is a store sale (business 'store') that knows its branch, and
 * its city through the branch; it has no class, age group or instructor.
 * Each source goes through buildCollectionRows one item at a time, so what
 * counts as a debt stays the shared rule and each row keeps its source.
 */
export function buildDebtRows(
  documents: readonly DocumentRow[],
  invoices: readonly StoreInvoice[],
  cityByBranch: ReadonlyMap<string, string> = new Map(),
): DebtRow[] {
  const fromDocuments = documents.flatMap((doc) =>
    buildCollectionRows([doc], []).map((row): DebtRow => ({
      ...row,
      ...documentDimensions(doc),
      doc,
      originLabel: getOriginLabel(doc),
      originDetail: [doc.business_name, getOriginDetail(doc)].filter(Boolean).join(' · '),
    })),
  );

  const held = new Set<string>();
  fromDocuments.forEach((row) => {
    if (row.doc?.store_invoice_id) held.add(row.doc.store_invoice_id);
    if (isStoreOrigin(row.origin)) held.add(row.id);
  });

  const fromStore = invoices
    .filter((invoice) => !held.has(invoice.id))
    .flatMap((invoice) =>
      buildCollectionRows([], [invoice]).map((row): DebtRow => {
        const origin = invoice.website_order_number ? STORE_WEBSITE : STORE_COUNTER;
        return {
          ...row,
          origin,
          branch_id: invoice.branch,
          originLabel: originLabelOf(origin),
          originDetail: invoice.website_order_number
            ? `הזמנה ${invoice.website_order_number}`
            : invoice.branch_name || '',
        };
      }),
    );

  return [...fromDocuments, ...fromStore].map((row) => withBranchCity(row, cityByBranch));
}

/** Free text: a document as the documents tab finds it; a store invoice by customer, number, order or branch. */
export function matchesDebtSearch(row: DebtRow, query: string): boolean {
  if (row.doc) return matchesDocumentSearch(row.doc, query);
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.customer, row.number, row.originDetail].some((field) =>
    String(field ?? '').toLowerCase().includes(q),
  );
}

/** Everything but the aging tile: the shared dimensions, the free text and the tab's customer. */
export function matchesDebtFilters(
  row: DebtRow,
  filters: Pick<
    LedgerFilters,
    'business' | 'cityId' | 'branchId' | 'courseTypeId' | 'ageKey' | 'instructorId' | 'search'
  >,
  customer = '',
): boolean {
  return matchesLedgerFilters(row, filters)
    && (!customer || row.customer === customer)
    && matchesDebtSearch(row, filters.search);
}

/**
 * The aging tile a debt falls in — asked of getAgingBuckets itself, so a
 * tile's figure and the rows its click shows are counted by one rule.
 */
export function agingKeyOf(row: CollectionRow): AgingKey | undefined {
  return getAgingBuckets([row]).find((bucket) => bucket.count > 0)?.key;
}

/** No tile chosen keeps every debt; a chosen tile keeps only its own. */
export function inAgingBucket(row: CollectionRow, bucket: AgingKey | ''): boolean {
  return !bucket || agingKeyOf(row) === bucket;
}

/** A tile toggles: clicking the chosen one again shows every debt. */
export function nextAgingBucket(current: AgingKey | '', clicked: AgingKey): AgingKey | '' {
  return current === clicked ? '' : clicked;
}

function sortableAge(row: CollectionRow): { days: number; overdue: boolean } {
  const age = getCollectionAge(row);
  return { days: Number.isFinite(age.days) ? age.days : 0, overdue: age.overdue };
}

/**
 * Most overdue first — the order a debt is chased in. Days past the due date,
 * or since issue where no due date was agreed; at the same age a debt past
 * its due date comes first, then the larger balance, then the older document.
 */
export function compareMostOverdueFirst(a: CollectionRow, b: CollectionRow): number {
  const ageA = sortableAge(a);
  const ageB = sortableAge(b);
  if (ageA.days !== ageB.days) return ageB.days - ageA.days;
  if (ageA.overdue !== ageB.overdue) return ageA.overdue ? -1 : 1;
  if (a.open !== b.open) return b.open - a.open;
  const dayA = String(a.issueDate ?? '').slice(0, 10);
  const dayB = String(b.issueDate ?? '').slice(0, 10);
  if (dayA !== dayB) return dayA < dayB ? -1 : 1;
  return String(a.number ?? '').localeCompare(String(b.number ?? ''), 'he', { numeric: true });
}

export function sumOpen(rows: readonly CollectionRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.open) || 0), 0);
}

/**
 * Whether the reminder email can go out for a debt. The endpoint knows only a
 * document issued by hand in the CRM; a subscription receipt (crm-inv-…) or a
 * store sale carries another model's id and would come back 404. The rule is
 * the documents tab's, so the bell appears on the same documents in both.
 */
export function canRemindDebt(row: DebtRow): boolean {
  return row.kind === 'document' && row.doc !== undefined && canSendDocumentReminder(row.doc);
}

/** What the quiet hint says where there is no bell. */
export function reminderUnavailableReason(row: DebtRow): string {
  const rule = 'תזכורת במייל נשלחת רק ממסמך ידני';
  if (isStoreOrigin(row.origin)) return `מכירה בחנות — ${rule}`;
  if (row.origin === 'subscription') return `חיוב מנוי — ${rule}`;
  return rule;
}

/** The customers with a debt, by name. One chosen and since paid stays visible, marked. */
export function debtCustomerOptions(rows: readonly DebtRow[], selected: string): LedgerOption[] {
  const names = Array.from(new Set(rows.map((row) => row.customer).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'he'));
  const options = names.map((name) => ({
    value: name,
    label: name === NO_CUSTOMER ? 'ללא שם לקוח' : name,
  }));
  return withSelectedOption(options, selected, `${selected} (אין חוב פתוח)`);
}

function countLabel(count: number, one: string, many: string): string {
  if (count === 0) return `אין ${many}`;
  return count === 1 ? one : `${count.toLocaleString('he-IL')} ${many}`;
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

type ReminderState = 'sending' | 'sent' | 'no_email' | 'error';

const REMINDER_TITLES: Record<ReminderState | 'idle', string> = {
  idle: 'שליחת תזכורת תשלום במייל',
  sending: 'שולח תזכורת…',
  sent: 'התזכורת נשלחה',
  no_email: 'לא נשלח — ללקוח אין כתובת מייל',
  error: 'שליחת התזכורת נכשלה',
};

const TABLE_COLUMNS = 11;

interface CollectionTabProps {
  /** The page's shared filters. Dates excepted — every open debt is shown, whenever it was issued. */
  ledger: LedgerFiltersState;
  /** Bumped by the page when a document was issued outside this tab. */
  refreshKey?: number;
}

/**
 * גבייה — everything issued and not yet collected, most overdue first, with
 * its age at a glance and a reminder where the document can send one.
 *
 * The rows are all loaded at once, so every filter is applied here: the
 * shared ones (matchesLedgerFilters), the tab's customer, and the aging tile
 * that was clicked.
 */
export default function CollectionTab({ ledger, refreshKey = 0 }: CollectionTabProps) {
  const { filters } = ledger;
  const [lookbackDays, setLookbackDays] = useState(DEBT_LOOKBACK_DAYS);
  const debtRange = useMemo(
    () => ({ dateFrom: daysAgoLocalISO(lookbackDays), dateTo: localISODate() }),
    [lookbackDays],
  );
  const { dateFrom, dateTo } = debtRange;
  const {
    documents,
    isLoading: documentsLoading,
    error: documentsError,
    reload: reloadDocuments,
  } = useLedgerDocuments(dateFrom, dateTo, refreshKey);
  const { branches } = useScopedBranches();

  const [invoices, setInvoices] = useState<StoreInvoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [invoicesFailed, setInvoicesFailed] = useState(false);
  const invoicesRequest = useRef(0);
  const [customer, setCustomer] = useState('');
  const [bucket, setBucket] = useState<AgingKey | ''>('');
  const [reminders, setReminders] = useState<Record<string, ReminderState>>({});

  // Every store invoice, once — an open one is a debt whatever its date.
  const loadInvoices = useCallback(async () => {
    const request = ++invoicesRequest.current;
    setInvoicesLoaded(false);
    setInvoicesFailed(false);
    try {
      const data = await fetchAllInvoices();
      if (request !== invoicesRequest.current) return;
      setInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      if (request !== invoicesRequest.current) return;
      console.error('Error loading store invoices:', error);
      setInvoices([]);
      setInvoicesFailed(true);
    } finally {
      if (request === invoicesRequest.current) setInvoicesLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
    // An answer still on its way when the tab closes has nowhere to go.
    return () => {
      invoicesRequest.current += 1;
    };
  }, [loadInvoices]);

  // Until a row says which city it is in, its branch answers for it.
  const cityByBranch = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      if (branch.city) map.set(branch.id, String(branch.city));
    });
    return map;
  }, [branches]);

  // The documents are fetched for the range; the check keeps the old range's
  // documents off screen while the new ones are on their way.
  const allRows = useMemo(
    () => buildDebtRows(
      documents.filter((doc) => isWithinRange(doc.issue_date, { dateFrom, dateTo })),
      invoices,
      cityByBranch,
    ),
    [documents, invoices, cityByBranch, dateFrom, dateTo],
  );

  // What every filter but the aging tile keeps. The tiles break it down, so
  // they still show every age while one of them is chosen.
  const scoped = useMemo(
    () => allRows.filter((row) => matchesDebtFilters(row, filters, customer)),
    [allRows, filters, customer],
  );
  const buckets = useMemo(() => getAgingBuckets(scoped), [scoped]);
  const visible = useMemo(
    () => scoped.filter((row) => inAgingBucket(row, bucket)).sort(compareMostOverdueFirst),
    [scoped, bucket],
  );

  const customerOptions = useMemo(() => debtCustomerOptions(allRows, customer), [allRows, customer]);
  const totalOpen = sumOpen(scoped);
  const lateOpen = sumOpen(scoped.filter((row) => getCollectionAge(row).overdue));
  const visibleOpen = sumOpen(visible);
  const customerCount = new Set(scoped.map((row) => row.customer)).size;

  const loading = documentsLoading || !invoicesLoaded;
  const range = ledgerRangeParams(debtRange);
  const rangeLabel = `${formatDate(range.start_date)} — ${formatDate(range.end_date)}`;
  const extraActiveCount = (customer ? 1 : 0) + (bucket ? 1 : 0);
  const wider = lookbackDays < MAX_DEBT_LOOKBACK_DAYS ? { label: 'הצגת חובות ישנים יותר' } : null;
  const documentsFailed = Boolean(documentsError);
  const documentsErrorText = documentsError && !documentsError.endsWith('.') ? `${documentsError}.` : documentsError;
  const storeOutsideRange = allRows.some(
    (row) => row.kind === 'store' && !isWithinRange(row.issueDate, debtRange),
  );

  function clearTabFields() {
    setCustomer('');
    setBucket('');
  }

  function clearAllFilters() {
    ledger.reset();
    clearTabFields();
  }

  function widenRange() {
    setLookbackDays(MAX_DEBT_LOOKBACK_DAYS);
  }

  function retry() {
    void reloadDocuments();
    if (invoicesFailed) void loadInvoices();
  }

  async function handleReminder(row: DebtRow) {
    setReminders((prev) => ({ ...prev, [row.id]: 'sending' }));
    let outcome: ReminderState = 'sent';
    try {
      await sendDocumentReminder(row.id);
    } catch (error) {
      const code = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      outcome = code === 'no_email' ? 'no_email' : 'error';
    }
    setReminders((prev) => ({ ...prev, [row.id]: outcome }));
    // The mark fades after a few seconds, leaving the button ready to send again.
    window.setTimeout(() => {
      setReminders((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }, 3000);
  }

  function renderList(): ReactNode {
    if (loading) {
      return <TableSkeleton columns={TABLE_COLUMNS} tableClassName={theme.table} label="טוען חובות פתוחים" />;
    }

    if (documentsFailed && allRows.length === 0) {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את החובות"
          text={`${documentsErrorText} אפשר לנסות שוב.`}
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (allRows.length === 0) {
      return (
        <EmptyPanel
          icon={<CheckCircle2 className={`${styles.emptyIcon} ${styles.emptyIconOk}`} aria-hidden="true" />}
          title="אין חובות פתוחים"
          text={`כל המסמכים שהונפקו בין ${formatDate(range.start_date)} ל-${formatDate(range.end_date)} נגבו, ואין חשבוניות חנות שממתינות לתשלום.${wider ? ' חובות ישנים יותר יופיעו אם תרחיבו את הטווח.' : ''}`}
        >
          {wider && (
            <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={widenRange}>
              {wider.label}
            </button>
          )}
        </EmptyPanel>
      );
    }

    if (visible.length === 0) {
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title="אף חוב לא מתאים לסינון"
          text={`יש ${countLabel(allRows.length, 'חוב פתוח אחד', 'חובות פתוחים')}, אבל הסינון שנבחר מסתיר את כולם. נקו את הסינון כדי לראות אותם.`}
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
          <caption className={styles.srOnly}>חובות פתוחים, מהאיחור הגדול לקטן</caption>
          <thead>
            <tr>
              <th scope="col">לקוח</th>
              <th scope="col">מסמך</th>
              <th scope="col">מקור</th>
              <th scope="col">הונפק</th>
              <th scope="col">מועד תשלום</th>
              <th scope="col">גיל החוב</th>
              <th scope="col" className={theme.n}>סכום</th>
              <th scope="col" className={theme.n}>שולם</th>
              <th scope="col" className={theme.n}>יתרה</th>
              <th scope="col">סטטוס</th>
              <th scope="col" className={theme.n}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const due = collectionDueDate(row);
              const age = getCollectionAge(row);
              const reminder = reminders[row.id];
              const originClass = row.doc
                ? getOriginClass(row.doc)
                : row.origin === STORE_WEBSITE
                  ? pageStyles.originStore_website
                  : pageStyles.originStore_counter;
              const ageClass = age.overdue ? styles.ageLate : due ? styles.ageWaiting : '';

              return (
                <tr key={`${row.kind}-${row.id}`}>
                  <td className={styles.wrapCell}>
                    <span className={styles.strong}>{row.customer === NO_CUSTOMER ? 'ללא שם לקוח' : row.customer}</span>
                  </td>
                  <td>
                    <span className={styles.docNumber}>{row.number || '—'}</span>
                    {row.docType && <span className={styles.subLine}>{row.docType}</span>}
                  </td>
                  <td>
                    <span className={`${pageStyles.originChip} ${originClass}`}>{row.originLabel}</span>
                    {row.originDetail && <span className={styles.subLine}>{row.originDetail}</span>}
                  </td>
                  <td>{row.issueDate ? formatDate(row.issueDate) : '—'}</td>
                  <td>
                    {due ? (
                      <>
                        {formatDate(due)}
                        {!row.dueDate && row.paymentTerms && (
                          <span className={styles.subLine}>לפי {row.paymentTerms}</span>
                        )}
                      </>
                    ) : row.paymentTerms ? (
                      <span className={styles.terms}>{row.paymentTerms}</span>
                    ) : (
                      <span className={styles.dash}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.age} ${styles.tone} ${ageClass}`} data-tone={agingKeyOf(row)}>
                      <span className={styles.dot} aria-hidden="true" />
                      {getCollectionAgeLabel(row)}
                    </span>
                  </td>
                  <td className={`${theme.n} ${styles.money}`}>{formatAmount(row.total)}</td>
                  <td className={`${theme.n} ${styles.money}`}>{formatAmount(row.paid)}</td>
                  <td className={`${theme.n} ${styles.money} ${styles.open}`}>{formatAmount(row.open)}</td>
                  <td>
                    <span className={`${pageStyles.statusBadge} ${getStatusClass(row.status)}`}>
                      {getStatusLabel(row.status)}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {canRemindDebt(row) ? (
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${
                            reminder === 'sent'
                              ? styles.iconBtnOk
                              : reminder === 'error' || reminder === 'no_email'
                                ? styles.iconBtnFail
                                : ''
                          }`}
                          title={REMINDER_TITLES[reminder ?? 'idle']}
                          aria-label={`${REMINDER_TITLES[reminder ?? 'idle']} — ${row.customer === NO_CUSTOMER ? row.number : row.customer}`}
                          disabled={reminder === 'sending'}
                          onClick={() => void handleReminder(row)}
                        >
                          <Bell size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        <span className={styles.noReminder} title={reminderUnavailableReason(row)}>
                          ללא תזכורת
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.tab}>
      <section className={styles.aging} aria-labelledby="collection-aging-title">
        <h2 id="collection-aging-title" className={styles.srOnly}>
          גיול חובות
        </h2>

        <div className={`${theme.kpi} ${styles.total}`}>
          <div className={theme.kpiLbl}>סה״כ חובות פתוחים</div>
          {loading ? (
            <Skeleton className="h-9 w-32 my-1" />
          ) : (
            <div className={`${theme.kpiVal} ${styles.totalVal} ${totalOpen > 0 ? theme.down : ''}`}>
              {formatAmount(totalOpen)}
            </div>
          )}
          <div className={theme.kpiFoot}>
            {loading
              ? ' '
              : `${countLabel(scoped.length, 'מסמך אחד', 'מסמכים')} · ${countLabel(customerCount, 'לקוח אחד', 'לקוחות')}`}
          </div>
          {!loading && lateOpen > 0 && (
            <div className={styles.totalLate}>{formatAmount(lateOpen)} מהם אחרי מועד התשלום</div>
          )}
        </div>

        {buckets.map((item) => {
          const active = bucket === item.key;
          const share = totalOpen > 0 ? Math.round((item.total / totalOpen) * 100) : 0;
          return (
            <button
              key={item.key}
              type="button"
              className={`${theme.kpi} ${styles.bucket} ${styles.tone} ${active ? styles.bucketOn : ''}`}
              data-tone={item.key}
              aria-pressed={active}
              disabled={loading || (item.count === 0 && !active)}
              title={active ? 'לחצו שוב כדי להציג את כל החובות' : `הצגת החובות של ${item.label} בלבד`}
              onClick={() => setBucket((current) => nextAgingBucket(current, item.key))}
            >
              <span className={styles.bucketHead}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={theme.kpiLbl}>{item.label}</span>
                {active && <X size={14} className={styles.bucketClear} aria-hidden="true" />}
              </span>
              {loading ? (
                <Skeleton className="h-7 w-20 my-1" />
              ) : (
                <span className={`${theme.kpiVal} ${styles.bucketVal} ${item.total > 0 ? '' : styles.zero}`}>
                  {formatAmount(item.total)}
                </span>
              )}
              <span className={`${theme.kpiFoot} ${styles.bucketFoot}`}>
                {loading ? ' ' : countLabel(item.count, 'מסמך אחד', 'מסמכים')}
              </span>
              <span className={styles.share} aria-hidden="true">
                <span className={styles.shareFill} style={{ width: `${share}%` }} />
              </span>
            </button>
          );
        })}
      </section>

      <LedgerFilterBar hide={DEBT_HIDDEN_FILTERS}
        ledger={ledger}
        rows={allRows}
        rowsLoading={loading}
        searchPlaceholder="לקוח, מספר מסמך, מספר הזמנה, סניף…"
        extraActiveCount={extraActiveCount}
        onClearExtra={clearTabFields}
        result={loading ? undefined : { shown: visible.length, total: allRows.length, noun: 'חובות פתוחים' }}
        idPrefix="collection"
      >
        <LedgerSelect
          id="collection-customer"
          label="לקוח"
          value={customer}
          onChange={setCustomer}
          options={customerOptions}
          allLabel="כל הלקוחות"
        />
      </LedgerFilterBar>

      <section className={theme.card} aria-labelledby="collection-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="collection-list-title" className={theme.cardTitle}>
              חובות פתוחים
            </h2>
            <p className={styles.cardSub}>{rangeLabel} · ממוין לפי איחור, החוב הוותיק ביותר ראשון</p>
            {!loading && storeOutsideRange && (
              <p className={styles.cardNote}>חשבוניות חנות פתוחות מוצגות גם כשהונפקו מחוץ לטווח התאריכים.</p>
            )}
          </div>
          {!loading && visible.length > 0 && visible.length !== allRows.length && (
            <span className={theme.chip}>
              ברשימה <b>{formatAmount(visibleOpen)}</b>
            </span>
          )}
        </div>

        {!loading && documentsFailed && allRows.length > 0 && (
          <div className={styles.notice} role="alert">
            <span>{documentsErrorText} מוצגות רק חשבוניות החנות.</span>
            <button type="button" className={styles.noticeAction} onClick={retry}>
              נסו שוב
            </button>
          </div>
        )}
        {!loading && invoicesFailed && (
          <div className={styles.notice} role="alert">
            <span>חשבוניות החנות לא נטענו, ולכן החובות שלהן חסרים ברשימה ובסכומים.</span>
            <button type="button" className={styles.noticeAction} onClick={retry}>
              נסו שוב
            </button>
          </div>
        )}

        {renderList()}
      </section>
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
