'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileArchive,
  FileSearch,
  FileSignature,
  Info,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import { saveBlob } from '@/lib/documentsApi';
import {
  downloadSignedOriginal,
  fetchArchiveStatus,
  fetchSignedExportPart,
  fetchSignedOriginals,
  runArchiveBatch,
  SIGNED_EXPORT_PART_SIZE,
  type ArchiveStatus,
  type SignedOriginalKind,
  type SignedOriginalPurpose,
  type SignedOriginalRow,
  type SignedOriginalsFilter,
} from '@/lib/signingApi';
import { formatSigningStamp } from '@/lib/signingUtils';
import LedgerFilterBar, { LedgerSelect } from './LedgerFilterBar';
import {
  ARCHIVE_RUN_BATCH_SIZE,
  archiveExtraActiveCount,
  archiveFilterQuery,
  archivePageCount,
  archivePageOffset,
  archiveProgressPercent,
  archiveRunCounts,
  archiveRunEndText,
  archiveTotals,
  canRunArchive,
  deliveryView,
  downloadFailureMessage,
  driveArchiveRun,
  driveSignedExport,
  exportEndText,
  exportPartsFor,
  exportPercent,
  exportProgressText,
  formatFileSize,
  KIND_OPTIONS,
  kindArchivedLine,
  kindLabel,
  kindPercent,
  NO_OWN_FILTERS,
  pageSpanLabel,
  PURPOSE_OPTIONS,
  purposeLabel,
  SIGNED_ARCHIVE_HIDDEN_FIELDS,
  SIGNED_ARCHIVE_INITIAL_FILTERS,
  SIGNED_ARCHIVE_PAGE_SIZE,
  signedExportFilename,
  startArchiveProgress,
  type ArchiveOwnFilters,
  type ArchiveRunOutcome,
  type ArchiveRunProgress,
  type DeliveryTone,
  type ExportOutcome,
  type ExportProgress,
  type NoticeTone,
} from './signedArchive';
import { useLedgerFilters } from './useLedgerFilters';
import { formatAmount, formatDate } from './utils';
import pageStyles from './invoices.module.css';
import styles from './signedArchive.module.css';

type LoadState = 'loading' | 'ready' | 'error';

/** Typing waits this long before the list is asked again, so each key press is not a request. */
const REQUEST_DELAY_MS = 300;

const LIST_COLUMNS = 9;

const count = (n: number) => n.toLocaleString('he-IL');

interface PageState {
  /** The query, page and reload this answer belongs to. */
  key: string;
  queryKey: string;
  rows: SignedOriginalRow[];
  count: number;
  loadState: LoadState;
}

const NO_ROWS: SignedOriginalRow[] = [];

/**
 * One page of the signed files for the filter. An answer that arrives after a
 * newer request went out is dropped, so fast typing or paging cannot leave the
 * table showing an older question's rows.
 */
function useSignedPage(query: SignedOriginalsFilter, page: number, version: number) {
  const queryKey = JSON.stringify(query);
  const key = `${queryKey}#${page}#${version}`;
  const [state, setState] = useState<PageState>({
    key: '',
    queryKey: '',
    rows: NO_ROWS,
    count: 0,
    loadState: 'loading',
  });
  const latest = useRef(0);
  const current = useRef(query);
  current.current = query;

  useEffect(() => {
    const request = ++latest.current;
    // The first load and a page turn go at once; only a changed filter waits for the typing to settle.
    const delay = state.key === '' || state.queryKey === queryKey ? 0 : REQUEST_DELAY_MS;
    const timer = window.setTimeout(() => {
      fetchSignedOriginals({
        ...current.current,
        limit: SIGNED_ARCHIVE_PAGE_SIZE,
        offset: archivePageOffset(page),
      })
        .then((result) => {
          if (request !== latest.current) return;
          setState({ key, queryKey, rows: result.results, count: result.count, loadState: 'ready' });
        })
        .catch((error) => {
          if (request !== latest.current) return;
          console.error('Error loading the signed files:', error);
          setState({ key, queryKey, rows: NO_ROWS, count: 0, loadState: 'error' });
        });
    }, delay);
    return () => window.clearTimeout(timer);
    // `key` is the query, the page and the reload; `query` is a new object on every change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // An answer still on its way when the tab closes has nowhere to go.
  useEffect(() => () => {
    latest.current += 1;
  }, []);

  return { ...state, loading: state.key !== key, queryKey };
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'confirm' }
  | { phase: 'running'; progress: ArchiveRunProgress; stopping: boolean }
  | { phase: 'finished'; outcome: ArchiveRunOutcome };

type ExportState =
  | { phase: 'idle' }
  | { phase: 'running'; progress: ExportProgress; cancelling: boolean }
  | { phase: 'finished'; outcome: ExportOutcome };

const NOTICE_CLASS: Record<NoticeTone, string> = {
  done: styles.noticeDone,
  info: styles.noticeInfo,
  error: styles.noticeError,
};

const DELIVERY_CLASS: Record<DeliveryTone, string> = {
  done: pageStyles.statusCompleted,
  waiting: pageStyles.statusPending,
  quiet: pageStyles.statusRefunded,
};

/**
 * ארכיון חתום — the owner's way to every signed file: the מקור of each document
 * issued since signing began, and the signed העתק לארכיון of each document
 * issued before it. Each file downloads exactly as stored, the filter's files
 * go to the accountant as ZIP parts, and the archive copies of the older
 * documents are signed from here, batch after batch, once the server's
 * archive switch is on.
 *
 * Managers only; the server enforces it too.
 */
export default function SignedArchiveTab() {
  // ---- the archive's status ----
  const [archive, setArchive] = useState<{ status: ArchiveStatus | null; loadState: LoadState }>({
    status: null,
    loadState: 'loading',
  });
  const archiveRequest = useRef(0);

  const loadArchive = useCallback(async (quiet = false) => {
    const request = ++archiveRequest.current;
    if (!quiet) setArchive((prev) => ({ ...prev, loadState: 'loading' }));
    try {
      const status = await fetchArchiveStatus();
      if (request !== archiveRequest.current) return;
      setArchive({ status, loadState: status ? 'ready' : 'error' });
    } catch (error) {
      if (request !== archiveRequest.current) return;
      console.error('Error loading the archive status:', error);
      setArchive((prev) => (quiet && prev.status ? prev : { status: null, loadState: 'error' }));
    }
  }, []);

  useEffect(() => {
    void loadArchive();
    return () => {
      archiveRequest.current += 1;
    };
  }, [loadArchive]);

  // ---- the filter and the list ----
  const ledger = useLedgerFilters(SIGNED_ARCHIVE_INITIAL_FILTERS);
  const { filters } = ledger;
  const [own, setOwn] = useState<ArchiveOwnFilters>(NO_OWN_FILTERS);
  const query = useMemo(
    () => archiveFilterQuery(filters, own),
    // Only the fields the archive reads; the rest of the shared model is hidden here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.search, filters.dateFrom, filters.dateTo, own],
  );
  const queryKey = JSON.stringify(query);
  // Any change to what is listed goes back to page one.
  const [pageState, setPageState] = useState({ queryKey, page: 1 });
  const page = pageState.queryKey === queryKey ? pageState.page : 1;
  const [version, setVersion] = useState(0);
  const list = useSignedPage(query, page, version);
  const pageCount = archivePageCount(list.count);

  // A page that emptied under the office (fewer files than when it was turned to) goes back to the last one.
  useEffect(() => {
    if (!list.loading && list.loadState === 'ready' && list.rows.length === 0 && page > 1 && list.count > 0) {
      setPageState({ queryKey, page: archivePageCount(list.count) });
    }
  }, [list.loading, list.loadState, list.rows.length, list.count, page, queryKey]);

  // ---- the run and the export, stopped when the tab closes ----
  const mounted = useRef(true);
  const stopRun = useRef(false);
  const runInFlight = useRef(false);
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A batch already sent finishes on the server; no new one is asked for.
      stopRun.current = true;
      exportAbort.current?.abort();
    };
  }, []);

  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  const [exporting, setExporting] = useState<ExportState>({ phase: 'idle' });
  const [downloading, setDownloading] = useState<ReadonlySet<string>>(() => new Set());
  const downloadsInFlight = useRef(new Set<string>());

  const status = archive.status;
  const totals = archiveTotals(status);
  const runBusy = run.phase === 'running';

  async function startRun() {
    if (runInFlight.current || !canRunArchive(status, false)) return;
    runInFlight.current = true;
    stopRun.current = false;
    const startRemaining = totals.remaining;
    setRun({ phase: 'running', progress: startArchiveProgress(startRemaining), stopping: false });
    try {
      const outcome = await driveArchiveRun({
        runBatch: () => runArchiveBatch({ limit: ARCHIVE_RUN_BATCH_SIZE }),
        shouldStop: () => stopRun.current,
        startRemaining,
        onProgress: (progress) => {
          if (!mounted.current) return;
          setRun((prev) => ({ phase: 'running', progress, stopping: prev.phase === 'running' && prev.stopping }));
        },
      });
      if (outcome.end !== 'done' && outcome.end !== 'stopped') {
        console.error('The archive run ended early:', outcome.end, outcome.detail);
      }
      if (!mounted.current) return;
      setRun({ phase: 'finished', outcome });
    } finally {
      runInFlight.current = false;
      if (mounted.current) {
        // What was signed shows in the counts and in the list.
        void loadArchive(true);
        setVersion((v) => v + 1);
      }
    }
  }

  function requestStop() {
    stopRun.current = true;
    setRun((prev) => (prev.phase === 'running' ? { ...prev, stopping: true } : prev));
  }

  const exportReady = !list.loading && list.loadState === 'ready' && list.count > 0;
  const exportBusy = exporting.phase === 'running';

  async function startExport() {
    if (exportAbort.current || !exportReady) return;
    // The files the list shows now — the export follows the filter as it was when pressed.
    const filter = query;
    const knownTotal = list.count;
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting({
      phase: 'running',
      progress: { partsSaved: 0, parts: exportPartsFor(knownTotal), filesSaved: 0, total: knownTotal },
      cancelling: false,
    });
    try {
      const outcome = await driveSignedExport({
        knownTotal,
        fetchPart: (offset) => fetchSignedExportPart(filter, offset, {
          limit: SIGNED_EXPORT_PART_SIZE,
          knownTotal,
          signal: controller.signal,
        }),
        savePart: (zip, index, parts) => saveBlob(zip, 'application/zip', signedExportFilename(filter, index, parts)),
        shouldStop: () => controller.signal.aborted,
        onProgress: (progress) => {
          if (!mounted.current) return;
          setExporting((prev) => ({
            phase: 'running',
            progress,
            cancelling: prev.phase === 'running' && prev.cancelling,
          }));
        },
      });
      if (outcome.end === 'failed') console.error('The signed export failed:', outcome.error);
      if (mounted.current) setExporting({ phase: 'finished', outcome });
    } finally {
      exportAbort.current = null;
    }
  }

  function cancelExport() {
    exportAbort.current?.abort();
    setExporting((prev) => (prev.phase === 'running' ? { ...prev, cancelling: true } : prev));
  }

  async function download(row: SignedOriginalRow) {
    if (downloadsInFlight.current.has(row.id)) return;
    downloadsInFlight.current.add(row.id);
    setDownloading((prev) => new Set(prev).add(row.id));
    try {
      const { check } = await downloadSignedOriginal(row);
      toast.success(check === 'verified'
        ? `${row.number} נשמר — זהה לקובץ החתום השמור`
        : `${row.number} נשמר`);
    } catch (error) {
      toast.error(downloadFailureMessage(error));
    } finally {
      downloadsInFlight.current.delete(row.id);
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  // ------------------------------------------------------------ the status card

  function renderStatus(): ReactNode {
    if (archive.loadState === 'loading' && !status) {
      return (
        <div className={styles.kinds} aria-busy="true" aria-label="טוען את מצב הארכיון">
          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.kind}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-36 my-2" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      );
    }
    if (!status) {
      return (
        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
          <AlertCircle size={16} aria-hidden="true" className={styles.noticeIcon} />
          <div className={styles.noticeBody}>
            <p className={styles.noticeText}>לא הצלחנו לטעון את מצב הארכיון. רשימת הקבצים למטה זמינה כרגיל.</p>
          </div>
          <button type="button" className={styles.ghostBtn} onClick={() => void loadArchive()}>
            נסו שוב
          </button>
        </div>
      );
    }
    const lastSigned = formatSigningStamp(status.last_signed_at);
    return (
      <>
        {status.kinds.length > 0 && (
          <ul className={styles.kinds} aria-label="מצב הארכיון לפי תחום">
            {status.kinds.map((kind) => {
              const percent = kindPercent(kind);
              const label = kindLabel(kind.kind, kind.label);
              return (
                <li key={kind.kind || kind.label} className={styles.kind}>
                  <span className={styles.kindLabel}>{label}</span>
                  <span className={styles.kindFigure}>{kindArchivedLine(kind)}</span>
                  <span
                    className={styles.meter}
                    role="img"
                    aria-label={`${label}: ${kindArchivedLine(kind)}`}
                  >
                    <span
                      className={`${styles.meterFill} ${percent >= 100 ? styles.meterFull : ''}`}
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className={styles.kindSub}>
                    {kind.remaining > 0 ? `נותרו ${count(kind.remaining)}` : 'הכול בארכיון'}
                    {' · '}
                    {count(kind.originals)} מקורות חתומים
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.statusLine}>
          <span>
            נותרו לחתימה: <b>{count(totals.remaining)}</b>
          </span>
          <span className={styles.sep} aria-hidden="true">·</span>
          <span>
            העתק אחרון נחתם: <b>{lastSigned || 'עוד לא נחתם העתק'}</b>
          </span>
        </p>

        {status.issued_before && (
          <p className={styles.statusLine}>
            <span>
              הארכיון כולל מסמכים שהונפקו לפני שהחתימה הופעלה: <b>{formatSigningStamp(status.issued_before)}</b>
            </span>
          </p>
        )}

        {status.backup?.enabled && (
          <p className={styles.statusLine}>
            <span>
              גיבוי נעול ב-Google (תל אביב, 10 שנים): <b>{count(status.backup.copied)}</b> קבצים הועתקו
            </span>
            {status.backup.pending > 0 && (
              <>
                <span className={styles.sep} aria-hidden="true">·</span>
                <span>ממתינים להעתקה: <b>{count(status.backup.pending)}</b></span>
              </>
            )}
          </p>
        )}

        {status.backup?.enabled && status.backup.last_error && (
          <div className={`${styles.notice} ${styles.noticeInfo}`} role="note">
            <Info size={16} aria-hidden="true" className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <p className={styles.noticeText}>
                העתקה לגיבוי הנעול נכשלה בפעם האחרונה, והיא תנוסה שוב אוטומטית בתוך כמה דקות.
              </p>
            </div>
          </div>
        )}

        {status.enabled && status.blocked && (
          <div className={`${styles.notice} ${styles.noticeInfo}`} role="note">
            <Info size={16} aria-hidden="true" className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <p className={styles.noticeText}>
                חתימת הארכיון מושהית: החתימה ללקוחות פעילה, ועוד לא הוגדר בשרת ממתי. בלי המועד הזה הארכיון לא
                רץ, כדי שלא ייקח מסמך חדש שצריך להיחתם כמקור.
              </p>
            </div>
          </div>
        )}

        {!status.enabled && (
          <div className={`${styles.notice} ${styles.noticeInfo}`} role="note">
            <Info size={16} aria-hidden="true" className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <p className={styles.noticeText}>
                חתימת הארכיון עוד לא הופעלה. המסמכים שהונפקו לפני החתימה שמורים כמו שהיו, וכשההגדרה תופעל בשרת
                יופיע כאן כפתור לחתימת ההעתקים.
              </p>
            </div>
          </div>
        )}

        {status.enabled && !status.blocked && totals.remaining === 0 && run.phase !== 'finished' && (
          <div className={`${styles.notice} ${styles.noticeDone}`} role="status">
            <CheckCircle2 size={16} aria-hidden="true" className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <p className={styles.noticeText}>לכל מסמך שהונפק לפני החתימה יש העתק חתום בארכיון.</p>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderRun(): ReactNode {
    if (run.phase === 'confirm') {
      return (
        <div
          className={styles.confirm}
          role="alertdialog"
          aria-labelledby="signed-archive-confirm-title"
          aria-describedby="signed-archive-confirm-text"
        >
          <p id="signed-archive-confirm-title" className={styles.confirmTitle}>
            <AlertTriangle size={16} aria-hidden="true" />
            לפני שחותמים את הארכיון
          </p>
          <ul id="signed-archive-confirm-text" className={styles.confirmList}>
            <li>
              ייחתם העתק לארכיון לכל אחד מ-{count(totals.remaining)} המסמכים שנותרו, עד {ARCHIVE_RUN_BATCH_SIZE} בכל סבב.
            </li>
            <li>המסמך עצמו — מספרו, תאריכו וסכומו — לא משתנה. ההעתק נשמר לצידו.</li>
            <li>ההעתקים נשמרים בארכיון בלבד ואינם נשלחים ללקוחות.</li>
            <li>העתק שנחתם נשמר לצמיתות ואי אפשר למחוק אותו, ועותק ממנו נשמר גם בגיבוי הנעול.</li>
            <li>אפשר לעצור בכל רגע: מה שנחתם נשמר, וההמשך מתחיל מאותה נקודה.</li>
          </ul>
          <div className={styles.confirmRow}>
            <button type="button" className={styles.primaryBtn} onClick={() => void startRun()} autoFocus>
              <FileSignature size={15} aria-hidden="true" />
              התחלת החתימה
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => setRun({ phase: 'idle' })}>
              ביטול
            </button>
          </div>
        </div>
      );
    }

    if (run.phase === 'running') {
      const percent = archiveProgressPercent(run.progress);
      const counts = archiveRunCounts(run.progress);
      return (
        <div className={styles.progressBox}>
          <div className={styles.progressHead}>
            <span className={styles.progressTitle}>
              <Loader2 size={15} className={styles.spin} aria-hidden="true" />
              {run.stopping ? 'עוצר אחרי הסבב הנוכחי…' : 'חותם את הארכיון…'}
            </span>
            <button type="button" className={styles.ghostBtn} disabled={run.stopping} onClick={requestStop}>
              {run.stopping ? 'עוצר…' : 'עצירה'}
            </button>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="התקדמות חתימת הארכיון"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent}% — ${counts}`}
          >
            <span className={styles.progressFill} style={{ width: `${percent}%` }} />
          </div>
          <p className={styles.progressText} aria-live="polite">{counts}</p>
          <p className={styles.progressHint}>
            אפשר להמשיך לעבוד בינתיים. מעבר ללשונית אחרת עוצר את החתימה אחרי הסבב הנוכחי.
          </p>
        </div>
      );
    }

    if (run.phase === 'finished') {
      const { text, tone } = archiveRunEndText(run.outcome);
      const { failed } = run.outcome.progress;
      const detail = run.outcome.detail;
      return (
        <div className={`${styles.notice} ${NOTICE_CLASS[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
          {tone === 'done'
            ? <CheckCircle2 size={16} aria-hidden="true" className={styles.noticeIcon} />
            : tone === 'info'
              ? <Info size={16} aria-hidden="true" className={styles.noticeIcon} />
              : <AlertCircle size={16} aria-hidden="true" className={styles.noticeIcon} />}
          <div className={styles.noticeBody}>
            <p className={styles.noticeText}>{text}</p>
            {detail && <p className={styles.noticeDetail}>תשובת השרת: {detail}</p>}
            <p className={styles.noticeDetail}>{archiveRunCounts(run.outcome.progress)}</p>
            {failed.length > 0 && (
              <details className={styles.failures} open={failed.length <= 10}>
                <summary>
                  {failed.length === 1 ? 'מסמך אחד לא נחתם' : `${count(failed.length)} מסמכים לא נחתמו`}
                </summary>
                <ul className={styles.failureList}>
                  {failed.map((failure, index) => (
                    <li key={`${failure.number}-${index}`}>
                      <span className={styles.number}>{failure.number || '—'}</span>
                      <span className={styles.failureError}>{failure.error || 'החתימה נכשלה'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setRun({ phase: 'idle' })}
            aria-label="סגירת ההודעה"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      );
    }

    return null;
  }

  // ------------------------------------------------------------ the export

  function renderExport(): ReactNode {
    if (exporting.phase === 'idle') return null;
    if (exporting.phase === 'running') {
      const percent = exportPercent(exporting.progress, false);
      const line = exportProgressText(exporting.progress);
      return (
        <section className={`${theme.card} ${styles.progressBox}`} aria-label="ייצוא לרו״ח">
          <div className={styles.progressHead}>
            <span className={styles.progressTitle}>
              <Loader2 size={15} className={styles.spin} aria-hidden="true" />
              {exporting.cancelling ? 'מבטל…' : 'מייצא את הקבצים החתומים…'}
            </span>
            <button type="button" className={styles.ghostBtn} disabled={exporting.cancelling} onClick={cancelExport}>
              ביטול
            </button>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="התקדמות הייצוא"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent}% — ${line}`}
          >
            <span className={styles.progressFill} style={{ width: `${percent}%` }} />
          </div>
          <p className={styles.progressText} aria-live="polite">{line}</p>
          <p className={styles.progressHint}>
            כל חלק הוא קובץ ZIP שלם של עד {SIGNED_EXPORT_PART_SIZE} קבצים, ונשמר ברגע שהוא מוכן. הדפדפן עשוי לבקש אישור
            להורדת כמה קבצים — יש לאשר.
          </p>
        </section>
      );
    }
    const { text, tone } = exportEndText(exporting.outcome);
    return (
      <div className={`${styles.notice} ${NOTICE_CLASS[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
        {tone === 'done'
          ? <CheckCircle2 size={16} aria-hidden="true" className={styles.noticeIcon} />
          : tone === 'info'
            ? <Info size={16} aria-hidden="true" className={styles.noticeIcon} />
            : <AlertCircle size={16} aria-hidden="true" className={styles.noticeIcon} />}
        <div className={styles.noticeBody}>
          <p className={styles.noticeText}>{text}</p>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => setExporting({ phase: 'idle' })}
          aria-label="סגירת ההודעה"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ the list

  function renderRow(row: SignedOriginalRow): ReactNode {
    const delivery = deliveryView(row);
    const size = formatFileSize(row.size);
    const busy = downloading.has(row.id);
    return (
      <tr key={row.id}>
        <td><span className={styles.number}>{row.number || '—'}</span></td>
        <td className={styles.wrapCell}>{row.document_type_label || <span className={styles.dash}>—</span>}</td>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{row.customer_name || '—'}</span>
        </td>
        <td>{row.document_date ? formatDate(row.document_date) : <span className={styles.dash}>—</span>}</td>
        <td className={`${theme.n} ${styles.money}`}>
          {row.total === null ? <span className={styles.dash}>—</span> : formatAmount(row.total)}
        </td>
        <td>
          <span className={`${styles.purpose} ${row.purpose === 'archive' ? styles.purposeArchive : styles.purposeOriginal}`}>
            {purposeLabel(row.purpose)}
          </span>
        </td>
        <td>
          {row.signed_at ? formatSigningStamp(row.signed_at) : <span className={styles.dash}>טרם נחתם</span>}
          {size && <span className={styles.subLine}><bdi dir="ltr">{size}</bdi></span>}
        </td>
        <td className={styles.wrapCell}>
          {delivery ? (
            <>
              <span className={`${pageStyles.statusBadge} ${DELIVERY_CLASS[delivery.tone]}`}>{delivery.label}</span>
              {delivery.note && <span className={styles.subLine}>{delivery.note}</span>}
            </>
          ) : (
            <span className={styles.dash} title="העתק לארכיון לא נמסר ללקוח — המסמך עצמו נמסר בזמנו">—</span>
          )}
        </td>
        <td className={theme.n}>
          {row.signed_at ? (
            <button
              type="button"
              className={styles.actionBtn}
              disabled={busy}
              aria-label={`הורדת הקובץ החתום של ${row.number}`}
              title={row.sha256 ? `SHA-256: ${row.sha256}` : undefined}
              onClick={() => void download(row)}
            >
              {busy
                ? <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                : <Download size={14} aria-hidden="true" />}
              הורדה
            </button>
          ) : (
            <span className={styles.dash}>אין קובץ עדיין</span>
          )}
        </td>
      </tr>
    );
  }

  function renderList(): ReactNode {
    if (list.loading && list.rows.length === 0) {
      return <TableSkeleton columns={LIST_COLUMNS} rows={6} tableClassName={theme.table} label="טוען את הקבצים החתומים" />;
    }
    if (!list.loading && list.loadState === 'error') {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את הקבצים החתומים"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button
            type="button"
            className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`}
            onClick={() => setVersion((v) => v + 1)}
          >
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }
    if (!list.loading && list.rows.length === 0) {
      const narrowed = Object.keys(query).length > 0;
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title={narrowed ? 'אין קבצים חתומים שמתאימים לסינון' : 'אין עדיין קבצים חתומים'}
          text={narrowed
            ? 'נסו לחפש מספר אחר, להרחיב את טווח התאריכים או לנקות את הסינון.'
            : 'כל מסמך שיונפק בזמן שהחתימה פעילה יופיע כאן עם המקור החתום שלו.'}
        />
      );
    }
    return (
      <div className={`${theme.tableScroll} ${styles.scroll}`} aria-busy={list.loading}>
        <table className={`${theme.table} ${styles.table} ${list.loading ? styles.stale : ''}`}>
          <caption className={styles.srOnly}>הקבצים החתומים — מקורות והעתקים לארכיון</caption>
          <thead>
            <tr>
              <th scope="col">מספר</th>
              <th scope="col">סוג מסמך</th>
              <th scope="col">לקוח</th>
              <th scope="col">תאריך</th>
              <th scope="col" className={theme.n}>סכום</th>
              <th scope="col">קובץ</th>
              <th scope="col">נחתם</th>
              <th scope="col">מסירה</th>
              <th scope="col" className={theme.n}>הורדה</th>
            </tr>
          </thead>
          <tbody>{list.rows.map(renderRow)}</tbody>
        </table>
      </div>
    );
  }

  const showRunButton = status !== null
    && (run.phase === 'idle' || run.phase === 'finished')
    && canRunArchive(status, runBusy);
  const extraActiveCount = archiveExtraActiveCount(filters, own);
  const listReady = !list.loading && list.loadState === 'ready';

  return (
    <div className={styles.tab}>
      <section className={theme.card} aria-labelledby="signed-archive-status-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="signed-archive-status-title" className={theme.cardTitle}>
              העתקים חתומים לארכיון
            </h2>
            <p className={styles.cardSub}>
              מסמכים שהונפקו לפני החתימה האלקטרונית מקבלים העתק חתום לארכיון. המסמך עצמו לא משתנה.
            </p>
          </div>
          {showRunButton && (
            <button type="button" className={styles.primaryBtn} onClick={() => setRun({ phase: 'confirm' })}>
              <FileSignature size={15} aria-hidden="true" />
              חתימת הארכיון
            </button>
          )}
        </div>
        {renderStatus()}
        {renderRun()}
      </section>

      <LedgerFilterBar
        ledger={ledger}
        hide={SIGNED_ARCHIVE_HIDDEN_FIELDS}
        searchPlaceholder="מספר מסמך או שם לקוח…"
        extraActiveCount={extraActiveCount}
        onClearExtra={() => {
          setOwn(NO_OWN_FILTERS);
          ledger.setFilters({ dateFrom: '', dateTo: '' });
        }}
        result={listReady ? { shown: list.rows.length, total: list.count, noun: 'קבצים חתומים' } : undefined}
        footerActions={(
          <button
            type="button"
            className={styles.exportBtn}
            disabled={!exportReady || exportBusy}
            onClick={() => void startExport()}
            title={`כל הקבצים החתומים לפי הסינון, בקבצי ZIP של עד ${SIGNED_EXPORT_PART_SIZE} קבצים`}
          >
            <FileArchive size={15} aria-hidden="true" />
            {exportBusy ? 'מייצא…' : 'ייצוא לרו״ח'}
          </button>
        )}
        idPrefix="signed-archive"
      >
        <LedgerSelect
          id="signed-archive-purpose"
          label="סוג"
          value={own.purpose}
          onChange={(value) => setOwn((prev) => ({ ...prev, purpose: value as SignedOriginalPurpose | '' }))}
          options={PURPOSE_OPTIONS}
          allLabel="הכול"
        />
        <LedgerSelect
          id="signed-archive-kind"
          label="תחום"
          value={own.kind}
          onChange={(value) => setOwn((prev) => ({ ...prev, kind: value as SignedOriginalKind | '' }))}
          options={KIND_OPTIONS}
          allLabel="כל התחומים"
        />
      </LedgerFilterBar>

      {renderExport()}

      <section className={theme.card} aria-labelledby="signed-archive-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="signed-archive-list-title" className={theme.cardTitle}>
              הקבצים החתומים
            </h2>
            <p className={styles.cardSub}>מקורות שנחתמו בהנפקה, והעתקים לארכיון של מסמכים שהונפקו לפני החתימה</p>
          </div>
        </div>

        <p className={styles.explain}>
          <ShieldCheck size={15} aria-hidden="true" className={styles.explainIcon} />
          <span>
            הקבצים כאן הם המקורות החתומים וההעתקים לארכיון, בדיוק כפי שנשמרו. כל שינוי בקובץ — גם שמירה מחדש בתוכנה
            אחרת — שובר את החתימה. כל הורדה נרשמת.
          </span>
        </p>

        {renderList()}

        {list.loadState === 'ready' && list.count > SIGNED_ARCHIVE_PAGE_SIZE && (
          <nav className={styles.pager} aria-label="עמודי הרשימה">
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page <= 1 || list.loading}
              onClick={() => setPageState({ queryKey, page: Math.max(1, page - 1) })}
            >
              <ChevronRight size={15} aria-hidden="true" />
              הקודם
            </button>
            <span className={styles.pagerStatus}>
              עמוד <b>{count(page)}</b> מתוך <b>{count(pageCount)}</b> · {pageSpanLabel(page, list.rows.length)} מתוך{' '}
              {count(list.count)}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page >= pageCount || list.loading}
              onClick={() => setPageState({ queryKey, page: Math.min(pageCount, page + 1) })}
            >
              הבא
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
          </nav>
        )}
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
