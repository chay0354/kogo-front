/**
 * Drafts and credit notes on the invoices page (audit 30.9.2026):
 *
 * - M11: a receipt and an invoice-receipt can be saved as drafts, like a tax
 *   invoice and a transaction invoice. A draft has no number and pays nothing;
 *   approving it checks its payments and the invoices it settles again.
 * - M4: a credit note counts for VAT once the customer confirmed receiving it
 *   (הוראה 23א(3)); the form shows what is left of the original to credit.
 * - #10: a credit note opened straight from a tax invoice's or an
 *   invoice-receipt's row, already linked to it and to its customer.
 *
 * Pure functions only — the screens call them, the tests read them.
 */

/** What a draft becomes when approved. */
export const DRAFT_TARGET_LABELS: Readonly<Record<string, string>> = {
  tax_invoice: 'חשבונית מס',
  transaction_invoice: 'חשבונית עסקה',
  receipt: 'קבלה',
  combined: 'חשבונית מס/קבלה',
};

/** The dialog's document types that may be saved as a draft. */
export const DRAFTABLE_DOC_TYPES: ReadonlySet<string> = new Set([
  'חשבונית מס',
  'חשבונית עסקה',
  'קבלה',
  'חשבונית מס/קבלה',
]);

/** A draft receives money when it becomes a receipt or an invoice-receipt. */
export function isPayingDraftTarget(target: string | null | undefined): boolean {
  return target === 'receipt' || target === 'combined';
}

export function draftTargetLabel(target: string | null | undefined): string {
  return DRAFT_TARGET_LABELS[target || 'tax_invoice'] ?? DRAFT_TARGET_LABELS.tax_invoice;
}

/**
 * Whether the dialog offers "save as draft" for this document. Not for a
 * receipt that opens a check plan ("חשבונית מס לכל צ'ק"): the plan opens with
 * the receipt, which a draft does not have yet — the server refuses it too.
 */
export function canSaveAsDraft(docType: string | null | undefined, options: { perCheck?: boolean } = {}): boolean {
  if (!docType || !DRAFTABLE_DOC_TYPES.has(docType)) return false;
  return !(docType === 'קבלה' && options.perCheck);
}

/** The confirmation a manager reads before approving a draft. */
export function draftApprovalMessage(row: { document_number: string; draft_target_type?: string | null }): string {
  const label = draftTargetLabel(row.draft_target_type);
  const lines = [
    `לאשר את הטיוטה ${row.document_number}?`,
    `היא תהפוך ל${label}, תקבל את המספר הבא בסדרה ותתוארך היום.`,
  ];
  if (isPayingDraftTarget(row.draft_target_type)) {
    lines.push(
      'אמצעי התשלום והחשבוניות שהיא סוגרת ייבדקו שוב מול היתרות של היום. '
      + 'אם חשבונית נסגרה בינתיים, האישור ייעצר ולא יינתן מספר.',
    );
  }
  lines.push('המקור ייחתם ויימסר כמו מסמך שהופק ישירות.');
  return lines.join('\n');
}

export function draftDiscardMessage(row: { document_number: string; draft_target_type?: string | null }): string {
  return `למחוק את הטיוטה ${row.document_number} (${draftTargetLabel(row.draft_target_type)})?\n`
    + 'לטיוטה אין מספר והיא לא סגרה דבר, כך שלא נשאר אחריה חור בסדרה. אי אפשר לשחזר אותה.';
}

// ── Credit notes ────────────────────────────────────────────────────────────

/** What a credit note may credit, as the ledger codes it (service.CREDITABLE_TYPES). */
const CREDITABLE_CODES: ReadonlySet<string> = new Set(['tax_invoice', 'combined']);

/** A credit note the new-document dialog opens already linked to its original and customer. */
export interface CreditPrefill {
  documentNumber: string;
  /** The original's date, YYYY-MM-DD. */
  documentDate: string;
  clientType: 'existing' | 'business';
  childId: string | null;
  businessCustomerId: string | null;
}

interface CreditableRow {
  id: string;
  origin?: string;
  is_draft?: boolean;
  document_type_code?: string;
  document_number: string;
  issue_date: string;
  child_id?: string | null;
  business_customer_id?: string | null;
}

/**
 * Whether a documents-list row offers "זיכוי": a tax invoice or an
 * invoice-receipt issued in kogo (origin manual), with its customer known.
 * A lesson receipt or a store sale is credited from "מסמך חדש" by its number.
 */
export function canCreditFromRow(row: CreditableRow): boolean {
  return creditPrefillFromRow(row) !== null;
}

export function creditPrefillFromRow(row: CreditableRow): CreditPrefill | null {
  if (row.origin !== 'manual' || row.is_draft || !row.id) return null;
  if (!CREDITABLE_CODES.has(row.document_type_code ?? '')) return null;
  return prefill(row.document_number, row.issue_date, row.child_id ?? null, row.business_customer_id ?? null);
}

/** The same from a document's detail (documents/{id}/). */
export function creditPrefillFromDocument(doc: {
  document_number: string;
  document_type: string;
  document_date: string;
  child: string | null;
  business_customer: string | null;
}): CreditPrefill | null {
  if (!CREDITABLE_CODES.has(doc.document_type)) return null;
  return prefill(doc.document_number, doc.document_date, doc.child, doc.business_customer);
}

function prefill(number: string, date: string, childId: string | null, businessCustomerId: string | null): CreditPrefill | null {
  if (!number || (!childId && !businessCustomerId)) return null;
  return {
    documentNumber: number,
    documentDate: String(date || '').slice(0, 10),
    clientType: businessCustomerId ? 'business' : 'existing',
    childId: businessCustomerId ? null : childId,
    businessCustomerId,
  };
}

export type CreditAckState = 'confirmed' | 'pending' | null;

/**
 * A credit note's customer confirmation, as a list row shows it: null for
 * anything that is not a credit note issued in kogo, or on a server that does
 * not say (the field is absent).
 */
export function creditAckState(row: {
  document_type_code?: string;
  origin?: string;
  customer_ack_at?: string | null;
}): CreditAckState {
  if (row.document_type_code !== 'credit_invoice' || row.origin !== 'manual') return null;
  if (row.customer_ack_at === undefined) return null;
  return row.customer_ack_at ? 'confirmed' : 'pending';
}

/** "נותר לזכות" of an original, before VAT (GET documents/credit-room/). */
export interface CreditRoom {
  number: string;
  /** kogo issued it; false for the previous software's numbers (amount unknown here). */
  known: boolean;
  kind: '' | 'formal' | 'lesson' | 'store';
  document_type: string;
  document_type_label: string;
  document_date: string | null;
  creditable: boolean;
  /** Why it cannot be credited at all; '' when it can. */
  refusal: string;
  /** Amounts before VAT as '200.00'; null when unknown or refused. */
  net: string | null;
  credited: string | null;
  left: string | null;
  child_id: string | null;
  business_customer_id: string | null;
}

function agorot(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Why the credit note the form holds would be refused by the server's rule,
 * or null. Only what the room knows: an unknown number (the previous
 * software's) is the server's to judge by its date.
 */
export function creditRoomProblem(
  room: CreditRoom | null | undefined,
  amountBeforeVat: number,
  customer: { childId: string | null; businessCustomerId: string | null },
): string | null {
  if (!room || !room.known) return null;
  if (!room.creditable) return room.refusal || 'את המסמך הזה אי אפשר לזכות';
  const otherChild = room.child_id && room.child_id !== customer.childId;
  const otherBusiness = room.business_customer_id && room.business_customer_id !== customer.businessCustomerId;
  if (otherChild || otherBusiness) {
    return `${room.number} הונפק ללקוח אחר. זיכוי ניתן רק ללקוח שקיבל את המסמך המקורי.`;
  }
  const left = agorot(room.left);
  if (left <= 0) return `${room.number} כבר זוכה במלואו — לא נותר מה לזכות.`;
  if (agorot(amountBeforeVat) > left) {
    return `אפשר לזכות את ${room.number} עד ${formatShekels(left)} לפני מע״מ.`;
  }
  return null;
}

function formatShekels(agorotValue: number): string {
  return `₪${(agorotValue / 100).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The room's figures as the form prints them, or null when there is nothing to say. */
export function creditRoomSummary(room: CreditRoom | null | undefined): string | null {
  if (!room || !room.known || !room.creditable) return null;
  return `נותר לזכות: ${formatShekels(agorot(room.left))} לפני מע״מ · `
    + `סכום המקור ${formatShekels(agorot(room.net))} · זוכו עד כה ${formatShekels(agorot(room.credited))}`;
}

/**
 * The day the customer's confirmation arrived, as the form checks it before
 * the server does: a date, not in the future, not before the credit note.
 */
export function ackDateProblem(date: string, creditDate: string | null | undefined, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'יש לבחור את התאריך שבו התקבל האישור';
  if (date > today) return 'תאריך האישור אינו יכול להיות בעתיד';
  const credited = String(creditDate || '').slice(0, 10);
  if (credited && date < credited) return 'תאריך האישור מוקדם מתאריך חשבונית הזיכוי';
  return null;
}
