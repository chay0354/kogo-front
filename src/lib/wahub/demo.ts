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
