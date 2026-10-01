/**
 * How an issued document's signed original reached the customer — the chip the
 * child's card and the business customer's card show beside every document.
 *
 * The server sends `delivery_status` on each document row (backend:
 * apps/customers/document_delivery.py): the stored original's delivery, why,
 * whether it is an archive copy, and when it was signed, mailed or printed —
 * or null for a document with no stored original (issued before signing, not
 * yet copied to the archive). These rules only read it, and are pure so they
 * are tested without a browser.
 */
import { formatSigningStamp } from './signingUtils';

export type DocumentDelivery = 'email' | 'paper' | 'held' | 'none';

export interface DocumentDeliveryStatus {
  delivery: DocumentDelivery;
  /** Why it goes where it goes, in the server's Hebrew. */
  delivery_reason: string;
  /** An archive copy is never delivered: the document went out before signing existed. */
  purpose: 'original' | 'archive';
  signed_at: string | null;
  sent_at: string | null;
  paper_original_printed_at: string | null;
}

const DELIVERIES: ReadonlySet<string> = new Set(['email', 'paper', 'held', 'none']);

function stamp(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * A row's delivery_status off the wire, or null — when the server sent none
 * (no stored original, or a server without the field) or something unreadable.
 * A delivery it does not know reads as 'none' rather than as a promise.
 */
export function readDeliveryStatus(raw: unknown): DocumentDeliveryStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const delivery = typeof row.delivery === 'string' && DELIVERIES.has(row.delivery)
    ? (row.delivery as DocumentDelivery)
    : 'none';
  return {
    delivery,
    delivery_reason: typeof row.delivery_reason === 'string' ? row.delivery_reason : '',
    purpose: row.purpose === 'archive' ? 'archive' : 'original',
    signed_at: stamp(row.signed_at),
    sent_at: stamp(row.sent_at),
    paper_original_printed_at: stamp(row.paper_original_printed_at),
  };
}

export type DeliveryChipTone = 'done' | 'waiting' | 'quiet';

export interface DeliveryChipView {
  label: string;
  tone: DeliveryChipTone;
  /** The line under the chip — when, or why. '' when there is nothing to add. */
  note: string;
}

/** What a document with no stored original says, where a chip would be. */
export const NO_STORED_ORIGINAL_NOTE = 'אין מקור חתום שמור — הונפק לפני החתימה';

/**
 * The chip for one document: נשלח במייל · למסירה ידנית · הודפס · ממתין (and
 * why) · ארכיון. Null when there is no stored original — the card then shows
 * a dash rather than claim a delivery it cannot back.
 */
export function deliveryChip(status: DocumentDeliveryStatus | null | undefined): DeliveryChipView | null {
  if (!status) return null;
  if (status.purpose === 'archive') {
    return { label: 'ארכיון', tone: 'quiet', note: 'העתק לארכיון של מסמך שהונפק לפני החתימה' };
  }
  switch (status.delivery) {
    case 'email': {
      if (status.sent_at) {
        return { label: 'נשלח במייל', tone: 'done', note: formatSigningStamp(status.sent_at) };
      }
      return { label: 'ממתין לשליחה', tone: 'waiting', note: status.delivery_reason };
    }
    case 'paper': {
      if (status.paper_original_printed_at) {
        const when = formatSigningStamp(status.paper_original_printed_at);
        return { label: 'הודפס', tone: 'done', note: when ? `המקור הודפס ב-${when}` : 'המקור הודפס' };
      }
      return { label: 'למסירה ידנית', tone: 'waiting', note: status.delivery_reason || 'המקור טרם הודפס' };
    }
    case 'held':
      return {
        label: 'ממתין',
        tone: 'waiting',
        note: status.delivery_reason || (status.signed_at ? 'ממתין להסכמה' : 'ממתין לחתימה'),
      };
    default:
      return { label: 'לא נשלח', tone: 'quiet', note: status.delivery_reason };
  }
}

/** Tailwind classes per tone, shared by every card that shows the chip. */
export const DELIVERY_CHIP_CLASSES: Readonly<Record<DeliveryChipTone, string>> = {
  done: 'bg-emerald-100 text-emerald-800',
  waiting: 'bg-amber-100 text-amber-800',
  quiet: 'bg-slate-100 text-slate-600',
};
