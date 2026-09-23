/**
 * The למסירה ידנית tab's rules, apart from its markup so they can be tested:
 * when the tab is there at all, what one paper row shows before, during and
 * after its one print, and what a held row is waiting for.
 *
 * הוראה 18ב(ד): a document paid in cash, or by a check that is not crossed
 * "לא סחיר" in the customer's name, may not be emailed. Its signed original is
 * printed once, here, and handed over on paper; any print after that is a copy.
 */
import { errorSentence, type PrintOriginalResult, type SignedOriginalRow, type SigningStatus } from '@/lib/signingApi';
import { formatSigningStamp, isSigningOn } from '@/lib/signingUtils';
import type { ActiveTab } from './types';

export const MANUAL_DELIVERY_TAB_KEY: ActiveTab = 'למסירה ידנית';

export const MANUAL_DELIVERY_TAB = {
  key: MANUAL_DELIVERY_TAB_KEY,
  label: 'למסירה ידנית',
  subtitle: 'מסמכים ששולמו במזומן או בצ׳ק לא משורטט: המקור החתום מודפס פעם אחת ונמסר ללקוח על נייר',
} as const;

/** How many originals are pulled in at once, and again each time the office asks for more. */
export const MANUAL_DELIVERY_PAGE_SIZE = 100;

/**
 * The page's tabs. The manual-delivery tab is a manager's, and it exists only
 * while signing is on — until then the page is exactly what it was.
 */
export function invoiceTabs<T extends { key: ActiveTab }>(
  base: readonly T[],
  options: { isManager: boolean; signing: SigningStatus | null | undefined },
): ReadonlyArray<T | typeof MANUAL_DELIVERY_TAB> {
  if (!options.isManager || !isSigningOn(options.signing)) return base;
  return [...base, MANUAL_DELIVERY_TAB];
}

// ---------------------------------------------------------------- paper rows

/** What the office did with a row on this screen, before the list is read again. */
export type PrintMark =
  | { state: 'printing' }
  | { state: 'printed'; at: string | null; note: string };

export type PaperRowState = 'ready' | 'printing' | 'printed';

export interface PaperRowView {
  state: PaperRowState;
  /** The button's words, or '' when there is no button. */
  action: string;
  /** The line under the status: when it was printed, or the server's refusal. */
  note: string;
}

export const PRINT_ORIGINAL_LABEL = 'הדפס מקור למסירה';

/**
 * One paper row, as the office sees it. A print already recorded on the row
 * (the server's `paper_original_printed_at`) and one made on this screen read
 * the same: printed, and no button — a second print would only be a copy.
 */
export function paperRowView(row: SignedOriginalRow, mark?: PrintMark): PaperRowView {
  if (mark?.state === 'printing') return { state: 'printing', action: 'מדפיס…', note: '' };
  if (mark?.state === 'printed') {
    const at = mark.at ?? row.paper_original_printed_at;
    return { state: 'printed', action: '', note: mark.note || printedNote(at) };
  }
  if (row.paper_original_printed_at) {
    return { state: 'printed', action: '', note: printedNote(row.paper_original_printed_at) };
  }
  return { state: 'ready', action: PRINT_ORIGINAL_LABEL, note: '' };
}

function printedNote(at: string | null | undefined): string {
  const when = formatSigningStamp(at);
  return when ? `המקור הודפס ב-${when}` : 'המקור הודפס';
}

/**
 * The row's mark once the server answered. A print that went through is
 * printed now; a 409 means the one print was already made — the row is
 * printed too, and says so in the server's words.
 */
export function markAfterPrint(result: PrintOriginalResult, nowIso: string): PrintMark {
  if (result.outcome === 'printed') return { state: 'printed', at: nowIso, note: '' };
  return { state: 'printed', at: null, note: result.message };
}

export const PRINT_FAILED_MESSAGE = 'הדפסת המקור נכשלה — נסו שוב';

/**
 * No answer at all is not a refusal: the server may have recorded the print
 * and the PDF was lost on the way back. The next press tells which — it
 * either prints, or answers that the original was already printed.
 */
export const PRINT_UNKNOWN_MESSAGE = 'לא התקבלה תשובה מהשרת. ייתכן שההדפסה נרשמה — לחצו שוב כדי לבדוק.';

/** Why a print did not go through, in words the office can act on. */
export function printFailureMessage(err: unknown): string {
  const response = (err as { response?: unknown } | null)?.response;
  if (!response) return PRINT_UNKNOWN_MESSAGE;
  return errorSentence(err) || PRINT_FAILED_MESSAGE;
}

/** The paper originals still waiting for their one print, after what was done on this screen. */
export function waitingToPrint(rows: readonly SignedOriginalRow[], marks: Readonly<Record<string, PrintMark>>): number {
  return rows.filter((row) => paperRowView(row, marks[row.id]).state !== 'printed').length;
}

/** The file name when the browser would not open a tab and the original is saved instead. */
export function originalFilename(row: Pick<SignedOriginalRow, 'number'>): string {
  const name = String(row.number || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${name || 'מסמך'} - מקור.pdf`;
}

// ---------------------------------------------------------------- held rows

/**
 * What a held document is waiting for. It is held for one of two reasons: its
 * signature was not saved yet (the cron signs and sends it), or it is signed
 * and the customer has no recorded consent while consent is enforced.
 */
export function heldStatusLabel(row: Pick<SignedOriginalRow, 'signed_at'>): string {
  return row.signed_at ? 'ממתין להסכמה' : 'ממתין לחתימה';
}
