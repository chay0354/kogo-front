/**
 * The ארכיון חתום tab's rules, apart from its markup so they can be tested:
 * when the tab is there at all, what a row and its badges say, how the filter
 * becomes the query, the archive run's loop and the export's ZIP parts.
 *
 * Every file on the tab is a signed PDF exactly as the server stored it: the
 * מקור, signed when the document was issued, or the העתק לארכיון, signed later
 * for a document issued before signing existed. Nothing here changes a file —
 * a copy that differs by a single byte no longer carries a valid signature.
 */
import {
  errorSentence,
  SIGNED_EXPORT_PART_SIZE,
  type ArchiveKindStatus,
  type ArchiveRunBatch,
  type ArchiveRunFailure,
  type ArchiveRunResult,
  type ArchiveStatus,
  type SignedExportPart,
  type SignedOriginalKind,
  type SignedOriginalPurpose,
  type SignedOriginalRow,
  type SignedOriginalsFilter,
  type SigningStatus,
} from '@/lib/signingApi';
import { formatSigningStamp } from '@/lib/signingUtils';
import { heldStatusLabel, invoiceTabs, paperRowView, type MANUAL_DELIVERY_TAB } from './manualDelivery';
import type { ActiveTab, LedgerFilterKey, LedgerFilters } from './types';

const n = (value: number) => value.toLocaleString('he-IL');

// ---------------------------------------------------------------- the tab

export const SIGNED_ARCHIVE_TAB_KEY: ActiveTab = 'ארכיון חתום';

export const SIGNED_ARCHIVE_TAB = {
  key: SIGNED_ARCHIVE_TAB_KEY,
  label: 'ארכיון חתום',
  subtitle: 'כל קובץ חתום כפי שנשמר: המקורות שנחתמו בהנפקה, וההעתקים לארכיון של מסמכים שהונפקו לפני החתימה',
} as const;

/**
 * Whether the archive tab is offered. While signing is on it is; and once
 * anything was ever signed it stays — the signed files are kept for seven
 * years, and the owner reaches them here even after the switch is turned off.
 * No status, a failed request, or a server that never signed a thing leave
 * the page exactly as it was.
 */
export function showsSignedArchive(signing: SigningStatus | null | undefined): boolean {
  return Boolean(signing && (signing.enabled === true || signing.last_signed_at));
}

/**
 * The page's tabs: the manual-delivery tab's rule (invoiceTabs), then the
 * archive last, for a manager only — the server enforces it too.
 */
export function invoicePageTabs<T extends { key: ActiveTab }>(
  base: readonly T[],
  options: { isManager: boolean; signing: SigningStatus | null | undefined },
): ReadonlyArray<T | typeof MANUAL_DELIVERY_TAB | typeof SIGNED_ARCHIVE_TAB> {
  const tabs = invoiceTabs(base, options);
  if (!options.isManager || !showsSignedArchive(options.signing)) return tabs;
  return [...tabs, SIGNED_ARCHIVE_TAB];
}

// ---------------------------------------------------------------- labels

export const PURPOSE_OPTIONS = [
  { value: 'original', label: 'מקור' },
  { value: 'archive', label: 'העתק לארכיון' },
] as const;

export function purposeLabel(purpose: SignedOriginalPurpose): string {
  return purpose === 'archive' ? 'העתק לארכיון' : 'מקור';
}

export const KIND_OPTIONS = [
  { value: 'ir', label: 'קבלות חוגים' },
  { value: 'store', label: 'חנות' },
  { value: 'formal', label: 'מסמכים מהמשרד' },
] as const;

/** The server's own name for a kind when it gave one, else ours, else the kind as it came. */
export function kindLabel(kind: string, serverLabel?: string | null): string {
  const given = String(serverLabel ?? '').trim();
  if (given) return given;
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

export type DeliveryTone = 'done' | 'waiting' | 'quiet';

export interface DeliveryView {
  label: string;
  tone: DeliveryTone;
  /** The line under the badge — when, or why. */
  note: string;
}

/**
 * How an original reached the customer, in the words the rest of the signing
 * screens use. Null for an archive copy: it is never delivered — the document
 * itself went out long ago, before signing existed.
 */
export function deliveryView(row: SignedOriginalRow): DeliveryView | null {
  if (row.purpose === 'archive') return null;
  switch (row.delivery) {
    case 'email':
      return row.sent_at
        ? { label: 'נשלח במייל', tone: 'done', note: formatSigningStamp(row.sent_at) }
        : { label: 'במייל — טרם נשלח', tone: 'waiting', note: row.delivery_reason };
    case 'paper': {
      const view = paperRowView(row);
      return view.state === 'printed'
        ? { label: 'נמסר על נייר', tone: 'done', note: view.note }
        : { label: 'למסירה על נייר', tone: 'waiting', note: 'המקור טרם הודפס' };
    }
    case 'held':
      return { label: heldStatusLabel(row), tone: 'waiting', note: row.delivery_reason };
    default:
      return { label: 'לא נשלח', tone: 'quiet', note: row.delivery_reason };
  }
}

/** "84 KB", "1.2 MB" — or '' for a file with no size yet. */
export function formatFileSize(bytes: number | null | undefined): string {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- the filter

/**
 * The tab keeps its own copy of the bar's fields, starting with no dates: the
 * page's shared filters open on the last 30 days, which would hide every
 * archive copy of an older document — and the export follows the filter.
 */
export const SIGNED_ARCHIVE_INITIAL_FILTERS: Partial<LedgerFilters> = { dateFrom: '', dateTo: '' };

/** The shared bar's fields that say nothing about a signed file. */
export const SIGNED_ARCHIVE_HIDDEN_FIELDS: readonly LedgerFilterKey[] = [
  'business',
  'cityId',
  'branchId',
  'courseTypeId',
  'ageKey',
  'instructorId',
];

export interface ArchiveOwnFilters {
  purpose: SignedOriginalPurpose | '';
  kind: SignedOriginalKind | '';
}

export const NO_OWN_FILTERS: ArchiveOwnFilters = { purpose: '', kind: '' };

/** The bar's values as the server's query, with only what narrows — so equal filters make equal queries. */
export function archiveFilterQuery(
  filters: Pick<LedgerFilters, 'search' | 'dateFrom' | 'dateTo'>,
  own: ArchiveOwnFilters,
): SignedOriginalsFilter {
  const query: SignedOriginalsFilter = {};
  if (own.purpose) query.purpose = own.purpose;
  if (own.kind) query.kind = own.kind;
  const q = filters.search.trim();
  if (q) query.q = q;
  if (filters.dateFrom) query.date_from = filters.dateFrom;
  if (filters.dateTo) query.date_to = filters.dateTo;
  return query;
}

/**
 * What the tab narrows by beyond the shared search: its own two selects, and
 * the dates — which here are a filter like any other, since nothing is dated
 * by default.
 */
export function archiveExtraActiveCount(
  filters: Pick<LedgerFilters, 'dateFrom' | 'dateTo'>,
  own: ArchiveOwnFilters,
): number {
  return [own.purpose, own.kind, filters.dateFrom, filters.dateTo].filter(Boolean).length;
}

// ---------------------------------------------------------------- pages

export const SIGNED_ARCHIVE_PAGE_SIZE = 50;

export function archivePageCount(total: number, size = SIGNED_ARCHIVE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

export function archivePageOffset(page: number, size = SIGNED_ARCHIVE_PAGE_SIZE): number {
  return (Math.max(1, Math.floor(page)) - 1) * size;
}

/** "51–100" — the rows of this page, as the office counts them; '' when the page is empty. */
export function pageSpanLabel(page: number, shown: number, size = SIGNED_ARCHIVE_PAGE_SIZE): string {
  if (shown <= 0) return '';
  const from = archivePageOffset(page, size) + 1;
  return `${n(from)}–${n(from + shown - 1)}`;
}

// ---------------------------------------------------------------- archive status

export interface ArchiveTotals {
  eligible: number;
  archived: number;
  originals: number;
  remaining: number;
}

export function archiveTotals(status: ArchiveStatus | null | undefined): ArchiveTotals {
  const totals: ArchiveTotals = { eligible: 0, archived: 0, originals: 0, remaining: 0 };
  for (const kind of status?.kinds ?? []) {
    totals.eligible += kind.eligible;
    totals.archived += kind.archived;
    totals.originals += kind.originals;
    totals.remaining += kind.remaining;
  }
  return totals;
}

/** "120 מתוך 300 בארכיון". */
export function kindArchivedLine(kind: Pick<ArchiveKindStatus, 'archived' | 'eligible'>): string {
  return `${n(kind.archived)} מתוך ${n(kind.eligible)} בארכיון`;
}

/** How full a kind's meter is. Floored: 99.6% is not all of it. Nothing to archive is full. */
export function kindPercent(kind: Pick<ArchiveKindStatus, 'archived' | 'eligible'>): number {
  if (kind.eligible <= 0) return 100;
  if (kind.archived >= kind.eligible) return 100;
  return Math.min(99, Math.floor((kind.archived / kind.eligible) * 100));
}

/** The run button: the archive switch is on, something is left, and nothing is running. */
export function canRunArchive(status: ArchiveStatus | null | undefined, busy: boolean): boolean {
  return Boolean(status?.enabled) && archiveTotals(status).remaining > 0 && !busy;
}

// ---------------------------------------------------------------- the archive run

/** How many copies one call asks the server to sign. */
export const ARCHIVE_RUN_BATCH_SIZE = 25;

/** A loop that asked this many times without finishing is stopped rather than left running. */
export const ARCHIVE_RUN_MAX_ROUNDS = 2000;

export interface ArchiveRunProgress {
  signed: number;
  skipped: number;
  /** One line per document number, with its latest error. */
  failed: ArchiveRunFailure[];
  remaining: number;
  rounds: number;
}

export function startArchiveProgress(remaining: number): ArchiveRunProgress {
  return { signed: 0, skipped: 0, failed: [], remaining: Math.max(0, remaining), rounds: 0 };
}

/** The progress after one batch: its counts added, its failures merged by number. */
export function applyArchiveBatch(progress: ArchiveRunProgress, batch: ArchiveRunBatch): ArchiveRunProgress {
  const failed = new Map(progress.failed.map((failure) => [failure.number, failure]));
  batch.failed.forEach((failure, index) => {
    const key = failure.number || `#${progress.rounds}-${index}`;
    failed.delete(key);
    failed.set(key, failure);
  });
  return {
    signed: progress.signed + batch.signed,
    skipped: progress.skipped + batch.skipped,
    failed: [...failed.values()],
    remaining: batch.remaining,
    rounds: progress.rounds + 1,
  };
}

/** Of what this run has handled and what is left, how much is handled. Floored, and 100 only when nothing is left. */
export function archiveProgressPercent(progress: ArchiveRunProgress): number {
  const handled = progress.signed + progress.skipped;
  const whole = handled + progress.remaining;
  if (progress.remaining <= 0) return 100;
  if (whole <= 0) return 0;
  return Math.min(99, Math.floor((handled / whole) * 100));
}

/** "נחתמו 50 · דולגו 2 · נכשלו 1 · נותרו 120" — only what is not zero, except what is left. */
export function archiveRunCounts(progress: ArchiveRunProgress): string {
  const parts = [`נחתמו ${n(progress.signed)}`];
  if (progress.skipped) parts.push(`דולגו ${n(progress.skipped)}`);
  if (progress.failed.length) parts.push(`נכשלו ${n(progress.failed.length)}`);
  parts.push(`נותרו ${n(progress.remaining)}`);
  return parts.join(' · ');
}

export type ArchiveRunEnd = 'done' | 'stopped' | 'stalled' | 'off' | 'unavailable' | 'no_answer' | 'failed';

export interface ArchiveRunOutcome {
  end: ArchiveRunEnd;
  progress: ArchiveRunProgress;
  /** The server's own sentence, when it gave one. */
  detail: string;
}

/**
 * Ask the server for batches until the archive is done, the office stops it,
 * or an answer says to stop. A stop is honoured between batches only: a batch
 * already sent is signing on the server whatever the screen does, so its
 * answer is waited for and counted.
 *
 * A batch that signs nothing and leaves as much as before ends the run as
 * `stalled` — the same documents would only fail again, forever.
 */
export async function driveArchiveRun(options: {
  runBatch: () => Promise<ArchiveRunResult>;
  shouldStop: () => boolean;
  startRemaining: number;
  onProgress?: (progress: ArchiveRunProgress) => void;
  maxRounds?: number;
}): Promise<ArchiveRunOutcome> {
  const maxRounds = options.maxRounds ?? ARCHIVE_RUN_MAX_ROUNDS;
  let progress = startArchiveProgress(options.startRemaining);
  for (let round = 0; round < maxRounds; round += 1) {
    if (options.shouldStop()) return { end: 'stopped', progress, detail: '' };
    let result: ArchiveRunResult;
    try {
      result = await options.runBatch();
    } catch (error) {
      const answered = Boolean((error as { response?: unknown } | null)?.response);
      return { end: answered ? 'failed' : 'no_answer', progress, detail: errorSentence(error) };
    }
    if (result.outcome === 'off') return { end: 'off', progress, detail: result.message };
    if (result.outcome === 'unavailable') return { end: 'unavailable', progress, detail: result.message };
    const before = progress.remaining;
    progress = applyArchiveBatch(progress, result.batch);
    options.onProgress?.(progress);
    if (result.batch.done || result.batch.remaining <= 0) return { end: 'done', progress, detail: '' };
    if (result.batch.signed === 0 && result.batch.remaining >= before) return { end: 'stalled', progress, detail: '' };
  }
  return { end: 'stalled', progress, detail: '' };
}

export type NoticeTone = 'done' | 'info' | 'error';

/** What the office reads when the run ends — one sentence it can act on. */
export function archiveRunEndText(outcome: Pick<ArchiveRunOutcome, 'end' | 'progress'>): { text: string; tone: NoticeTone } {
  const failures = outcome.progress.failed.length;
  switch (outcome.end) {
    case 'done':
      return failures
        ? { text: 'חתימת הארכיון הסתיימה, אבל חלק מהמסמכים לא נחתמו — הם מפורטים למטה.', tone: 'error' }
        : { text: 'חתימת הארכיון הסתיימה: לכל מסמך שהונפק לפני החתימה יש עכשיו העתק חתום.', tone: 'done' };
    case 'stopped':
      return { text: 'חתימת הארכיון נעצרה. מה שנחתם נשמר, ואפשר להמשיך מאותה נקודה בכל עת.', tone: 'info' };
    case 'stalled':
      return {
        text: 'חתימת הארכיון נעצרה: הסבב האחרון לא חתם אף מסמך. כדי לא לחזור על אותן שגיאות — בדקו את הרשימה למטה ונסו שוב מאוחר יותר.',
        tone: 'error',
      };
    case 'off':
      return {
        text: 'חתימת הארכיון לא מופעלת בשרת, ולכן לא נחתם דבר. היא מופעלת בהגדרות השרת, לא מכאן.',
        tone: 'info',
      };
    case 'unavailable':
      return {
        text: 'מפתח החתימה אינו זמין כרגע, ולכן הסבב לא נחתם. מה שנחתם לפניו נשמר — נסו שוב בעוד כמה דקות.',
        tone: 'error',
      };
    case 'no_answer':
      return {
        text: 'לא התקבלה תשובה מהשרת. ייתכן שחלק מהסבב האחרון נחתם — אפשר להמשיך בבטחה: מסמך שכבר יש לו העתק לא ייחתם שוב.',
        tone: 'error',
      };
    default:
      return { text: 'חתימת הארכיון נכשלה. מה שנחתם עד כאן נשמר — נסו שוב.', tone: 'error' };
  }
}

// ---------------------------------------------------------------- the export

export interface ExportProgress {
  partsSaved: number;
  /** How many ZIPs the export will be; null until the count is known. */
  parts: number | null;
  filesSaved: number;
  total: number | null;
}

export type ExportEnd = 'done' | 'stopped' | 'failed';

export interface ExportOutcome {
  end: ExportEnd;
  progress: ExportProgress;
  error?: unknown;
}

/** How many ZIPs `total` files make. */
export function exportPartsFor(total: number | null, size = SIGNED_EXPORT_PART_SIZE): number | null {
  if (total === null || !Number.isFinite(total)) return null;
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** A loop that asked for this many parts is stopped rather than left running. */
export const EXPORT_MAX_PARTS = 1000;

/**
 * Fetch the export part after part, saving each as it arrives, until the
 * server says there is no next part. A cancel is honoured at once: the part
 * on its way is dropped (the caller aborts its request), and the parts
 * already saved stay — each one is a whole ZIP by itself.
 */
export async function driveSignedExport(options: {
  knownTotal: number | null;
  fetchPart: (offset: number) => Promise<SignedExportPart>;
  savePart: (zip: Blob, index: number, parts: number | null) => void;
  shouldStop: () => boolean;
  onProgress?: (progress: ExportProgress) => void;
  partSize?: number;
  maxParts?: number;
}): Promise<ExportOutcome> {
  const size = options.partSize ?? SIGNED_EXPORT_PART_SIZE;
  const maxParts = options.maxParts ?? EXPORT_MAX_PARTS;
  let total = options.knownTotal;
  let progress: ExportProgress = { partsSaved: 0, parts: exportPartsFor(total, size), filesSaved: 0, total };
  options.onProgress?.(progress);
  let offset = 0;
  for (let index = 1; index <= maxParts; index += 1) {
    if (options.shouldStop()) return { end: 'stopped', progress };
    let part: SignedExportPart;
    try {
      part = await options.fetchPart(offset);
    } catch (error) {
      return { end: options.shouldStop() ? 'stopped' : 'failed', progress, error };
    }
    // Arrived after the cancel: the office asked for nothing more to be saved.
    if (options.shouldStop()) return { end: 'stopped', progress };
    total = part.total ?? total;
    const parts = exportPartsFor(total, size);
    options.savePart(part.zip, index, parts);
    const through = part.nextOffset ?? total ?? offset + size;
    progress = {
      partsSaved: index,
      parts,
      filesSaved: total !== null ? Math.min(through, total) : through,
      total,
    };
    options.onProgress?.(progress);
    if (part.nextOffset === null) return { end: 'done', progress };
    offset = part.nextOffset;
  }
  return { end: 'failed', progress, error: new Error(`The export did not finish within ${maxParts} parts`) };
}

/**
 * The ZIP's file name, in Latin letters so it survives any accountant's
 * system: what is in it, the dates it covers, and its place among the parts —
 * padded, so the parts sort in order.
 */
export function signedExportFilename(filter: SignedOriginalsFilter, index: number, parts: number | null): string {
  const scope = filter.purpose === 'archive'
    ? 'archive-copies'
    : filter.purpose === 'original' ? 'signed-originals' : 'signed-files';
  const kind = filter.kind ? `_${filter.kind}` : '';
  const range = filter.date_from || filter.date_to
    ? `_${filter.date_from || 'start'}_${filter.date_to || 'today'}`
    : '';
  let part = '';
  if (parts === null) part = `_part-${index}`;
  else if (parts > 1) {
    const width = String(parts).length;
    part = `_part-${String(index).padStart(width, '0')}-of-${parts}`;
  }
  return `${scope}${kind}${range}${part}.zip`;
}

/** "חלק 2 מתוך 5 · 80 מתוך 187 קבצים". */
export function exportProgressText(progress: ExportProgress): string {
  const partNow = progress.partsSaved + 1;
  const partLine = progress.parts !== null
    ? `מכין חלק ${n(Math.min(partNow, progress.parts))} מתוך ${n(progress.parts)}`
    : `מכין חלק ${n(partNow)}`;
  const files = progress.total !== null
    ? `${n(progress.filesSaved)} מתוך ${n(progress.total)} קבצים נשמרו`
    : `${n(progress.filesSaved)} קבצים נשמרו`;
  return `${partLine} · ${files}`;
}

/** How far the export is, for its bar. Floored; 100 only when it is done. */
export function exportPercent(progress: ExportProgress, finished: boolean): number {
  if (finished) return 100;
  if (progress.parts === null || progress.parts <= 0) return 0;
  return Math.min(99, Math.floor((progress.partsSaved / progress.parts) * 100));
}

/** Why a part did not arrive, in words the office can act on. */
export function exportFailureMessage(error: unknown): string {
  if (!(error as { response?: unknown } | null)?.response) return 'לא התקבלה תשובה מהשרת';
  return errorSentence(error) || 'הפקת החלק נכשלה';
}

/** The line left after the export ends. */
export function exportEndText(outcome: ExportOutcome): { text: string; tone: NoticeTone } {
  const { partsSaved, filesSaved } = outcome.progress;
  if (outcome.end === 'done') {
    return {
      text: partsSaved === 1
        ? `הייצוא הסתיים: ${n(filesSaved)} קבצים חתומים בקובץ ZIP אחד.`
        : `הייצוא הסתיים: ${n(filesSaved)} קבצים חתומים ב-${n(partsSaved)} קבצי ZIP.`,
      tone: 'done',
    };
  }
  if (outcome.end === 'stopped') {
    let text = 'הייצוא בוטל — לא נשמר דבר.';
    if (partsSaved === 1) text = `הייצוא בוטל. חלק אחד כבר נשמר, והוא שלם (${n(filesSaved)} קבצים).`;
    else if (partsSaved > 1) text = `הייצוא בוטל. ${n(partsSaved)} חלקים כבר נשמרו, וכל אחד מהם שלם (${n(filesSaved)} קבצים).`;
    return { text, tone: 'info' };
  }
  let saved = '';
  if (partsSaved === 1) saved = ' החלק שכבר נשמר שלם.';
  else if (partsSaved > 1) saved = ` ${n(partsSaved)} החלקים שכבר נשמרו שלמים.`;
  return { text: `${exportFailureMessage(outcome.error)}.${saved} אפשר לייצא שוב.`, tone: 'error' };
}

// ---------------------------------------------------------------- one download

export const DOWNLOAD_FAILED_MESSAGE = 'ההורדה נכשלה — נסו שוב';
export const DOWNLOAD_MISMATCH_MESSAGE = 'הקובץ שהתקבל אינו זהה לקובץ החתום השמור, ולכן לא נשמר. נסו להוריד שוב.';

/** Why a file was not saved, in words the office can act on. */
export function downloadFailureMessage(error: unknown): string {
  if ((error as { name?: unknown } | null)?.name === 'SignedFileMismatchError') return DOWNLOAD_MISMATCH_MESSAGE;
  const response = (error as { response?: { status?: number } } | null)?.response;
  if (!response) return 'לא התקבלה תשובה מהשרת — נסו שוב';
  if (response.status === 404) return errorSentence(error) || 'הקובץ לא נמצא';
  return errorSentence(error) || DOWNLOAD_FAILED_MESSAGE;
}
