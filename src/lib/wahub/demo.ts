import type { WahubContact } from '@/types/wahub';

/**
 * Demo contacts (stage 2, section ה): people the owner invents to watch the
 * system work — tagging, summary, cross-check, shadow replies, proposals —
 * before anything is connected to ManyChat. A demo contact never receives a
 * message, even with sending switched on; the server enforces that, and the
 * screen says it.
 */

/** A contact is demo when the server flags it, or when its source says so (an older copy without the flag). */
export function isDemoContact(contact: Pick<WahubContact, 'is_demo' | 'source'> | null | undefined): boolean {
  if (!contact) return false;
  return contact.is_demo === true || contact.source === 'demo';
}

/** Demo phones all start this way: 050-555 and four digits. Nothing real has them. */
export const DEMO_PHONE_PREFIX = '050555';

/**
 * A free demo number, 050-555XXXX. Takes the first four digits not yet used by
 * the phones given (any way they are written); counts from 0001.
 */
export function suggestDemoPhone(taken: ReadonlyArray<string> = []): string {
  const used = new Set(
    taken
      .map((phone) => phone.replace(/\D/g, ''))
      .map((digits) => (digits.startsWith('972') ? `0${digits.slice(3)}` : digits))
      .filter((digits) => digits.startsWith(DEMO_PHONE_PREFIX) && digits.length === 10)
      .map((digits) => digits.slice(6)),
  );
  for (let n = 1; n <= 9999; n += 1) {
    const suffix = String(n).padStart(4, '0');
    if (!used.has(suffix)) return `${DEMO_PHONE_PREFIX.slice(0, 3)}-${DEMO_PHONE_PREFIX.slice(3)}${suffix}`;
  }
  return `${DEMO_PHONE_PREFIX.slice(0, 3)}-${DEMO_PHONE_PREFIX.slice(3)}0001`;
}

export function isDemoPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
  return local.startsWith(DEMO_PHONE_PREFIX) && local.length === 10;
}

export type DemoSender = 'customer' | 'bot';

export const DEMO_SENDERS: Array<{ key: DemoSender; label: string; button: string; hint: string }> = [
  { key: 'customer', label: 'כתוב כלקוח', button: 'הלקוח שלח', hint: 'כאילו הלקוח כתב לנו בוואטסאפ' },
  { key: 'bot', label: 'כתוב כבוט הישן', button: 'הבוט הישן ענה', hint: 'כאילו הבוט של הספק ענה לו' },
];

/** The body of POST contacts/{id}/simulate-inbound/. Empty text is refused here, before the server. */
export function simulateInboundBody(text: string, sender: DemoSender): { text: string; sender: DemoSender } | null {
  const clean = text.trim();
  if (!clean) return null;
  return { text: clean.slice(0, 4096), sender };
}

export interface NewContactInput {
  phone: string;
  name: string;
  note?: string;
  isDemo?: boolean;
}

/** The body of POST contacts/: `is_demo` is written only when it is on, so an older server is not surprised by it. */
export function newContactBody(input: NewContactInput): { phone: string; name: string; note?: string; is_demo?: true } {
  const body: { phone: string; name: string; note?: string; is_demo?: true } = {
    phone: input.phone.trim(),
    name: input.name.trim(),
  };
  if (input.note?.trim()) body.note = input.note.trim();
  if (input.isDemo) body.is_demo = true;
  return body;
}

// ---------------------------------------------------------------------------
// A real conversation with a demo contact (docs/WAHUB-CONTRACT-REAL-DEMO.md):
// a recording, a picture, several messages in a row, and the new bot answering.
// ---------------------------------------------------------------------------

/** What the owner "sends" as the customer (or as the old bot) into a demo conversation. */
export type DemoInput =
  | { kind: 'text'; text: string; sender: DemoSender }
  | { kind: 'voice'; file: Blob; mimeType: string; durationMs: number }
  | { kind: 'image'; file: File; caption: string };

/** The server's ceilings (הבהרה 1): a recording up to 10MB, a picture up to 5MB. */
export const MEDIA_LIMITS = {
  voice: { maxBytes: 10 * 1024 * 1024, label: '10MB' },
  image: { maxBytes: 5 * 1024 * 1024, label: '5MB' },
} as const;

/** The pictures the server takes: jpg/jpeg/png/webp/heic. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic)$/i;

/** Why a chosen picture cannot be sent, in words; empty when it can. */
export function imageFileProblem(file: { name: string; type: string; size: number }): string {
  if (file.size <= 0) return 'הקובץ ריק.';
  if (!IMAGE_TYPES.has(file.type) && !IMAGE_EXTENSIONS.test(file.name)) {
    return 'אפשר לשלוח תמונה בלבד: jpg, png, webp או heic.';
  }
  if (file.size > MEDIA_LIMITS.image.maxBytes) return `התמונה גדולה מדי (עד ${MEDIA_LIMITS.image.label}).`;
  return '';
}

/** Why a recording cannot be sent; empty when it can. */
export function recordingProblem(blob: { size: number }): string {
  if (blob.size <= 0) return 'ההקלטה ריקה.';
  if (blob.size > MEDIA_LIMITS.voice.maxBytes) return `ההקלטה ארוכה מדי (עד ${MEDIA_LIMITS.voice.label}).`;
  return '';
}

/** The formats to record in, best first. Chrome and Firefox take webm/ogg (opus); Safari takes mp4 only. */
export const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

/** The first format the browser can record in; null when it can record in none of them (it then picks its own). */
export function pickRecordingMimeType(isSupported: (type: string) => boolean): string | null {
  return RECORDING_MIME_TYPES.find((type) => isSupported(type)) ?? null;
}

const RECORDING_EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
};

/**
 * The name the recording is uploaded under. The server reads the extension off
 * it (הבהרה 1): webm/ogg from Chrome and Firefox, m4a from Safari's mp4.
 */
export function recordingFileName(mimeType: string): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  return `recording.${RECORDING_EXTENSION[base] ?? 'webm'}`;
}

/** 0:07, 1:05 — the clock beside the red dot. */
export function formatRecordingClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A recording stops by itself here — long before the server's 10MB. */
export const MAX_RECORDING_MS = 5 * 60_000;

/** The new bot answers this long after the customer's last message of a burst. */
export const REPLY_DELAY_MS = 3000;

/**
 * What a key does in the customer's box, as in WhatsApp: Enter sends, Shift+Enter
 * breaks the line, and a key pressed while an input method is composing is its own.
 */
export function composerKeyAction(key: { key: string; shiftKey: boolean; isComposing?: boolean }): 'send' | null {
  return key.key === 'Enter' && !key.shiftKey && !key.isComposing ? 'send' : null;
}

/**
 * The key handler of a box that sends on Enter: the line break is swallowed and
 * `send` is called; Shift+Enter, and any other key, is left to the box. The
 * box itself is never touched, so the cursor stays in it for the next line.
 * True when it sent.
 */
export function sendOnEnter(
  event: { key: string; shiftKey: boolean; nativeEvent?: { isComposing?: boolean }; preventDefault: () => void },
  send: () => void,
): boolean {
  const action = composerKeyAction({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent?.isComposing });
  if (action !== 'send') return false;
  event.preventDefault();
  send();
  return true;
}

/** "320KB", "1.4MB" — the size beside a chosen picture. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export type SimulateRequest = { json: { text: string; sender: DemoSender } } | { form: FormData };

/**
 * The request of POST contacts/{id}/simulate-inbound/: JSON for words,
 * multipart for a recording or a picture (`message_type`, `file`, and the
 * caption as `text`). Null when there is nothing to send. Media is always the
 * customer's — the server refuses it from the bot.
 */
export function buildSimulateRequest(input: DemoInput): SimulateRequest | null {
  if (input.kind === 'text') {
    const json = simulateInboundBody(input.text, input.sender);
    return json ? { json } : null;
  }
  if (input.file.size <= 0) return null;
  const form = new FormData();
  form.append('message_type', input.kind);
  form.append('sender', 'customer');
  if (input.kind === 'voice') {
    form.append('file', input.file, recordingFileName(input.mimeType || input.file.type));
  } else {
    form.append('file', input.file, input.file.name || 'image.jpg');
    const caption = input.caption.trim();
    if (caption) form.append('text', caption.slice(0, 4096));
  }
  return { form };
}
