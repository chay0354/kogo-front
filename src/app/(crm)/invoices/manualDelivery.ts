/**
 * The למסירה ידנית tab's rules, apart from its markup so they can be tested:
 * when the tab is there at all, what one paper row shows before, during and
 * after its one print, and what a held row is waiting for.
 *
 * הוראה 18ב(ד): a document paid in cash, or by a check that is not crossed
 * "לא סחיר" in the customer's name, may not be emailed. Its signed original is
 * printed once, here, and handed over on paper; any print after that is a copy.
 *
 * Since 25.9.2026 (the owner's decision D5) every original ends up mailed, on
 * this list, or held with a reason: a customer with no address puts it here
 * too — and it can be mailed from here once an address is typed. A tax invoice
 * to a business above the threshold is held until its allocation number is
 * entered, here; entering it signs the original and mails it.
 */
import type { AllocationNumberAnswer } from '@/lib/documentsApi';
import {
  errorSentence,
  type PrintOriginalResult,
  type SendOriginalResult,
  type SignedOriginalRow,
  type SigningStatus,
} from '@/lib/signingApi';
import { formatSigningStamp, isSigningOn } from '@/lib/signingUtils';
import type { ActiveTab } from './types';

export const MANUAL_DELIVERY_TAB_KEY: ActiveTab = 'למסירה ידנית';

export const MANUAL_DELIVERY_TAB = {
  key: MANUAL_DELIVERY_TAB_KEY,
  label: 'למסירה ידנית',
  subtitle: 'מסמכים שלא נשלחים במייל — שולמו במזומן או בצ׳ק לא משורטט, או שאין ללקוח כתובת מייל — ומסמכים שממתינים',
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

/** Stands in for the print time when the server said the original was printed and not when. */
const PRINTED_AT_UNKNOWN = 'printed';

/**
 * The row as it stands after what was done on this screen: printed here, it
 * reads as printed before the list is read again — so its next send is a copy.
 * A 409 ("already printed") carries no time; the row still reads as printed.
 */
export function rowWithMark(row: SignedOriginalRow, mark?: PrintMark): SignedOriginalRow {
  if (mark?.state !== 'printed' || row.paper_original_printed_at) return row;
  return { ...row, paper_original_printed_at: mark.at ?? PRINTED_AT_UNKNOWN };
}

// ---------------------------------------------------------------- held rows

/**
 * What a held document is waiting for: its allocation number (a tax invoice to
 * a business above the threshold — not signed until it is entered), its
 * signature (the cron signs and sends it), or — signed, while consent is
 * enforced — the customer's consent.
 */
export function heldStatusLabel(
  row: Pick<SignedOriginalRow, 'signed_at'> & Partial<Pick<SignedOriginalRow, 'awaiting_allocation'>>,
): string {
  if (row.awaiting_allocation) return 'ממתין למספר הקצאה';
  return row.signed_at ? 'ממתין להסכמה' : 'ממתין לחתימה';
}

/** The server's reason under the badge — '' when it only says what the badge already says. */
export function heldReasonNote(
  row: Pick<SignedOriginalRow, 'signed_at' | 'delivery_reason'> & Partial<Pick<SignedOriginalRow, 'awaiting_allocation'>>,
): string {
  const reason = (row.delivery_reason || '').trim();
  return reason === heldStatusLabel(row) ? '' : reason;
}

// ---------------------------------------------------------------- "שלח / שלח שוב"

/** The server's reason for a paper row whose only obstacle is the missing address (signing/service.py). */
export const NO_EMAIL_REASON = 'אין כתובת מייל — למסירה ידנית';

/**
 * Whether a paper row may still go by mail: only when it is on paper for want
 * of an address and its original was not printed. Cash and an unmarked check
 * stay on paper whatever address is typed (18ב(ד)) — no button for those.
 */
export function paperRowCanBeMailed(
  row: Pick<SignedOriginalRow, 'delivery' | 'delivery_reason' | 'paper_original_printed_at'>,
): boolean {
  return row.delivery === 'paper' && !row.paper_original_printed_at && row.delivery_reason.trim() === NO_EMAIL_REASON;
}

/** Whether the next send is the signed original (its first and only time) or a copy. */
export function nextSendEdition(
  row: Pick<SignedOriginalRow, 'purpose' | 'sent_at' | 'paper_original_printed_at'>,
): 'original' | 'copy' {
  if (row.purpose === 'archive' || row.sent_at || row.paper_original_printed_at) return 'copy';
  return 'original';
}

/** The button: "שלח" while the original has not left, "שלח שוב" (a copy) after. */
export function sendActionLabel(row: Pick<SignedOriginalRow, 'purpose' | 'sent_at' | 'paper_original_printed_at'>): string {
  return nextSendEdition(row) === 'original' ? 'שלח' : 'שלח שוב';
}

/** What the confirm dialog says will happen — so no one sends an original, or a copy, by surprise. */
export function sendConfirmMessage(
  row: Pick<SignedOriginalRow, 'number' | 'purpose' | 'sent_at' | 'paper_original_printed_at'>,
): string {
  if (nextSendEdition(row) === 'original') {
    return `המקור החתום של ${row.number} יישלח ללקוח במייל — פעם אחת בלבד. אחרי זה כל שליחה היא העתק.`;
  }
  return `יישלח ללקוח העתק של ${row.number} (מסומן "העתק"). המקור כבר נמסר ואינו נשלח שוב.`;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** '' when the typed address may be sent (empty means the card's own), else why not. */
export function sendEmailError(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  return EMAIL_SHAPE.test(value) ? '' : 'כתובת המייל אינה תקינה';
}

/** What the office reads after the server answered a send. */
export function sendResultMessage(result: SendOriginalResult): { ok: boolean; text: string } {
  if (result.outcome === 'refused') return { ok: false, text: result.message };
  const what = result.sent === 'original' ? 'המקור החתום' : 'העתק';
  const to = result.email ? ` אל ${result.email}` : '';
  return { ok: true, text: `${what} של ${result.number} נשלח${to}` };
}

export const SEND_FAILED_MESSAGE = 'השליחה נכשלה — נסו שוב בעוד כמה דקות';

/** A send that got no answer or failed on the way: the server's words when it gave any. */
export function sendFailureMessage(err: unknown): string {
  const response = (err as { response?: unknown } | null)?.response;
  if (!response) return 'לא התקבלה תשובה מהשרת — בדקו ברשימה אם המסמך נשלח לפני שתנסו שוב';
  return errorSentence(err) || SEND_FAILED_MESSAGE;
}

// ---------------------------------------------------------------- the allocation number

/** The nine digits out of what was typed (spaces and dashes are how it is often copied). */
export function allocationDigits(raw: string): string {
  return String(raw ?? '').replace(/\D+/g, '');
}

/** '' when the typed number may be sent, else why not — the server's own rule (nine digits). */
export function allocationInputError(raw: string): string {
  const digits = allocationDigits(raw);
  if (!digits) return 'יש להזין את מספר ההקצאה';
  return digits.length === 9 ? '' : 'מספר הקצאה הוא 9 ספרות';
}

/** What the office reads once the number was saved: signed and mailed, signed for paper, or copies only. */
export function allocationResultMessage(answer: AllocationNumberAnswer, number: string): string {
  if (answer.copy_only) return answer.message || 'המספר נשמר ויופיע על העתקים בלבד';
  if (answer.signed) {
    if (answer.delivery === 'email') return `מספר ההקצאה נשמר — המקור של ${number} נחתם ונשלח ללקוח`;
    if (answer.delivery === 'paper') return `מספר ההקצאה נשמר — המקור של ${number} נחתם ועבר למסירה על נייר`;
    return `מספר ההקצאה נשמר — המקור של ${number} נחתם`;
  }
  return `מספר ההקצאה נשמר — המקור של ${number} ייחתם וישלח בדקות הקרובות`;
}

/**
 * The same, for the documents list, where most numbers are typed: '' when the
 * number touched no signed original (none was drawn for the document, or the
 * server predates 25.9.2026), so the row simply shows it as before.
 */
export function allocationOriginalMessage(answer: AllocationNumberAnswer, number: string): string {
  if (!answer.allocation_number) return '';
  if (answer.copy_only) return allocationResultMessage(answer, number);
  if (answer.delivery === undefined || answer.delivery === null) return '';
  return allocationResultMessage(answer, number);
}

export const ALLOCATION_FAILED_MESSAGE = 'שמירת מספר ההקצאה נכשלה';

export function allocationFailureMessage(err: unknown): string {
  const response = (err as { response?: unknown } | null)?.response;
  if (!response) return 'לא התקבלה תשובה מהשרת — בדקו ברשימה אם המספר נשמר';
  return errorSentence(err) || ALLOCATION_FAILED_MESSAGE;
}
