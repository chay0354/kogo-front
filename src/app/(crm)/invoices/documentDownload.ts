/**
 * Where a documents-tab row's PDF comes from — one rule for the button and for the click.
 *
 * - a store sale: the store's own PDF;
 * - a Tranzila document: its public URL, as before;
 * - a lesson receipt (IR, 30.9.2026 — audit M5): a copy through the child
 *   card's endpoint, `?copy=1` ("העתק", never the original's one print). Until
 *   the server names the receipt (lesson_invoice_id) the row has no file, as
 *   before, rather than a download that might print "מקור";
 * - kogo's own documents: the documents endpoint.
 */
import type { DocumentRow } from './types';

export type DocumentDownloadRoute =
  | { kind: 'store'; id: string }
  | { kind: 'url'; url: string }
  | { kind: 'lesson_receipt'; id: string }
  | { kind: 'local'; id: string };

export function documentDownloadRoute(
  doc: Pick<DocumentRow, 'id' | 'pdf_url' | 'store_invoice_id' | 'lesson_invoice_id' | 'source'>,
): DocumentDownloadRoute | null {
  if (doc.store_invoice_id) return { kind: 'store', id: doc.store_invoice_id };
  if (doc.pdf_url) return { kind: 'url', url: doc.pdf_url };
  if (doc.lesson_invoice_id) return { kind: 'lesson_receipt', id: doc.lesson_invoice_id };
  if (doc.source === 'local') return { kind: 'local', id: doc.id };
  return null;
}

/**
 * "זיכוי" on a documents-tab row (6.10.2026): offered on a lesson receipt whose
 * charge the server says can be refunded — one completed charge that took
 * money and was not declined; never on a receipt already refunded in full, a
 * store sale or a manual document. Null — no button — also on a server that
 * does not say.
 */
export function lessonReceiptRefund(
  doc: Pick<DocumentRow, 'lesson_invoice_id' | 'payment_id' | 'payment_refundable' | 'payment_amount' | 'total_amount' | 'status'>,
): { paymentId: string; amount: number } | null {
  if (!doc.lesson_invoice_id || !doc.payment_id || doc.payment_refundable !== true) return null;
  if (doc.status === 'refunded') return null;
  const amount = Number(doc.payment_amount ?? doc.total_amount) || 0;
  if (amount <= 0) return null;
  return { paymentId: String(doc.payment_id), amount };
}
