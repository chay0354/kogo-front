/**
 * The missing-receipts panel's rules, apart from its markup so they can be
 * tested: what the confirmation says, when the buttons are live, which rows
 * are ticked, and how the server's answer is read back.
 */
import {
  MISSING_RECEIPTS_CONFIRM_WORD,
  MISSING_RECEIPTS_MAX_BATCH,
  type IssueMissingReceiptsResult,
  type MissingReceiptRow,
  type SeriesRunCheck,
} from '@/lib/documentsApi';
import { formatAmount, formatDate } from './utils';

/** What a failed receipt says on screen; the error itself stays in the server's log. */
export const ISSUE_FAILED_MESSAGE = 'ההפקה נכשלה — נסו שוב או פנו לתמיכה';

/** "הפקת 3 קבלות" — and one receipt in words, as Hebrew says it. */
export function issueButtonLabel(count: number): string {
  return count === 1 ? 'הפקת קבלה אחת' : `הפקת ${count.toLocaleString('he-IL')} קבלות`;
}

/**
 * What the user is agreeing to, one plain sentence each. Every one of these is
 * a fact about what the server does, so none of them may be softened away.
 */
export function issueConfirmationLines(count: number, nextNumber?: string, flaggedCount = 0): string[] {
  const what = count === 1
    ? 'תופק קבלה אחת (חשבונית מס/קבלה) לחיוב שנבחר.'
    : `יופקו ${count.toLocaleString('he-IL')} קבלות (חשבונית מס/קבלה), אחת לכל חיוב שנבחר.`;
  const numbers = nextNumber
    ? `הן יקבלו את המספרים הבאים בסדרת IR, החל מ-${nextNumber}, ואי אפשר לבטל אותן.`
    : 'הן יקבלו את המספרים הבאים בסדרת IR, ואי אפשר לבטל אותן.';
  const lines = [
    what,
    'הקבלות יתוארכו להיום, ויסומנו "הופק באיחור" עם תאריך התשלום המקורי.',
    'הן לא יישלחו במייל ללקוחות.',
    numbers,
  ];
  if (flaggedCount > 0) {
    lines.push(flaggedCount === 1
      ? 'לחיוב אחד שנבחר ייתכן שכבר הופק מסמך ידני — ודאו שרואה החשבון אישר גם אותו.'
      : `ל-${flaggedCount.toLocaleString('he-IL')} מהחיובים שנבחרו ייתכן שכבר הופק מסמך ידני — ודאו שרואה החשבון אישר גם אותם.`);
  }
  lines.push('יש לעשות זאת רק אחרי שרואה החשבון אישר את הרשימה.');
  return lines;
}

/** The word, and only the word — spaces around it are forgiven, nothing else. */
export function isConfirmWord(typed: string): boolean {
  return typed.trim() === MISSING_RECEIPTS_CONFIRM_WORD;
}

/** The issue button opens the confirmation only when there is something to issue and nothing in flight. */
export function canStartIssue(state: { count: number; loading: boolean; busy: boolean }): boolean {
  return state.count > 0 && !state.loading && !state.busy;
}

/** The confirmation's own button: the word typed, and not already issuing. */
export function canConfirmIssue(state: { typed: string; issuing: boolean }): boolean {
  return !state.issuing && isConfirmWord(state.typed);
}

// ---------------------------------------------------------------- which rows

type FlagOnly = Pick<MissingReceiptRow, 'possible_manual_document'>;

/** "ייתכן שכבר הופק ידנית: IRM-2026-000007" — or '' when no hand-issued document matches. */
export function manualDocumentNote(row: FlagOnly): string {
  const doc = row.possible_manual_document;
  return doc?.number ? `ייתכן שכבר הופק ידנית: ${doc.number}` : '';
}

function isFlagged(row: FlagOnly): boolean {
  return Boolean(row.possible_manual_document?.number);
}

/** Every row starts ticked, except one a hand-issued document may already cover. */
export function defaultSelection(rows: MissingReceiptRow[]): Set<string> {
  return new Set(rows.filter((row) => !isFlagged(row)).map((row) => row.payment_id));
}

/**
 * The ticks after the list is read again: a row that was already listed keeps
 * the office's choice, a row new to the list starts at its default, and a row
 * gone from the list is gone from the choice.
 */
export function reconcileSelection(
  previousRows: MissingReceiptRow[],
  previous: ReadonlySet<string>,
  nextRows: MissingReceiptRow[],
): Set<string> {
  const known = new Set(previousRows.map((row) => row.payment_id));
  const next = new Set<string>();
  for (const row of nextRows) {
    const ticked = known.has(row.payment_id) ? previous.has(row.payment_id) : !isFlagged(row);
    if (ticked) next.add(row.payment_id);
  }
  return next;
}

export function toggleSelected(selected: ReadonlySet<string>, paymentId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(paymentId)) next.delete(paymentId);
  else next.add(paymentId);
  return next;
}

export function isAllSelected(rows: MissingReceiptRow[], selected: ReadonlySet<string>): boolean {
  return rows.length > 0 && rows.every((row) => selected.has(row.payment_id));
}

/** Tick every row — or, when every row already is, clear them all. */
export function selectAllOrClear(rows: MissingReceiptRow[], selected: ReadonlySet<string>): Set<string> {
  return isAllSelected(rows, selected) ? new Set() : new Set(rows.map((row) => row.payment_id));
}

export function selectAllLabel(rows: MissingReceiptRow[], selected: ReadonlySet<string>): string {
  return isAllSelected(rows, selected) ? 'ניקוי הבחירה' : 'בחירת הכל';
}

/** What one press issues: the ticked rows, oldest first as listed, up to what the server takes at once. */
export function issueBatch(
  rows: MissingReceiptRow[],
  selected: ReadonlySet<string>,
  max: number = MISSING_RECEIPTS_MAX_BATCH,
): MissingReceiptRow[] {
  return rows.filter((row) => selected.has(row.payment_id)).slice(0, max);
}

/** This year and the few before it — late receipts are a question for open books. */
export function yearOptions(currentYear: number, span = 5): number[] {
  return Array.from({ length: span }, (_, index) => currentYear - index);
}

/** Every run of the year that is missing a number, as a line the office can read. */
export function continuityGaps(runs: SeriesRunCheck[]): string[] {
  return runs
    .filter((run) => !run.complete && run.missing.length > 0)
    .map((run) => {
      const shown = run.missing.slice(0, 10).join(', ');
      const more = run.missing.length > 10 ? ` ועוד ${run.missing.length - 10}` : '';
      const name = run.series ? run.name : `${run.label} ${run.year}`;
      return `חור בסדרה ${name}: ${shown}${more}`;
    });
}

// ---------------------------------------------------------------- the outcome

/** The outcome in sentences: what was issued, and what was skipped and why. Failures are failedLines'. */
export function issueSummary(result: IssueMissingReceiptsResult): string[] {
  const lines: string[] = [];
  const { issued, skipped } = result;
  if (issued.length === 0) lines.push('לא הופקו קבלות.');
  else if (issued.length === 1) lines.push(`הופקה קבלה אחת: ${issued[0].number}`);
  else lines.push(`הופקו ${issued.length} קבלות: ${issued.map((row) => row.number).join(', ')}`);
  if (skipped.length > 0) {
    const reasons = Array.from(new Set(skipped.map((row) => row.message).filter(Boolean)));
    lines.push(`${skipped.length} דולגו${reasons.length ? ` (${reasons.join('; ')})` : ''}.`);
  }
  return lines;
}

/**
 * One line per receipt that failed, naming the charge the way the table does
 * (the rows as they were when the office pressed the button).
 */
export function failedLines(result: IssueMissingReceiptsResult, rows: MissingReceiptRow[]): string[] {
  const byId = new Map(rows.map((row) => [row.payment_id, row]));
  return result.failed.map((failure) => {
    const row = byId.get(failure.payment_id);
    const who = row
      ? [formatDate(row.paid_at), row.family_name, row.child_name, formatAmount(Number(row.amount))]
        .filter(Boolean)
        .join(' · ')
      : `תשלום ${failure.payment_id}`;
    return `${who}: ${failure.message || ISSUE_FAILED_MESSAGE}`;
  });
}

/**
 * The server's own words for a failed request, or the fallback. A blob
 * request (the CSV) gets its refusal as a Blob, so that body is read first.
 */
export async function serverErrorText(error: unknown, fallback: string): Promise<string> {
  const response = (error as { response?: { data?: unknown } } | null)?.response;
  let body: unknown = response?.data;
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    try {
      const text = (await body.text()).trim();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } catch {
      body = undefined;
    }
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['error', 'detail']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string;
    }
  }
  // Plain text is the server talking; an HTML error page is not worth showing.
  if (typeof body === 'string' && body && !body.startsWith('<')) return body;
  return fallback;
}
