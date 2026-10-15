/**
 * Sending a file the office attached, in its three steps (docs/WAHUB-CONTRACT.md, "צירוף קבצים"): the server
 * checks it and hands out an address; the browser uploads it there itself (Vercel takes no request body over
 * 4.5MB); the server sends it through ManyChat. Kept apart from the screen so the order of the steps, and which
 * one failed, can be checked without a browser.
 */
import { readableError } from '@/lib/apiError';
import {
  isWindowClosed,
  prepareWahubAttachment,
  sendWahubMedia,
  serverAnswered,
  uploadWahubAttachment,
} from '@/lib/wahubApi';
import type { WahubSendResult } from '@/types/wahub';
import type { WahubAttachmentTicket } from './composer';

export type AttachmentStep = 'prepare' | 'upload' | 'send';

export interface AttachmentSendApi {
  prepare: (id: number, file: { name: string; type: string; size: number }) => Promise<WahubAttachmentTicket>;
  upload: (ticket: WahubAttachmentTicket, file: Blob) => Promise<void>;
  send: (id: number, body: { path: string; kind: string; caption: string; name: string }) => Promise<WahubSendResult>;
}

const API: AttachmentSendApi = { prepare: prepareWahubAttachment, upload: uploadWahubAttachment, send: sendWahubMedia };

/** A step failed: which one — before the upload nothing exists, after it the send's outcome may be unknown. */
export class AttachmentSendError extends Error {
  constructor(
    readonly step: AttachmentStep,
    readonly cause: unknown,
  ) {
    super(`attachment ${step} failed`);
  }
}

export async function sendAttachment(
  id: number,
  file: File,
  caption: string,
  onPhase?: (phase: 'upload' | 'send') => void,
  api: AttachmentSendApi = API,
): Promise<WahubSendResult> {
  let step: AttachmentStep = 'prepare';
  try {
    onPhase?.('upload');
    const ticket = await api.prepare(id, file);
    step = 'upload';
    await api.upload(ticket, file);
    step = 'send';
    onPhase?.('send');
    return await api.send(id, { path: ticket.path, kind: ticket.kind, caption, name: file.name });
  } catch (error) {
    throw new AttachmentSendError(step, error);
  }
}

/**
 * What a failed send says, by the step it failed at: the 24 hours ran out
 * (the box locks), the file never reached the storage (nothing was sent), the
 * server did not answer the send itself (nobody knows — look before sending
 * again), or the server's own reason.
 */
export function attachmentFailure(failure: unknown): { text: string; windowClosed: boolean; unknown: boolean } {
  const step = failure instanceof AttachmentSendError ? failure.step : 'send';
  const error = failure instanceof AttachmentSendError ? failure.cause : failure;
  if (isWindowClosed(error)) {
    return { text: readableError(error, 'עברו 24 שעות מההודעה האחרונה של הלקוח. אפשר לשלוח רק תבנית'), windowClosed: true, unknown: false };
  }
  if (step === 'upload') return { text: 'הקובץ לא הועלה. בדקו את החיבור ונסו שוב.', windowClosed: false, unknown: false };
  if (!serverAnswered(error)) {
    return step === 'send'
      ? { text: 'לא ידוע אם הקובץ נשלח. בדקו בשיחה לפני ששולחים שוב.', windowClosed: false, unknown: true }
      : { text: 'אין חיבור לשרת. הקובץ לא נשלח.', windowClosed: false, unknown: false };
  }
  return { text: readableError(error, 'הקובץ לא נשלח'), windowClosed: false, unknown: false };
}
