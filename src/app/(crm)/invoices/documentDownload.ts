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
