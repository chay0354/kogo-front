'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileWarning, X } from 'lucide-react';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import {
  downloadMissingReceiptsCsv,
  fetchMissingReceipts,
  fetchMissingReceiptsNextNumber,
  issueMissingReceipts,
  MISSING_RECEIPTS_CONFIRM_WORD,
  MISSING_RECEIPTS_MAX_BATCH,
  type IssueMissingReceiptsResult,
  type MissingReceiptsReport,
} from '@/lib/documentsApi';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import { formatAmount, formatDate } from './utils';
import {
  canConfirmIssue,
  canStartIssue,
  continuityGaps,
  failedLines,
  issueBatch,
  issueButtonLabel,
  issueConfirmationLines,
  issueSummary,
  manualDocumentNote,
  reconcileSelection,
  selectAllLabel,
  selectAllOrClear,
  serverErrorText,
  toggleSelected,
  yearOptions,
  isConfirmWord,
} from './missingReceipts';
import tabStyles from './documentsTab.module.css';
import styles from './missingReceipts.module.css';

export const MISSING_RECEIPTS_PANEL_ID = 'missing-receipts-panel';

interface MissingReceiptsPanelProps {
  onClose: () => void;
  /**
   * Called after every issue attempt, whatever came back — a request that
   * failed or timed out may still have issued receipts — so the documents
   * list is read again.
   */
  onIssueFinished: () => void;
  /** Told while receipts are being issued, so the tab does not close the panel under them. */
  onIssuingChange?: (issuing: boolean) => void;
}

/**
 * קבלות חסרות — completed charges that never got their חשבונית מס/קבלה, for a
 * year: the list, its CSV for the accountant, and, once the accountant
 * approved, one button that issues the ticked rows the way `check_invoices
 * --fix` does. A row a hand-issued document may already cover starts unticked.
 * Managers only; the server enforces it too.
 */
export default function MissingReceiptsPanel({ onClose, onIssueFinished, onIssuingChange }: MissingReceiptsPanelProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [report, setReport] = useState<MissingReceiptsReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [nextNumber, setNextNumber] = useState('');
  const [typed, setTyped] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState<IssueMissingReceiptsResult | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  // Only the answer to the latest request is shown when the year changes quickly.
  const requestRef = useRef(0);
  const numberRequestRef = useRef(0);
  // The rows the ticks were made on, so a reload keeps the office's choices.
  const reportRef = useRef<MissingReceiptsReport | null>(null);

  const load = useCallback(async (forYear: number) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchMissingReceipts(forYear);
      if (request === requestRef.current) {
        const previousRows = reportRef.current?.rows ?? [];
        reportRef.current = data;
        setReport(data);
        setSelected((previous) => reconcileSelection(previousRows, previous, data.rows));
      }
    } catch (err) {
      if (request === requestRef.current) {
        reportRef.current = null;
        setReport(null);
        setSelected(new Set());
        setError(await serverErrorText(err, 'טעינת הקבלות החסרות נכשלה'));
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year);
  }, [load, year]);

  // Opening the panel moves focus to it, so a keyboard user lands where it appeared.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (confirming) confirmInputRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    onIssuingChange?.(issuing);
  }, [issuing, onIssuingChange]);

  const rows = report?.rows ?? [];
  const selectedCount = rows.filter((row) => selected.has(row.payment_id)).length;
  const flaggedCount = rows.filter((row) => manualDocumentNote(row)).length;
  const batch = issueBatch(rows, selected);
  const flaggedInBatch = batch.filter((row) => manualDocumentNote(row)).length;
  const gaps = continuityGaps(report?.continuity ?? []);
  const busy = exporting || issuing;

  function changeYear(next: number) {
    setYear(next);
    cancelConfirm();
    setResult(null);
    setFailures([]);
  }

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      await downloadMissingReceiptsCsv(year);
    } catch (err) {
      setError(await serverErrorText(err, 'הפקת הקובץ לרואה החשבון נכשלה'));
    } finally {
      setExporting(false);
    }
  }

  // The number shown is read as the confirmation opens: the one in the report
  // may be long past if anything was issued since. Until it arrives, or if it
  // cannot be read, the confirmation names no number rather than a stale one.
  async function openConfirm() {
    const request = ++numberRequestRef.current;
    setNextNumber('');
    setConfirming(true);
    try {
      const fresh = await fetchMissingReceiptsNextNumber();
      if (request === numberRequestRef.current) setNextNumber(fresh);
    } catch {
      // No number is better than a wrong one; issuing itself is unaffected.
    }
  }

  function cancelConfirm() {
    numberRequestRef.current += 1;
    setConfirming(false);
    setTyped('');
    setNextNumber('');
  }

  async function handleIssue() {
    if (!canConfirmIssue({ typed, issuing }) || batch.length === 0) return;
    const sent = batch;
    setIssuing(true);
    setError('');
    setResult(null);
    setFailures([]);
    let failure = '';
    try {
      const outcome = await issueMissingReceipts(
        sent.map((row) => row.payment_id),
        typed.trim(),
      );
      setResult(outcome);
      setFailures(failedLines(outcome, sent));
    } catch (err) {
      failure = await serverErrorText(err, 'הפקת הקבלות נכשלה');
    } finally {
      // Whatever came back — even a request that failed or timed out may have
      // issued receipts on the server — the list and the documents are read
      // again, and the confirmation (its count, its first number) goes with them.
      cancelConfirm();
      onIssueFinished();
      await load(year);
      if (failure) setError(failure);
      setIssuing(false);
    }
  }

  return (
    <section
      id={MISSING_RECEIPTS_PANEL_ID}
      className={`${theme.card} ${styles.panel}`}
      aria-labelledby="missing-receipts-title"
      aria-busy={issuing}
    >
      <div className={styles.head}>
        <div>
          <h2 id="missing-receipts-title" ref={titleRef} tabIndex={-1} className={`${theme.cardTitle} ${styles.title}`}>
            <FileWarning size={17} aria-hidden="true" />
            קבלות חסרות
          </h2>
          <p className={tabStyles.cardSub}>
            חיובים שהושלמו ולא הופקה להם חשבונית מס/קבלה. שולחים את הרשימה לרואה החשבון, ומפיקים רק אחרי שאישר.
          </p>
        </div>
        <div className={tabStyles.report}>
          <label htmlFor="missing-receipts-year" className={tabStyles.reportLabel}>
            שנה
          </label>
          <select
            id="missing-receipts-year"
            className={tabStyles.reportSelect}
            value={year}
            disabled={busy}
            onChange={(e) => changeYear(Number(e.target.value))}
          >
            {yearOptions(currentYear).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={tabStyles.reportBtn}
            disabled={busy || loading || rows.length === 0}
            onClick={() => void handleExport()}
            title="הרשימה כקובץ שנפתח ב-Excel, לאישור רואה החשבון לפני ההפקה"
          >
            <FileSpreadsheet size={15} aria-hidden="true" />
            {exporting ? 'מפיק…' : 'ייצוא לרו״ח (CSV)'}
          </button>
          <button
            type="button"
            className={styles.issueBtn}
            disabled={!canStartIssue({ count: batch.length, loading, busy }) || confirming}
            onClick={() => void openConfirm()}
          >
            {issueButtonLabel(batch.length)}
          </button>
          <button
            type="button"
            className={tabStyles.iconBtn}
            onClick={onClose}
            disabled={issuing}
            aria-label="סגירת הקבלות החסרות"
            title={issuing ? 'אי אפשר לסגור בזמן שהקבלות מופקות' : undefined}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={`${theme.grid} ${theme.g2} ${styles.kpis}`}>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>חיובים ללא קבלה</div>
          {loading ? (
            <Skeleton className="h-7 w-16 my-1" />
          ) : (
            <div className={`${theme.kpiVal} ${report && report.count > 0 ? theme.down : ''}`}>
              {(report?.count ?? 0).toLocaleString('he-IL')}
            </div>
          )}
          <div className={theme.kpiFoot}>לפי תאריך התשלום · {year}</div>
        </div>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>סה״כ</div>
          {loading ? (
            <Skeleton className="h-7 w-24 my-1" />
          ) : (
            <div className={theme.kpiVal}>{formatAmount(Number(report?.total ?? 0))}</div>
          )}
          <div className={theme.kpiFoot}>כולל מע״מ</div>
        </div>
      </div>

      {error && (
        <div className={tabStyles.notice} role="alert">
          <span>{error}</span>
          <button type="button" className={tabStyles.noticeClose} onClick={() => setError('')} aria-label="סגירת ההודעה">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {result && (
        <div className={`${styles.result} ${failures.length > 0 ? styles.resultWarn : ''}`} role="status">
          {failures.length > 0 ? (
            <AlertTriangle size={16} aria-hidden="true" className={styles.resultIcon} />
          ) : (
            <CheckCircle2 size={16} aria-hidden="true" className={styles.resultIcon} />
          )}
          <div>
            {issueSummary(result).map((line) => (
              <p key={line} className={styles.resultLine}>{line}</p>
            ))}
            {failures.length > 0 && (
              <>
                <p className={styles.resultLine}>
                  {failures.length === 1 ? 'לחיוב אחד לא הופקה קבלה:' : `ל-${failures.length} חיובים לא הופקה קבלה:`}
                </p>
                <ul className={styles.failedList}>
                  {failures.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <button
            type="button"
            className={tabStyles.noticeClose}
            onClick={() => {
              setResult(null);
              setFailures([]);
            }}
            aria-label="סגירת ההודעה"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {confirming && (
        <form
          className={styles.confirm}
          role="alertdialog"
          aria-labelledby="missing-receipts-confirm-title"
          aria-describedby="missing-receipts-confirm-text"
          onSubmit={(e) => {
            e.preventDefault();
            void handleIssue();
          }}
        >
          <p id="missing-receipts-confirm-title" className={styles.confirmTitle}>
            <AlertTriangle size={16} aria-hidden="true" />
            לפני שמפיקים
          </p>
          <ul id="missing-receipts-confirm-text" className={styles.confirmList}>
            {issueConfirmationLines(batch.length, nextNumber || undefined, flaggedInBatch).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {selectedCount > batch.length && (
            <p className={styles.confirmNote}>
              נבחרו {selectedCount.toLocaleString('he-IL')} חיובים, ובפעם אחת מופקות עד {MISSING_RECEIPTS_MAX_BATCH} קבלות — הוותיקות מביניהם. את השאר מפיקים בסבב נוסף.
            </p>
          )}
          <label htmlFor="missing-receipts-confirm-word" className={styles.confirmLabel}>
            כדי להפיק, הקלידו &quot;{MISSING_RECEIPTS_CONFIRM_WORD}&quot;
          </label>
          <div className={styles.confirmRow}>
            <input
              id="missing-receipts-confirm-word"
              ref={confirmInputRef}
              className={styles.confirmInput}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              disabled={issuing}
              aria-invalid={typed !== '' && !isConfirmWord(typed)}
            />
            <button
              type="submit"
              className={styles.issueBtn}
              disabled={!canConfirmIssue({ typed, issuing }) || batch.length === 0}
            >
              {issuing ? 'מפיק…' : issueButtonLabel(batch.length)}
            </button>
            <button type="button" className={tabStyles.reportBtn} onClick={cancelConfirm} disabled={issuing}>
              ביטול
            </button>
          </div>
        </form>
      )}

      {gaps.length > 0 && !loading && (
        <div className={styles.gaps} role="note">
          {gaps.map((line) => (
            <p key={line} className={styles.gapLine}>{line}</p>
          ))}
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={8} tableClassName={theme.table} label="טוען קבלות חסרות" />
      ) : rows.length === 0 ? (
        !error && (
          <p className={styles.empty} role="status">
            כל חיוב שהושלם ב-{year} קיבל חשבונית מס/קבלה.
          </p>
        )
      ) : (
        <>
          <div className={styles.selectBar}>
            <span aria-live="polite">
              נבחרו {selectedCount.toLocaleString('he-IL')} מתוך {rows.length.toLocaleString('he-IL')}
            </span>
            <button
              type="button"
              className={styles.linkBtn}
              disabled={issuing}
              onClick={() => setSelected((previous) => selectAllOrClear(rows, previous))}
            >
              {selectAllLabel(rows, selected)}
            </button>
            {flaggedCount > 0 && (
              <span className={styles.selectHint}>
                חיובים שייתכן שכבר הופק להם מסמך ידני לא נבחרו מראש.
              </span>
            )}
          </div>
          <div className={theme.tableScroll}>
            <table className={`${theme.table} ${styles.table}`}>
              <caption className={tabStyles.srOnly}>חיובים ללא קבלה ב-{year}, מהוותיק לחדש</caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.pick}>
                    <span className={tabStyles.srOnly}>בחירה להפקה</span>
                  </th>
                  <th scope="col">תאריך התשלום</th>
                  <th scope="col">משפחה</th>
                  <th scope="col">ילד</th>
                  <th scope="col">תיאור</th>
                  <th scope="col">ערוץ</th>
                  <th scope="col">אמצעי תשלום</th>
                  <th scope="col" className={theme.n}>סכום</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const note = manualDocumentNote(row);
                  const doc = row.possible_manual_document;
                  return (
                    <tr key={row.payment_id} className={note ? styles.flagged : undefined}>
                      <td className={styles.pick}>
                        <input
                          type="checkbox"
                          className={styles.check}
                          checked={selected.has(row.payment_id)}
                          disabled={issuing}
                          onChange={() => setSelected((previous) => toggleSelected(previous, row.payment_id))}
                          aria-label={`הפקת קבלה לחיוב של ${row.family_name || 'ללא משפחה'} מ-${formatDate(row.paid_at)}`}
                        />
                      </td>
                      <td>{formatDate(row.paid_at)}</td>
                      <td className={tabStyles.wrapCell}>{row.family_name || '—'}</td>
                      <td className={tabStyles.wrapCell}>{row.child_name || '—'}</td>
                      <td className={tabStyles.wrapCell}>
                        {row.description || '—'}
                        {note && doc && (
                          <span
                            className={styles.manualNote}
                            title={`מסמך ${doc.number} מ-${formatDate(doc.date)} על ${formatAmount(Number(doc.amount))}`}
                          >
                            {note}
                          </span>
                        )}
                      </td>
                      <td>{row.channel_label}</td>
                      <td>{row.method_label}</td>
                      <td className={`${theme.n} ${tabStyles.money}`}>{formatAmount(Number(row.amount))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
