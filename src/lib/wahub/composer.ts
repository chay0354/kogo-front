/**
 * The writing box of a conversation, 15.10.2026 (owner): what it decides
 * without a server.
 *
 * - The two openers of a closed conversation, "פתיחת שיחה" and "המשך שיחה",
 *   and which of them comes first.
 * - A ready-made reply goes out at once — unless something in it is still to
 *   be filled in by hand ({{video_url}}).
 * - "השב" to one message: the line that is quoted, and how a quote is drawn
 *   back in a bubble (WhatsApp shows "> " at the start of a line as a quote).
 * - A file the office attaches: which ones, how large, and a picture pasted
 *   from the clipboard.
 * - What ✓ "סגירת שיחה" says once the goodbye went out, or did not.
 */
import type { WahubContact, WahubMessage } from '@/types/wahub';
import { fillQuickReply } from './format';
import { MEDIA_WORDS } from './media';

// ---------------------------------------------------------------------------
// The two openers
// ---------------------------------------------------------------------------

export type OpenerKind = 'open' | 'continue';

export interface Opener {
  kind: OpenerKind;
  label: string;
  /** The automation's fixed name in ManyChat, as the server looks for it. */
  flowName: string;
}

export const OPENERS: Record<OpenerKind, Opener> = {
  open: { kind: 'open', label: 'פתיחת שיחה', flowName: 'open chat' },
  continue: { kind: 'continue', label: 'המשך שיחה', flowName: 'chat continue' },
};

/** Somebody who never wrote is opened; somebody who wrote and went quiet is continued. That one comes first. */
export function openerOrder(contact: Pick<WahubContact, 'last_inbound_at' | 'first_inbound_at'>): Opener[] {
  const neverWrote = !contact.last_inbound_at && !contact.first_inbound_at;
  return neverWrote ? [OPENERS.open, OPENERS.continue] : [OPENERS.continue, OPENERS.open];
}

/** What became of a press on an opener, said under the two buttons. */
export interface OpeningOutcome {
  ok: boolean;
  text: string;
}

/** The outcome of an opener the server took: sent, only recorded, or kept as not sent with the reason. */
export function openingOutcomeOf(message: Pick<WahubMessage, 'status' | 'error'>): OpeningOutcome {
  if (message.status === 'failed') return { ok: false, text: `לא נשלח${message.error ? `: ${message.error}` : ''}` };
  if (message.status === 'simulated') return { ok: true, text: 'נרשם בהדמיה – לא נשלח' };
  return { ok: true, text: 'נשלח ✓' };
}

// ---------------------------------------------------------------------------
// A ready-made reply
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{\{\s*[^{}]+?\s*\}\}/g;

/** The {{…}} still in a reply once the first name was filled — each once, in order. */
export function unfilledPlaceholders(text: string): string[] {
  return Array.from(new Set(text.match(PLACEHOLDER) ?? []));
}

/** The short note beside a reply that went into the box instead of out. */
export function placeholderHint(left: ReadonlyArray<string>): string {
  return left.length ? `צריך להשלים ${left.join(', ')} לפני השליחה` : '';
}

/**
 * What a press on a ready-made reply does: `send` it as it is now — or, when
 * a {{…}} is left once the first name is filled, put it in the box to `edit`,
 * with the note of what is missing.
 */
export function quickReplyPlan(
  replyText: string,
  contactName: string | null | undefined,
  maxLength = 4096,
): { kind: 'send'; text: string } | { kind: 'edit'; text: string; hint: string } {
  const filled = fillQuickReply(replyText, contactName).slice(0, maxLength);
  const left = unfilledPlaceholders(filled);
  if (left.length) return { kind: 'edit', text: filled, hint: placeholderHint(left) };
  return { kind: 'send', text: filled.trim() };
}

// ---------------------------------------------------------------------------
// "השב" to one message
// ---------------------------------------------------------------------------

export const REPLY_EXCERPT_CHARS = 120;
const QUOTE_LINE = /^>(?: |$)/;

/**
 * The text and the quote it starts with, apart: the "> " lines at its head,
 * and what follows them (the blank line between is dropped). Null when the
 * text starts with no quote.
 */
export function splitQuote(text: string | null | undefined): { quote: string; body: string } | null {
  const lines = (text ?? '').split('\n');
  let count = 0;
  while (count < lines.length && QUOTE_LINE.test(lines[count])) count += 1;
  if (count === 0) return null;
  const quote = lines
    .slice(0, count)
    .map((line) => line.replace(QUOTE_LINE, ''))
    .join('\n')
    .trim();
  const body = lines.slice(count).join('\n').replace(/^\s*\n/, '').trim();
  return quote ? { quote, body } : null;
}

/**
 * The line a reply quotes: the first line of the message's own words (its own
 * quote, if it answered another, is not quoted again), up to 120 characters.
 * A file with no words is named.
 */
export function replyExcerpt(message: Pick<WahubMessage, 'text' | 'message_type' | 'media_url'>): string {
  const own = splitQuote(message.text)?.body ?? message.text ?? '';
  const line = own
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (line) return line.length > REPLY_EXCERPT_CHARS ? `${line.slice(0, REPLY_EXCERPT_CHARS - 1).trimEnd()}…` : line;
  const kind = message.message_type === 'other' ? officeMediaKind(message.media_url) : null;
  if (kind) return ATTACH_WORDS[kind];
  if (message.message_type === 'voice') return MEDIA_WORDS.voice;
  if (message.message_type === 'image') return MEDIA_WORDS.image;
  return 'הודעה';
}

/** What is sent when answering one message: the quote, a blank line, the words. */
export function withReply(excerpt: string | null | undefined, text: string): string {
  const quote = (excerpt ?? '').trim();
  return quote ? `> ${quote}\n\n${text}` : text;
}

// ---------------------------------------------------------------------------
// A file the office attaches
// ---------------------------------------------------------------------------

export type AttachKind = 'image' | 'video' | 'file';

const MB = 1024 * 1024;

/** What WhatsApp takes, as the server checks it (apps/wahub/media.py, OFFICE_KINDS). */
export const ATTACH_KINDS: Record<AttachKind, { extensions: string[]; types: string[]; maxBytes: number; word: string }> = {
  image: { extensions: ['jpg', 'jpeg', 'png', 'webp'], types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5 * MB, word: 'תמונה' },
  video: { extensions: ['mp4', '3gp'], types: ['video/mp4', 'video/3gpp'], maxBytes: 16 * MB, word: 'סרטון' },
  file: {
    extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx'],
    types: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    maxBytes: 25 * MB,
    word: 'מסמך',
  },
};

export const ATTACH_WORDS: Record<AttachKind, string> = {
  image: MEDIA_WORDS.image,
  video: MEDIA_WORDS.video,
  file: '📎 קובץ',
};

/** The file picker's filter: every extension and type above. */
export const ATTACH_ACCEPT = (Object.values(ATTACH_KINDS) as Array<(typeof ATTACH_KINDS)[AttachKind]>)
  .flatMap((kind) => [...kind.types, ...kind.extensions.map((ext) => `.${ext}`)])
  .join(',');

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{2,5})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : '';
}

/** Which kind a file is, by its name first and its type second; null for one WhatsApp is not sent from here. */
export function attachKind(file: { name: string; type: string }): AttachKind | null {
  const ext = extensionOf(file.name);
  const type = (file.type || '').toLowerCase();
  const kinds = Object.keys(ATTACH_KINDS) as AttachKind[];
  // As the server reads it: the name's extension, and the declared type when the name says nothing it knows.
  return (
    kinds.find((kind) => ATTACH_KINDS[kind].extensions.includes(ext)) ??
    kinds.find((kind) => ATTACH_KINDS[kind].types.includes(type)) ??
    null
  );
}

export const ATTACH_NOT_SUPPORTED = 'אפשר לשלוח תמונה (jpg, png, webp), סרטון (mp4, 3gp) או מסמך (pdf, doc, docx, xls, xlsx).';

/** Why a chosen file cannot be sent, in words; '' when it can. */
export function attachProblem(file: { name: string; type: string; size: number }): string {
  const kind = attachKind(file);
  if (!kind) return ATTACH_NOT_SUPPORTED;
  if (file.size <= 0) return 'הקובץ ריק.';
  const limit = ATTACH_KINDS[kind];
  if (file.size > limit.maxBytes) return `הקובץ גדול מדי. ${limit.word} עד ${limit.maxBytes / MB}MB.`;
  return '';
}

/** The type the upload is declared as: the file's own, else the kind's first. */
export function attachContentType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const kind = attachKind(file);
  if (!kind) return 'application/octet-stream';
  const index = ATTACH_KINDS[kind].extensions.indexOf(extensionOf(file.name));
  return ATTACH_KINDS[kind].types[Math.max(0, Math.min(index, ATTACH_KINDS[kind].types.length - 1))];
}

/** A picture on the clipboard (a screenshot pasted into the box); null when what was pasted is words. */
export function pastedImage(data: Pick<DataTransfer, 'items'> | null | undefined): File | null {
  if (!data?.items) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      if (file.name && extensionOf(file.name)) return file;
      // A screenshot comes with no name ("image.png" at best): it is given one by its type.
      const ext = item.type === 'image/jpeg' ? 'jpg' : item.type.split('/')[1] || 'png';
      return new File([file], `צילום מסך.${ext}`, { type: item.type });
    }
  }
  return null;
}

/** The kind of a file the office sent, by the path Kogo keeps it under (office/<contact>/<uuid>.<ext>). */
export function officeMediaKind(path: string | null | undefined): AttachKind | null {
  const match = /^office\/\d+\/[A-Za-z0-9_-]+\.([a-z0-9]{2,5})$/.exec(path ?? '');
  if (!match) return null;
  const ext = match[1];
  return (Object.keys(ATTACH_KINDS) as AttachKind[]).find((kind) => ATTACH_KINDS[kind].extensions.includes(ext)) ?? null;
}

/** What the office's attachment server step answered (POST contacts/{id}/attachments/). */
export interface WahubAttachmentTicket {
  path: string;
  kind: AttachKind;
  content_type: string;
  upload_url: string;
}

export function readAttachmentTicket(raw: unknown): WahubAttachmentTicket | null {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!data) return null;
  const { path, kind, content_type: contentType, upload_url: uploadUrl } = data;
  if (typeof path !== 'string' || typeof uploadUrl !== 'string' || !/^https:\/\//.test(uploadUrl)) return null;
  if (kind !== 'image' && kind !== 'video' && kind !== 'file') return null;
  return { path, kind, content_type: typeof contentType === 'string' ? contentType : '', upload_url: uploadUrl };
}

// ---------------------------------------------------------------------------
// ✓ "סגירת שיחה" — the goodbye
// ---------------------------------------------------------------------------

export type GoodbyeStatus = 'sent' | 'skipped' | 'failed';

export interface Goodbye {
  status: GoodbyeStatus;
  reason: string;
}

/** `goodbye` and `goodbye_reason` of the close's answer; null on a server that sends no goodbye. */
export function readGoodbye(raw: unknown): Goodbye | null {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const status = data?.goodbye;
  if (status !== 'sent' && status !== 'skipped' && status !== 'failed') return null;
  return { status, reason: typeof data?.goodbye_reason === 'string' ? data.goodbye_reason.trim() : '' };
}

/** The word that floats up once the conversation was closed: the title, and why when it matters. */
export function closedNotice(goodbye: Goodbye | null): { tone: 'success' | 'warning'; title: string; description?: string } {
  if (goodbye?.status === 'sent') return { tone: 'success', title: 'השיחה נסגרה ונשלחה הודעת סגירה' };
  if (goodbye?.status === 'failed') {
    return { tone: 'warning', title: `השיחה נסגרה. הודעת הסגירה לא נשלחה${goodbye.reason ? `: ${goodbye.reason}` : ''}` };
  }
  if (goodbye?.status === 'skipped' && goodbye.reason) {
    return { tone: 'success', title: 'השיחה נסגרה', description: `הודעת סגירה לא נשלחה: ${goodbye.reason}` };
  }
  return { tone: 'success', title: 'השיחה נסגרה' };
}
