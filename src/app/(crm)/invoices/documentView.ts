/**
 * Showing a document on the screen, without downloading it (owner, 7.10.2026).
 *
 * Two files can be shown for one document:
 *  - the copy the page has always handed out ("העתק") — drawn now, with what
 *    was added since (an allocation number), and with no seal on it;
 *  - the signed original, once it was signed — the one file that carries the
 *    digital signature and its seal. It went to the customer; the office's
 *    look at it is the logged one the signing screens already use.
 *
 * The owner issued a tax invoice, opened it from this page and saw no
 * signature: he was looking at the copy. So the window says outright whether
 * the document was signed, and the signed file is one press away.
 */
import type { DocumentRow } from './types';

export type ViewEdition = 'copy' | 'original';

type Signed = Pick<DocumentRow, 'signed_original_id' | 'signed_at'>;

/** Whether the signed original can be shown: the server named it. */
export function hasSignedOriginal(doc: Signed): boolean {
  return Boolean(doc.signed_original_id);
}

/** "7.10.2026, 12:30" in the studio's own time — or '' when the moment is unknown or unreadable. */
export function signedMoment(signedAt: string | null | undefined): string {
  if (!signedAt) return '';
  const moment = new Date(signedAt);
  if (Number.isNaN(moment.getTime())) return '';
  const parts = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(moment);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}.${part('month')}.${part('year')}, ${part('hour')}:${part('minute')}`;
}

/** The one line that says where the signature is. Empty for a document that was not signed. */
export function signatureLine(doc: Signed): string {
  if (!hasSignedOriginal(doc)) return '';
  const when = signedMoment(doc.signed_at);
  return when ? `נחתם דיגיטלית · ${when}` : 'נחתם דיגיטלית';
}

/** What stands under the line while the copy is on show: why no seal is seen on it. */
export const COPY_HAS_NO_SEAL = 'זה העתק, ואין עליו חותמת. החותמת על המקור החתום.';

/** The name a shown file is saved under, when the reader asks to keep it. */
export function viewFilename(documentNumber: string | null | undefined, edition: ViewEdition): string {
  const name = String(documentNumber ?? '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'מסמך';
  return edition === 'original' ? `${name}.pdf` : `${name} - העתק.pdf`;
}
