'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Download, History, Hourglass, Loader2, Printer, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import { saveBlob } from '@/lib/documentsApi';
import {
  downloadSignedCopy,
  errorSentence,
  fetchSignedOriginals,
  printOriginal,
  type SignedOriginalDelivery,
  type SignedOriginalRow,
  type SigningStatus,
} from '@/lib/signingApi';
import { formatSigningStamp, localIsoStamp } from '@/lib/signingUtils';
import AllocationEntry from './AllocationEntry';
import SendOriginalDialog from './SendOriginalDialog';
import {
  canSendCopy,
  heldReasonNote,
  heldStatusLabel,
  MANUAL_DELIVERY_PAGE_SIZE,
  missingOriginalNotice,
  paperRowCanBeMailed,
  markAfterPrint,
  originalFilename,
  paperRowView,
  printedAtLine,
  PRINTED_RECENTLY_PAGE_SIZE,
  printFailureMessage,
  rowWithMark,
  sendActionLabel,
  waitingToPrint,
  type PrintMark,
} from './manualDelivery';
import { formatAmount, formatDate } from './utils';
import pageStyles from './invoices.module.css';
import styles from './manualDelivery.module.css';

type LoadState = 'loading' | 'ready' | 'error';

interface OriginalsList {
  rows: SignedOriginalRow[];
  count: number;
  loadState: LoadState;
  loadingMore: boolean;
}

const EMPTY_LIST: OriginalsList = { rows: [], count: 0, loadState: 'loading', loadingMore: false };

const PAPER_COLUMNS = 7;
const HELD_COLUMNS = 7;
const PRINTED_COLUMNS = 7;

/** How long a PDF opened in a new tab stays readable there, for its viewer's own print and save. */
const OPENED_PDF_LIFETIME_MS = 10 * 60 * 1000;

const count = (n: number) => n.toLocaleString('he-IL');

/**
 * One list of originals — paper-and-not-printed, held, or printed recently —
 * with "load more". An answer that arrives after a newer request went out is
 * dropped, so a reload racing a "load more" cannot leave the list half from each.
 */
function useOriginals(query: {
  delivery: SignedOriginalDelivery;
  printed?: boolean;
  order?: 'printed';
  pageSize?: number;
}) {
  const [list, setList] = useState<OriginalsList>(EMPTY_LIST);
  const latest = useRef(0);
  const { delivery, printed, order, pageSize = MANUAL_DELIVERY_PAGE_SIZE } = query;

  const load = useCallback(async (offset: number) => {
    const request = ++latest.current;
    if (offset > 0) setList((prev) => ({ ...prev, loadingMore: true }));
    try {
      const page = await fetchSignedOriginals({ delivery, printed, order, limit: pageSize, offset });
      if (request !== latest.current) return;
      setList((prev) => {
        const merged = offset === 0 ? page.results : [...prev.rows, ...page.results];
        // Two windows can overlap when a document moves between them; the id keeps one document one row.
        const byId = new Map(merged.map((row) => [row.id, row]));
        return { rows: [...byId.values()], count: page.count, loadState: 'ready', loadingMore: false };
      });
    } catch (error) {
      if (request !== latest.current) return;
      console.error(`Error loading the ${delivery} originals:`, error);
      setList((prev) => (offset === 0
        ? { ...EMPTY_LIST, loadState: 'error' }
        : { ...prev, loadingMore: false }));
      if (offset > 0) toast.error('טעינת מסמכים נוספים נכשלה');
    }
  }, [delivery, printed, order, pageSize]);

  useEffect(() => {
    void load(0);
    return () => {
      latest.current += 1;
    };
  }, [load]);

  const retry = useCallback(() => {
    setList(EMPTY_LIST);
    void load(0);
  }, [load]);

  const loadMore = useCallback(() => {
    void load(list.rows.length);
  }, [load, list.rows.length]);

  return { list, retry, loadMore };
}

/**
 * A tab opened now, inside the click, so the browser lets it through; the PDF
 * is put in it once it arrives. Null when the browser blocked it.
 */
function openPendingTab(): Window | null {
  try {
    const tab = window.open('', '_blank');
    if (!tab) return null;
    try {
      tab.opener = null;
      tab.document.title = 'המקור נטען…';
      tab.document.body.dir = 'rtl';
      tab.document.body.style.fontFamily = 'Heebo, system-ui, sans-serif';
      tab.document.body.textContent = 'המקור נטען…';
    } catch {
      // The tab is there; the words in it are only a courtesy.
    }
    return tab;
  } catch {
    return null;
  }
}

function closeTab(tab: Window | null) {
  try {
    if (tab && !tab.closed) tab.close();
  } catch {
    // Already gone.
  }
}

interface ManualDeliveryTabProps {
  /** The signing status the page read — the tab is only shown while it says enabled. */
  status: SigningStatus;
}

/**
 * למסירה ידנית — the originals that may not go by email (הוראה 18ב(ד)): paid
 * in cash or by a check that is not crossed "לא סחיר" in the customer's name.
 * Each one's signed original is printed here once and handed over on paper;
 * the server refuses a second print, since any further print is a copy.
 *
 * Below them, the documents held back: waiting for their signature, or — when
 * consent is enforced — for the customer's consent to receive them by email.
 *
 * Managers only; the server enforces it too.
 */
export default function ManualDeliveryTab({ status }: ManualDeliveryTabProps) {
  const paper = useOriginals({ delivery: 'paper', printed: false });
  const held = useOriginals({ delivery: 'held' });
  // What was handed over on paper stays in sight — the last printed first — so
  // a row printed here does not vanish on the next reload; a copy can be
  // mailed or downloaded from it.
  const printedRecently = useOriginals({
    delivery: 'paper', printed: true, order: 'printed', pageSize: PRINTED_RECENTLY_PAGE_SIZE,
  });
  const [marks, setMarks] = useState<Record<string, PrintMark>>({});
  // The row whose "שלח" dialog is open.
  const [sending, setSending] = useState<SignedOriginalRow | null>(null);
  // Guards a double press before the "printing" mark has rendered.
  const inFlight = useRef(new Set<string>());
  const [copying, setCopying] = useState<ReadonlySet<string>>(() => new Set());

  const setMark = (id: string, mark: PrintMark | null) => {
    setMarks((prev) => {
      const next = { ...prev };
      if (mark) next[id] = mark;
      else delete next[id];
      return next;
    });
  };

  async function print(row: SignedOriginalRow) {
    if (inFlight.current.has(row.id) || paperRowView(row, marks[row.id]).state !== 'ready') return;
    inFlight.current.add(row.id);
    const tab = openPendingTab();
    setMark(row.id, { state: 'printing' });
    try {
      const result = await printOriginal(row.id);
      setMark(row.id, markAfterPrint(result, localIsoStamp()));
      if (result.outcome === 'already_printed') {
        closeTab(tab);
        toast.error(result.message);
        return;
      }
      const pdf = result.pdf.type === 'application/pdf'
        ? result.pdf
        : new Blob([result.pdf], { type: 'application/pdf' });
      if (tab && !tab.closed) {
        const url = window.URL.createObjectURL(pdf);
        tab.location.href = url;
        window.setTimeout(() => window.URL.revokeObjectURL(url), OPENED_PDF_LIFETIME_MS);
        toast.success(`המקור של ${row.number} נפתח בלשונית חדשה — הדפיסו אותו ומסרו ללקוח`);
      } else {
        // The browser would not open a tab: this is the one print, so it must not be lost.
        saveBlob(pdf, 'application/pdf', originalFilename(row));
        toast.success(`המקור של ${row.number} נשמר כקובץ — הדפיסו אותו ומסרו ללקוח`);
      }
    } catch (error) {
      closeTab(tab);
      setMark(row.id, null);
      toast.error(printFailureMessage(error));
    } finally {
      inFlight.current.delete(row.id);
    }
  }

  /** A row left a list (mailed, or signed after its allocation number): the lists are read again. */
  const reloadLists = () => {
    paper.retry();
    held.retry();
    printedRecently.retry();
  };

  /** A copy ("העתק", drawn again now) of a printed original, saved for the office. */
  async function saveCopy(row: SignedOriginalRow) {
    if (copying.has(row.id)) return;
    setCopying((prev) => new Set(prev).add(row.id));
    try {
      await downloadSignedCopy(row);
      toast.success(`העתק של ${row.number} נשמר`);
    } catch (error) {
      toast.error(errorSentence(error) || 'הורדת ההעתק נכשלה — נסו שוב');
    } finally {
      setCopying((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  const paperLoading = paper.list.loadState === 'loading';
  const heldLoading = held.list.loadState === 'loading';
  const paperWaiting = waitingToPrint(paper.list.rows, marks)
    + Math.max(0, paper.list.count - paper.list.rows.length);

  function renderPaperRow(row: SignedOriginalRow): ReactNode {
    const view = paperRowView(row, marks[row.id]);
    return (
      <tr key={row.id}>
        <td><span className={styles.number}>{row.number || '—'}</span></td>
        <td className={styles.wrapCell}>{row.document_type_label || <span className={styles.dash}>—</span>}</td>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{row.customer_name || '—'}</span>
        </td>
        <td>{row.document_date ? formatDate(row.document_date) : <span className={styles.dash}>—</span>}</td>
        <td className={`${theme.n} ${styles.money}`}>{formatAmount(row.total)}</td>
        <td className={styles.wrapCell}>
          {row.delivery_reason || <span className={styles.dash}>—</span>}
          {view.note && (
            <span className={`${styles.subLine} ${view.state === 'printed' ? styles.printedNote : ''}`}>{view.note}</span>
          )}
        </td>
        <td className={theme.n}>
          {view.state === 'printed' ? (
            <span className={styles.actions}>
              <span className={`${pageStyles.statusBadge} ${pageStyles.statusCompleted}`}>
                <CheckCircle2 size={13} aria-hidden="true" style={{ marginInlineEnd: 4 }} />
                הודפס
              </span>
              {/* The paper original was handed over: what goes by mail now is a copy. */}
              <button
                type="button"
                className={styles.actionBtn}
                aria-label={`שליחת העתק של ${row.number} במייל`}
                onClick={() => setSending(rowWithMark(row, marks[row.id]))}
              >
                <Send size={14} aria-hidden="true" />
                {sendActionLabel(rowWithMark(row, marks[row.id]))}
              </button>
            </span>
          ) : (
            <span className={styles.actions}>
              {paperRowCanBeMailed(row) && view.state === 'ready' && (
                <button
                  type="button"
                  className={styles.actionBtn}
                  aria-label={`שליחת המקור של ${row.number} במייל`}
                  onClick={() => setSending(row)}
                >
                  <Send size={14} aria-hidden="true" />
                  {sendActionLabel(row)}
                </button>
              )}
              <button
                type="button"
                className={styles.actionBtn}
                disabled={view.state === 'printing'}
                aria-label={`הדפסת המקור של ${row.number} למסירה ללקוח`}
                onClick={() => void print(row)}
              >
                {view.state === 'printing'
                  ? <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                  : <Printer size={14} aria-hidden="true" />}
                {view.action}
              </button>
            </span>
          )}
        </td>
      </tr>
    );
  }

  function renderHeldRow(row: SignedOriginalRow): ReactNode {
    return (
      <tr key={row.id}>
        <td><span className={styles.number}>{row.number || '—'}</span></td>
        <td className={styles.wrapCell}>{row.document_type_label || <span className={styles.dash}>—</span>}</td>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{row.customer_name || '—'}</span>
        </td>
        <td>{row.document_date ? formatDate(row.document_date) : <span className={styles.dash}>—</span>}</td>
        <td className={`${theme.n} ${styles.money}`}>{formatAmount(row.total)}</td>
        <td className={styles.wrapCell}>
          <span className={`${pageStyles.statusBadge} ${pageStyles.statusPending}`}>{heldStatusLabel(row)}</span>
          {heldReasonNote(row) && <span className={styles.subLine}>{heldReasonNote(row)}</span>}
        </td>
        <td className={theme.n}>
          {row.awaiting_allocation ? (
            <AllocationEntry documentId={row.kind === 'formal' ? row.source_id : ''} number={row.number} onSaved={reloadLists} />
          ) : (
            <span className={styles.dash}>—</span>
          )}
        </td>
      </tr>
    );
  }

  function renderPaper(): ReactNode {
    const { list } = paper;
    if (list.loadState === 'loading') {
      return <TableSkeleton columns={PAPER_COLUMNS} rows={4} tableClassName={theme.table} label="טוען מסמכים למסירה על נייר" />;
    }
    if (list.loadState === 'error') {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את המסמכים למסירה"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={paper.retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }
    if (list.rows.length === 0) {
      return (
        <EmptyPanel
          icon={<Printer className={styles.emptyIcon} aria-hidden="true" />}
          title="אין מסמכים שממתינים למסירה על נייר"
          text="מסמך ששולם במזומן או בצ׳ק שאינו משורטט על שם הלקוח, או שאין ללקוח כתובת מייל, יופיע כאן להדפסת המקור."
        />
      );
    }
    return (
      <>
        <div className={theme.tableScroll}>
          <table className={`${theme.table} ${styles.table}`}>
            <caption className={styles.srOnly}>מסמכים שהמקור שלהם נמסר ללקוח על נייר</caption>
            <thead>
              <tr>
                <th scope="col">מספר</th>
                <th scope="col">סוג</th>
                <th scope="col">לקוח</th>
                <th scope="col">תאריך</th>
                <th scope="col" className={theme.n}>סכום</th>
                <th scope="col">למה על נייר</th>
                <th scope="col" className={theme.n}>מקור</th>
              </tr>
            </thead>
            <tbody>{list.rows.map(renderPaperRow)}</tbody>
          </table>
        </div>
        {list.count > list.rows.length && (
          <div className={styles.moreRow}>
            <button type="button" className={styles.emptyBtn} disabled={list.loadingMore} onClick={paper.loadMore}>
              {list.loadingMore ? 'טוען...' : 'טען מסמכים נוספים'}
            </button>
          </div>
        )}
        <p className={styles.footnote}>
          המקור החתום מודפס פעם אחת בלבד, ומועד ההדפסה נרשם. כל הדפסה אחרת של המסמך היא העתק. מסמך שכאן רק כי
          אין ללקוח כתובת מייל אפשר לשלוח במייל עם כתובת — והוא יישלח לבד כשתירשם כתובת בכרטיס.
        </p>
      </>
    );
  }

  function renderHeld(): ReactNode {
    const { list } = held;
    if (list.loadState === 'loading') {
      return <TableSkeleton columns={HELD_COLUMNS} rows={3} tableClassName={theme.table} label="טוען מסמכים ממתינים" />;
    }
    if (list.loadState === 'error') {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את המסמכים הממתינים"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={held.retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }
    if (list.rows.length === 0) {
      return (
        <EmptyPanel
          icon={<Hourglass className={styles.emptyIcon} aria-hidden="true" />}
          title="אין מסמכים ממתינים"
          text="כל מסמך שהונפק נחתם, ונשלח או הועבר למסירה על נייר."
        />
      );
    }
    return (
      <>
        <div className={theme.tableScroll}>
          <table className={`${theme.table} ${styles.table}`}>
            <caption className={styles.srOnly}>מסמכים שלא נשלחו עדיין, ולמה</caption>
            <thead>
              <tr>
                <th scope="col">מספר</th>
                <th scope="col">סוג</th>
                <th scope="col">לקוח</th>
                <th scope="col">תאריך</th>
                <th scope="col" className={theme.n}>סכום</th>
                <th scope="col">ממתין ל…</th>
                <th scope="col" className={theme.n}>מספר הקצאה</th>
              </tr>
            </thead>
            <tbody>{list.rows.map(renderHeldRow)}</tbody>
          </table>
        </div>
        {list.count > list.rows.length && (
          <div className={styles.moreRow}>
            <button type="button" className={styles.emptyBtn} disabled={list.loadingMore} onClick={held.loadMore}>
              {list.loadingMore ? 'טוען...' : 'טען מסמכים נוספים'}
            </button>
          </div>
        )}
        <p className={styles.footnote}>
          מסמך שממתין לחתימה נחתם ונשלח אוטומטית בהרצה הבאה, בתוך כמה דקות. מסמך שממתין להסכמה יישלח אחרי שתירשם
          ההסכמה של הלקוח לקבל מסמכים במייל. חשבונית שממתינה למספר הקצאה נחתמת ונשלחת ברגע שמזינים את המספר שהתקבל
          מרשות המסים — אחרי החתימה אי אפשר לשנות אותו.
        </p>
      </>
    );
  }

  function renderPrintedRow(row: SignedOriginalRow): ReactNode {
    const busy = copying.has(row.id);
    return (
      <tr key={row.id}>
        <td><span className={styles.number}>{row.number || '—'}</span></td>
        <td className={styles.wrapCell}>{row.document_type_label || <span className={styles.dash}>—</span>}</td>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{row.customer_name || '—'}</span>
        </td>
        <td>{row.document_date ? formatDate(row.document_date) : <span className={styles.dash}>—</span>}</td>
        <td className={`${theme.n} ${styles.money}`}>{formatAmount(row.total)}</td>
        <td className={styles.wrapCell}>
          <span className={`${pageStyles.statusBadge} ${pageStyles.statusCompleted}`}>
            <CheckCircle2 size={13} aria-hidden="true" style={{ marginInlineEnd: 4 }} />
            הודפס
          </span>
          {printedAtLine(row) && <span className={`${styles.subLine} ${styles.printedNote}`}>{printedAtLine(row)}</span>}
        </td>
        <td className={theme.n}>
          <span className={styles.actions}>
            {canSendCopy(row) && (
              <button
                type="button"
                className={styles.actionBtn}
                aria-label={`שליחת העתק של ${row.number} במייל`}
                onClick={() => setSending(row)}
              >
                <Send size={14} aria-hidden="true" />
                שלח העתק
              </button>
            )}
            <button
              type="button"
              className={styles.actionBtn}
              disabled={busy}
              aria-label={`הורדת העתק של ${row.number}`}
              onClick={() => void saveCopy(row)}
            >
              {busy
                ? <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                : <Download size={14} aria-hidden="true" />}
              העתק
            </button>
          </span>
        </td>
      </tr>
    );
  }

  function renderPrinted(): ReactNode {
    const { list } = printedRecently;
    if (list.loadState === 'loading') {
      return <TableSkeleton columns={PRINTED_COLUMNS} rows={3} tableClassName={theme.table} label="טוען מסמכים שהודפסו" />;
    }
    if (list.loadState === 'error') {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את המסמכים שהודפסו"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={printedRecently.retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }
    if (list.rows.length === 0) {
      return (
        <EmptyPanel
          icon={<History className={styles.emptyIcon} aria-hidden="true" />}
          title="עוד לא הודפס מקור למסירה"
          text="מקור שיודפס כאן למסירה ללקוח יופיע ברשימה הזאת, עם מועד ההדפסה."
        />
      );
    }
    return (
      <>
        <div className={theme.tableScroll}>
          <table className={`${theme.table} ${styles.table}`}>
            <caption className={styles.srOnly}>מקורות שהודפסו ונמסרו על נייר, האחרונים קודם</caption>
            <thead>
              <tr>
                <th scope="col">מספר</th>
                <th scope="col">סוג</th>
                <th scope="col">לקוח</th>
                <th scope="col">תאריך</th>
                <th scope="col" className={theme.n}>סכום</th>
                <th scope="col">הודפס</th>
                <th scope="col" className={theme.n}>העתק</th>
              </tr>
            </thead>
            <tbody>{list.rows.map(renderPrintedRow)}</tbody>
          </table>
        </div>
        {list.count > list.rows.length && (
          <div className={styles.moreRow}>
            <button type="button" className={styles.emptyBtn} disabled={list.loadingMore} onClick={printedRecently.loadMore}>
              {list.loadingMore ? 'טוען...' : 'טען מסמכים נוספים'}
            </button>
          </div>
        )}
        <p className={styles.footnote}>
          המקור של כל מסמך כאן כבר נמסר על נייר. מכאן אפשר רק לשלוח ללקוח העתק במייל, לכל כתובת, או להוריד העתק
          להדפסה — מסומן &quot;העתק&quot;.
        </p>
      </>
    );
  }

  const lastSigned = formatSigningStamp(status.last_signed_at);
  const missingNotice = missingOriginalNotice(status);

  return (
    <div className={styles.tab}>
      <div className={`${theme.grid} ${theme.g3} ${styles.kpis}`}>
        <Kpi
          label="ממתינים להדפסת מקור"
          loading={paperLoading}
          value={count(paperWaiting)}
          foot={paperWaiting > 0 ? 'להדפיס ולמסור ללקוח' : 'הכול נמסר'}
          negative={paperWaiting > 0}
        />
        <Kpi
          label="ממתינים"
          loading={heldLoading}
          value={count(held.list.count)}
          foot={status.counts.awaiting_allocation > 0
            ? `מהם ${count(status.counts.awaiting_allocation)} ממתינים למספר הקצאה`
            : status.consent_enforced ? 'אכיפת ההסכמה פעילה' : 'ההסכמה רק מדווחת, לא עוצרת שליחה'}
        />
        <Kpi
          label="נחתמו היום"
          loading={false}
          value={count(status.counts.signed_today)}
          foot={lastSigned ? `חתימה אחרונה: ${lastSigned}` : 'עוד לא נחתם מסמך'}
        />
      </div>

      {missingNotice && (
        <p className={styles.notice} role="status">
          <AlertCircle size={15} aria-hidden="true" />
          {missingNotice}
        </p>
      )}

      <section className={theme.card} aria-labelledby="manual-delivery-paper-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="manual-delivery-paper-title" className={theme.cardTitle}>
              למסירה על נייר
            </h2>
            <p className={styles.cardSub}>שולמו במזומן או בצ׳ק לא משורטט (הוראה 18ב(ד)), או שאין ללקוח כתובת מייל</p>
          </div>
        </div>
        {renderPaper()}
      </section>

      <section className={theme.card} aria-labelledby="manual-delivery-printed-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="manual-delivery-printed-title" className={theme.cardTitle}>
              הודפסו לאחרונה
            </h2>
            <p className={styles.cardSub}>מקורות שהודפסו ונמסרו על נייר — האחרונים קודם. שליחה או הורדה מכאן היא העתק</p>
          </div>
        </div>
        {renderPrinted()}
      </section>

      <section className={theme.card} aria-labelledby="manual-delivery-held-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="manual-delivery-held-title" className={theme.cardTitle}>
              ממתינים
            </h2>
            <p className={styles.cardSub}>הונפקו ועוד לא נשלחו — ממתינים למספר הקצאה, לחתימה, או להסכמת הלקוח לקבל מסמכים במייל</p>
          </div>
        </div>
        {renderHeld()}
      </section>

      <SendOriginalDialog row={sending} onClose={() => setSending(null)} onSent={reloadLists} />
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  foot: string;
  loading: boolean;
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
