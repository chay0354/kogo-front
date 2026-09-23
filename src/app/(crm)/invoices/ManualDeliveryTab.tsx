'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Hourglass, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import { saveBlob } from '@/lib/documentsApi';
import {
  fetchSignedOriginals,
  printOriginal,
  type SignedOriginalDelivery,
  type SignedOriginalRow,
  type SigningStatus,
} from '@/lib/signingApi';
import { formatSigningStamp, localIsoStamp } from '@/lib/signingUtils';
import {
  heldStatusLabel,
  MANUAL_DELIVERY_PAGE_SIZE,
  markAfterPrint,
  originalFilename,
  paperRowView,
  printFailureMessage,
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
const HELD_COLUMNS = 6;

/** How long a PDF opened in a new tab stays readable there, for its viewer's own print and save. */
const OPENED_PDF_LIFETIME_MS = 10 * 60 * 1000;

const count = (n: number) => n.toLocaleString('he-IL');

/**
 * One list of originals — paper-and-not-printed, or held — with "load more".
 * An answer that arrives after a newer request went out is dropped, so a
 * reload racing a "load more" cannot leave the list half from each.
 */
function useOriginals(query: { delivery: SignedOriginalDelivery; printed?: boolean }) {
  const [list, setList] = useState<OriginalsList>(EMPTY_LIST);
  const latest = useRef(0);
  const { delivery, printed } = query;

  const load = useCallback(async (offset: number) => {
    const request = ++latest.current;
    if (offset > 0) setList((prev) => ({ ...prev, loadingMore: true }));
    try {
      const page = await fetchSignedOriginals({ delivery, printed, limit: MANUAL_DELIVERY_PAGE_SIZE, offset });
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
  }, [delivery, printed]);

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
  const [marks, setMarks] = useState<Record<string, PrintMark>>({});
  // Guards a double press before the "printing" mark has rendered.
  const inFlight = useRef(new Set<string>());

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
            <span className={`${pageStyles.statusBadge} ${pageStyles.statusCompleted}`}>
              <CheckCircle2 size={13} aria-hidden="true" style={{ marginInlineEnd: 4 }} />
              הודפס
            </span>
          ) : (
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
          {row.delivery_reason && <span className={styles.subLine}>{row.delivery_reason}</span>}
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
          text="מסמך ששולם במזומן או בצ׳ק שאינו משורטט על שם הלקוח לא נשלח במייל — הוא יופיע כאן להדפסת המקור."
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
          המקור החתום מודפס פעם אחת בלבד, ומועד ההדפסה נרשם. כל הדפסה אחרת של המסמך היא העתק.
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
          ההסכמה של הלקוח לקבל מסמכים במייל.
        </p>
      </>
    );
  }

  const lastSigned = formatSigningStamp(status.last_signed_at);

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
          label="ממתינים לחתימה או להסכמה"
          loading={heldLoading}
          value={count(held.list.count)}
          foot={status.consent_enforced ? 'אכיפת ההסכמה פעילה' : 'ההסכמה רק מדווחת, לא עוצרת שליחה'}
        />
        <Kpi
          label="נחתמו היום"
          loading={false}
          value={count(status.counts.signed_today)}
          foot={lastSigned ? `חתימה אחרונה: ${lastSigned}` : 'עוד לא נחתם מסמך'}
        />
      </div>

      <section className={theme.card} aria-labelledby="manual-delivery-paper-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="manual-delivery-paper-title" className={theme.cardTitle}>
              למסירה על נייר
            </h2>
            <p className={styles.cardSub}>שולמו במזומן או בצ׳ק לא משורטט — לא נשלחים במייל (הוראה 18ב(ד))</p>
          </div>
        </div>
        {renderPaper()}
      </section>

      <section className={theme.card} aria-labelledby="manual-delivery-held-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="manual-delivery-held-title" className={theme.cardTitle}>
              ממתינים
            </h2>
            <p className={styles.cardSub}>הונפקו ועוד לא נשלחו — ממתינים לחתימה, או להסכמת הלקוח לקבל מסמכים במייל</p>
          </div>
        </div>
        {renderHeld()}
      </section>
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
