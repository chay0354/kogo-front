'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Bell, Download, FileArchive, FileSearch, FileSpreadsheet, FileWarning, X } from 'lucide-react';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthProvider';
import { downloadStoreInvoicePdf } from '@/lib/storeApi';
import {
  downloadDocumentPdf,
  downloadDocumentsRegister,
  downloadPeriodReport,
  downloadUniformExport,
  finalizeDraft,
  sendDocumentReminder,
} from '@/lib/documentsApi';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import LedgerFilterBar, { LedgerSelect } from './LedgerFilterBar';
import MissingReceiptsPanel, { MISSING_RECEIPTS_PANEL_ID } from './MissingReceiptsPanel';
import type { LedgerFiltersState } from './useLedgerFilters';
import { useLedgerDocuments } from './useLedgerDocuments';
import type { DocumentRow } from './types';
import { DOCUMENT_STATUS_OPTIONS, DOCUMENT_TYPE_OPTIONS } from './constants';
import {
  canSendDocumentReminder,
  compareDocumentsNewestFirst,
  formatAmount,
  formatDate,
  getLedgerDocType,
  getOriginClass,
  getOriginDetail,
  getOriginLabel,
  getStatusClass,
  getStatusLabel,
  isWithinRange,
  ledgerRangeParams,
  matchesDocumentSearch,
  matchesLedgerFilters,
  sumDocuments,
  widerRange,
  withBranchCity,
} from './utils';
import pageStyles from './invoices.module.css';
import styles from './documentsTab.module.css';

/** What the period report groups its pages by. */
type ReportGroupBy = 'branch' | 'business' | 'business_unit' | 'business_category';

const REPORT_GROUP_OPTIONS: ReadonlyArray<{ value: ReportGroupBy; label: string }> = [
  { value: 'branch', label: 'דוח לפי סניפים' },
  { value: 'business', label: 'דוח לפי לקוחות עסקיים' },
  { value: 'business_unit', label: 'דוח לפי עסק' },
  { value: 'business_category', label: 'דוח לפי קטגוריה' },
];

type ReminderState = 'sending' | 'sent' | 'no_email' | 'error';

const REMINDER_TITLES: Record<ReminderState | 'idle', string> = {
  idle: 'שליחת תזכורת תשלום במייל',
  sending: 'שולח תזכורת…',
  sent: 'התזכורת נשלחה',
  no_email: 'לא נשלח — ללקוח אין כתובת מייל',
  error: 'שליחת התזכורת נכשלה',
};

const TABLE_COLUMNS = 11;

interface DocumentsTabProps {
  /** The page's shared filters (useLedgerFilters). */
  ledger: LedgerFiltersState;
  /** Bumped by the page when a document was issued outside this tab — from מסמך חדש. */
  refreshKey?: number;
}

/**
 * מסמכים — every invoice and receipt issued in a date range, newest first,
 * with where each one came from, what it was for and how much of it is paid.
 *
 * The tab owns its rows and its two own fields (סוג מסמך, סטטוס). The range
 * and the source filters belong to the page and are shared with every tab.
 */
export default function DocumentsTab({ ledger, refreshKey = 0 }: DocumentsTabProps) {
  const { filters } = ledger;
  const { dateFrom, dateTo } = filters;
  const { documents, isLoading, error: loadError, reload } = useLedgerDocuments(dateFrom, dateTo, refreshKey);
  const { branches } = useScopedBranches();
  const { user } = useAuth();
  // Issuing late receipts is a manager's call; the server refuses anyone else too.
  const isManager = user?.role === 'manager';
  const [missingOpen, setMissingOpen] = useState(false);
  // While the panel issues, closing it would lose the outcome of an irreversible action.
  const [missingIssuing, setMissingIssuing] = useState(false);

  const [docType, setDocType] = useState('');
  const [status, setStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [reportGroupBy, setReportGroupBy] = useState<ReportGroupBy>('branch');
  const [reportBusy, setReportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<'' | 'register' | 'uniform'>('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Record<string, ReminderState>>({});

  // Until a row says which city it is in, its branch answers for it.
  const cityByBranch = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      if (branch.city) map.set(branch.id, String(branch.city));
    });
    return map;
  }, [branches]);

  // Every document of the range. The rows are fetched for it; the check here
  // keeps the old range's rows off screen while the new ones are on their way.
  const inRange = useMemo(
    () => documents
      .filter((doc) => isWithinRange(doc.issue_date, { dateFrom, dateTo }))
      .map((doc) => withBranchCity(doc, cityByBranch)),
    [documents, dateFrom, dateTo, cityByBranch],
  );

  const visible = useMemo(
    () => inRange
      .filter((doc) => (
        matchesLedgerFilters(doc, filters)
        && (!docType || getLedgerDocType(doc) === docType)
        && (!status || doc.status === status)
        && matchesDocumentSearch(doc, filters.search)
      ))
      .sort(compareDocumentsNewestFirst),
    [inRange, filters, docType, status],
  );

  const totals = useMemo(() => sumDocuments(visible), [visible]);
  const range = ledgerRangeParams(filters);
  const rangeLabel = `${formatDate(range.start_date)} — ${formatDate(range.end_date)}`;
  const extraActiveCount = (docType ? 1 : 0) + (status ? 1 : 0);
  const narrowed = ledger.activeCount + extraActiveCount > 0;
  const wider = widerRange(filters);

  function clearTabFields() {
    setDocType('');
    setStatus('');
  }

  function clearAllFilters() {
    ledger.reset();
    clearTabFields();
  }

  function widenRange() {
    if (wider) ledger.setFilter('dateFrom', wider.dateFrom);
  }

  async function handleReport() {
    setReportBusy(true);
    setActionError('');
    try {
      // הדוח מוציא את כל סוגי המסמכים תמיד. קודם הוא ירש בשקט את מסנן הסוג של
      // הטבלה, כך שדוח מסונן נראה בדיוק כמו דוח מלא — ומי שקרא את הסכום לא
      // ידע שחסרים בו מסמכים.
      await downloadPeriodReport({ ...ledgerRangeParams(filters), group_by: reportGroupBy });
    } catch {
      setActionError('הפקת הדוח נכשלה');
    } finally {
      setReportBusy(false);
    }
  }

  // The accountant's two files follow the dates only, like the report: every
  // document in the range, whatever the table is narrowed to.
  async function handleExport(kind: 'register' | 'uniform') {
    setExportBusy(kind);
    setActionError('');
    try {
      const range = ledgerRangeParams(filters);
      if (kind === 'register') await downloadDocumentsRegister(range);
      else await downloadUniformExport(range);
    } catch {
      setActionError(
        kind === 'register'
          ? 'הפקת קובץ המסמכים נכשלה'
          : 'הפקת קבצי המבנה האחיד נכשלה — הטווח צריך להיות בתוך שנת מס אחת',
      );
    } finally {
      setExportBusy('');
    }
  }

  async function handleApprove(doc: DocumentRow) {
    if (!window.confirm(`לאשר את הטיוטה ${doc.document_number}? המסמך יקבל מספר חשבונית.`)) return;
    setApprovingId(doc.id);
    setActionError('');
    try {
      await finalizeDraft(doc.id);
      await reload();
    } catch {
      setActionError('אישור הטיוטה נכשל');
    } finally {
      setApprovingId(null);
    }
  }

  async function handleDownload(doc: DocumentRow) {
    setDownloadingId(doc.id);
    try {
      if (doc.store_invoice_id) {
        await downloadStoreInvoicePdf(doc.store_invoice_id, doc.document_number);
      } else if (doc.pdf_url) {
        window.open(doc.pdf_url, '_blank', 'noopener,noreferrer');
      } else {
        await downloadDocumentPdf(doc.id, doc.document_number);
      }
    } catch {
      alert('שגיאה בהורדת החשבונית');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleReminder(doc: DocumentRow) {
    setReminders((prev) => ({ ...prev, [doc.id]: 'sending' }));
    let outcome: ReminderState = 'sent';
    try {
      await sendDocumentReminder(doc.id);
    } catch (error) {
      const code = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      outcome = code === 'no_email' ? 'no_email' : 'error';
    }
    setReminders((prev) => ({ ...prev, [doc.id]: outcome }));
    // The mark fades after a few seconds, leaving the button ready to send again.
    window.setTimeout(() => {
      setReminders((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
    }, 3000);
  }

  function renderList(): ReactNode {
    if (isLoading) {
      return <TableSkeleton columns={TABLE_COLUMNS} tableClassName={theme.table} label="טוען מסמכים" />;
    }

    if (loadError && documents.length === 0) {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את המסמכים"
          text={`${loadError} אפשר לנסות שוב; אם זה חוזר, נסו טווח תאריכים קצר יותר.`}
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={() => void reload()}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (inRange.length === 0) {
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title="אין מסמכים בטווח הזה"
          text={
            wider
              ? `בין ${formatDate(range.start_date)} ל-${formatDate(range.end_date)} לא הופקו מסמכים. הרחיבו את הטווח, או בחרו תאריכים אחרים בשדות למעלה.`
              : `בין ${formatDate(range.start_date)} ל-${formatDate(range.end_date)} לא הופקו מסמכים. בחרו תאריכים אחרים בשדות למעלה.`
          }
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
          title="אף מסמך לא מתאים לסינון"
          text={`בטווח יש ${inRange.length.toLocaleString('he-IL')} מסמכים, אבל הסינון שנבחר מסתיר את כולם. נקו את הסינון${wider ? ' או הרחיבו את הטווח' : ''} כדי לראות אותם.`}
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
          <caption className={styles.srOnly}>מסמכים בין {rangeLabel}, מהחדש לישן</caption>
          <thead>
            <tr>
              <th scope="col">מס׳ מסמך</th>
              <th scope="col">תאריך</th>
              <th scope="col">מקור</th>
              <th scope="col">לקוח</th>
              <th scope="col">חוג</th>
              <th scope="col">סוג מסמך</th>
              <th scope="col" className={theme.n}>סכום</th>
              <th scope="col" className={theme.n}>שולם</th>
              <th scope="col" className={theme.n}>יתרה</th>
              <th scope="col">סטטוס</th>
              <th scope="col" className={theme.n}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((doc) => {
              const canDownload = Boolean(doc.pdf_url || doc.store_invoice_id || doc.source === 'local');
              const notIssued = doc.source === 'local' && doc.tranzila_issued === false && !doc.is_draft;
              // Which business the income is tagged to, then the website order,
              // the branch or the payment method — whichever says where exactly.
              const originDetail = [doc.business_name, getOriginDetail(doc)].filter(Boolean).join(' · ');
              const course = doc.course_name || doc.course_type_name || '';
              const courseMeta = [doc.instructor_name, doc.age_label].filter(Boolean).join(' · ');
              const openBalance = Number(doc.open_balance) || 0;
              const reminder = reminders[doc.id];

              return (
                <tr key={doc.id}>
                  <td className={styles.docNumber}>{doc.document_number || '—'}</td>
                  <td>{doc.issue_date ? formatDate(doc.issue_date) : '—'}</td>
                  <td>
                    <span className={`${pageStyles.originChip} ${getOriginClass(doc)}`}>{getOriginLabel(doc)}</span>
                    {originDetail && <span className={styles.subLine}>{originDetail}</span>}
                  </td>
                  <td className={styles.wrapCell}>
                    <span className={styles.strong}>{doc.customer_name || '—'}</span>
                  </td>
                  <td className={styles.wrapCell}>
                    {course || courseMeta ? (
                      <>
                        <span className={styles.strong}>{course || courseMeta}</span>
                        {course && courseMeta && <span className={styles.subLine}>{courseMeta}</span>}
                      </>
                    ) : (
                      <span className={styles.dash}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`${theme.tag} ${theme.tagType}`}>{getLedgerDocType(doc)}</span>
                  </td>
                  <td className={`${theme.n} ${styles.money}`}>{formatAmount(doc.total_amount)}</td>
                  <td className={`${theme.n} ${styles.money}`}>{formatAmount(doc.amount_paid)}</td>
                  <td className={`${theme.n} ${styles.money} ${openBalance > 0 ? styles.open : styles.settled}`}>
                    {formatAmount(doc.open_balance)}
                  </td>
                  <td>
                    <span className={`${pageStyles.statusBadge} ${getStatusClass(doc.status)}`}>
                      {getStatusLabel(doc.status)}
                    </span>
                    {notIssued && (
                      <span className={styles.note} title="המסמך נשמר מקומית אך לא הונפק בטרנזילה">
                        לא הונפק בטרנזילה
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {doc.is_draft && (
                        <button
                          type="button"
                          className={styles.approveBtn}
                          disabled={approvingId === doc.id}
                          onClick={() => void handleApprove(doc)}
                        >
                          {approvingId === doc.id ? 'מאשר…' : 'אשר טיוטה'}
                        </button>
                      )}
                      {canSendDocumentReminder(doc) && (
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
                          aria-label={`${REMINDER_TITLES[reminder ?? 'idle']} — ${doc.customer_name || doc.document_number}`}
                          disabled={reminder === 'sending'}
                          onClick={() => void handleReminder(doc)}
                        >
                          <Bell size={16} aria-hidden="true" />
                        </button>
                      )}
                      {canDownload ? (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          title="הורד PDF"
                          aria-label={`הורדת ${doc.document_number}`}
                          disabled={downloadingId === doc.id}
                          onClick={() => void handleDownload(doc)}
                        >
                          <Download size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        <span className={styles.noPdf} title="לא קיים קובץ למסמך זה">
                          ללא PDF
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
      <div className={`${theme.grid} ${theme.g4} ${styles.kpis}`}>
        <Kpi
          label="מסמכים בטווח"
          loading={isLoading}
          value={visible.length.toLocaleString('he-IL')}
          foot={narrowed ? `מתוך ${inRange.length.toLocaleString('he-IL')} · ${rangeLabel}` : rangeLabel}
        />
        <Kpi label='סה"כ' loading={isLoading} value={formatAmount(totals.total)} foot='כולל מע"מ, בניכוי זיכויים' />
        <Kpi label="שולם" loading={isLoading} value={formatAmount(totals.paid)} foot="נגבה בפועל" />
        <Kpi
          label="יתרה פתוחה"
          loading={isLoading}
          value={formatAmount(totals.open)}
          foot="ממתין לגבייה"
          negative={totals.open > 0}
        />
      </div>

      <LedgerFilterBar
        ledger={ledger}
        rows={inRange}
        rowsLoading={isLoading}
        searchPlaceholder="לקוח, מספר מסמך, מספר הזמנה, חוג…"
        extraActiveCount={extraActiveCount}
        onClearExtra={clearTabFields}
        result={isLoading ? undefined : { shown: visible.length, total: inRange.length, noun: 'מסמכים בטווח' }}
        idPrefix="documents"
      >
        <LedgerSelect
          id="documents-type"
          label="סוג מסמך"
          value={docType}
          onChange={setDocType}
          options={DOCUMENT_TYPE_OPTIONS}
          allLabel="כל הסוגים"
        />
        <LedgerSelect
          id="documents-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={DOCUMENT_STATUS_OPTIONS}
          allLabel="כל הסטטוסים"
        />
      </LedgerFilterBar>

      {/* Its own card above the list, inside the tab's themed scope: the late
          receipts it issues land in the list below once it reloads. */}
      {isManager && missingOpen && (
        <MissingReceiptsPanel
          onClose={() => setMissingOpen(false)}
          onIssueFinished={() => void reload()}
          onIssuingChange={setMissingIssuing}
        />
      )}

      <section className={theme.card} aria-labelledby="documents-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="documents-list-title" className={theme.cardTitle}>
              רשימת המסמכים
            </h2>
            <p className={styles.cardSub}>{rangeLabel} · מהחדש לישן</p>
          </div>

          {/* The report always covers every document type in the range; it
              follows the dates only, and says so. */}
          <div className={styles.report}>
            <label htmlFor="documents-report-group" className={styles.reportLabel}>
              דוח תקופתי
            </label>
            <select
              id="documents-report-group"
              className={styles.reportSelect}
              value={reportGroupBy}
              onChange={(e) => setReportGroupBy(e.target.value as ReportGroupBy)}
            >
              {REPORT_GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.reportBtn}
              disabled={reportBusy}
              onClick={() => void handleReport()}
              title="כל סוגי המסמכים בטווח התאריכים, בלי סינון הטבלה"
            >
              <Download size={15} aria-hidden="true" />
              {reportBusy ? 'מפיק…' : 'הורד דוח PDF'}
            </button>
            <button
              type="button"
              className={styles.reportBtn}
              disabled={exportBusy !== ''}
              onClick={() => void handleExport('register')}
              title="כל המסמכים בטווח, שורה לכל מסמך — קובץ שנפתח ב-Excel אצל רואה החשבון"
            >
              <FileSpreadsheet size={15} aria-hidden="true" />
              {exportBusy === 'register' ? 'מפיק…' : 'ייצוא לרו״ח'}
            </button>
            {isManager && (
              <button
                type="button"
                className={styles.reportBtn}
                aria-expanded={missingOpen}
                aria-controls={missingOpen ? MISSING_RECEIPTS_PANEL_ID : undefined}
                disabled={missingOpen && missingIssuing}
                onClick={() => setMissingOpen((open) => !open)}
                title="חיובים שהושלמו ולא הופקה להם קבלה — לשליחה לרואה החשבון ולהפקה אחרי שאישר"
              >
                <FileWarning size={15} aria-hidden="true" />
                קבלות חסרות
              </button>
            )}
            <button
              type="button"
              className={styles.reportBtn}
              disabled={exportBusy !== ''}
              onClick={() => void handleExport('uniform')}
              title="קבצי מבנה אחיד של רשות המסים (INI.TXT ו-BKMVDATA.TXT) לטווח, בתוך שנת מס אחת"
            >
              <FileArchive size={15} aria-hidden="true" />
              {exportBusy === 'uniform' ? 'מפיק…' : 'מבנה אחיד'}
            </button>
          </div>
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
        {loadError && documents.length > 0 && !isLoading && (
          <div className={styles.notice} role="alert">
            <span>{loadError} מוצגים המסמכים שנטענו קודם.</span>
          </div>
        )}

        {renderList()}
      </section>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  foot: string;
  loading: boolean;
  /** An amount still owed — shown in the theme's negative colour. */
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
