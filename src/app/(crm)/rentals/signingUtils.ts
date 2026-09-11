import type { RentalContract, TenancyTenant } from '@/lib/rentalsApi';
import { contractVersionLabel, formatDateTime, isUnsignedContract } from './contractUtils';
import type { StatusTone } from './tenancyUtils';

// ---------------------------------------------------------------------------
// Sending a version for signing, on the tenants screen — pure, so
// signingUtils.test.ts pins it down: the WhatsApp number and message, how the
// link's expiry reads, which link is still live, when a version may be sent,
// and the sent / viewed / signed chips. Where a version stands is still the
// server's to say; nothing here works it out from anything else.
// ---------------------------------------------------------------------------

// ---- WhatsApp ----

const ISRAELI_MOBILE = /^5\d{8}$/;
const E164_DIGITS = /^[1-9]\d{7,14}$/;

/**
 * The tenant's phone as wa.me wants it: digits only, country code first. An
 * Israeli number has to be a mobile (05X…), which comes back as 9725X…; a
 * landline has no WhatsApp to open. A foreign number is taken only when it
 * says its country (+ or 00). Anything else is null, and the dialog offers no
 * WhatsApp button rather than one that opens a stranger's chat.
 */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  const raw = String(phone ?? '').trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  let international = raw.startsWith('+');
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  if (digits.startsWith('972')) {
    // "+972 050…" — the trunk zero some people keep after the country code.
    const national = digits.slice(3).replace(/^0/, '');
    return ISRAELI_MOBILE.test(national) ? `972${national}` : null;
  }
  if (international) return E164_DIGITS.test(digits) ? digits : null;
  const national = digits.replace(/^0/, '');
  return ISRAELI_MOBILE.test(national) ? `972${national}` : null;
}

/**
 * A wa.me link that opens the office user's own WhatsApp on a chat with the
 * tenant, the message typed in and waiting. Nothing is sent until they press
 * send there. null when the phone cannot be a WhatsApp number.
 */
export function whatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const number = whatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

/** The first name a message greets: the contact's own, else the tenant's full name. */
function greetingName(tenant: Partial<Pick<TenancyTenant, 'first_name' | 'full_name'>> | null | undefined): string {
  return (tenant?.first_name ?? '').trim() || (tenant?.full_name ?? '').trim();
}

/** The message the office sends with the link, in its own WhatsApp. */
export function signingWhatsAppMessage({
  tenant,
  url,
  version,
  branchName,
  expiresAt,
}: {
  tenant: Partial<Pick<TenancyTenant, 'first_name' | 'full_name'>> | null | undefined;
  url: string;
  version: number | null | undefined;
  branchName?: string | null;
  expiresAt?: string | null;
}): string {
  const name = greetingName(tenant);
  const branch = (branchName ?? '').trim();
  const until = formatDateTime(expiresAt);
  return [
    name ? `שלום ${name},` : 'שלום,',
    `זה הקישור לקריאה ולחתימה על חוזה השכירות${branch ? ` בסניף ${branch}` : ''} (${contractVersionLabel(version)}):`,
    url,
    until ? `הקישור בתוקף עד ${until}.` : '',
    'תודה, קוגומלו',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---- the link ----

const DAY_MS = 24 * 60 * 60 * 1000;

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Past its expiry. A link without a readable expiry is not called expired — the server has the last word. */
export function isSigningLinkExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  const t = timeOf(expiresAt);
  return t !== null && t <= now.getTime();
}

/** 'בתוקף עד 25.9.2026, 14:05 (עוד 14 ימים)', or 'פג תוקף ב־…' once past. '' without a readable time. */
export function signingExpiryText(expiresAt: string | null | undefined, now: Date = new Date()): string {
  const t = timeOf(expiresAt);
  const until = formatDateTime(expiresAt);
  if (t === null || !until) return '';
  const left = t - now.getTime();
  if (left <= 0) return `פג תוקף ב־${until}`;
  const days = Math.floor(left / DAY_MS);
  const remaining = days >= 2 ? `עוד ${days} ימים` : days === 1 ? 'עוד יום' : 'פחות מיום';
  return `בתוקף עד ${until} (${remaining})`;
}

// The status is read loosely, as isUnsignedContract reads it: a status this build does not know is the server's word too.
type LinkFields = { status: string } & Partial<Pick<RentalContract, 'signing_url' | 'signing_expires_at'>>;

/**
 * The link the tenant can still open: issued for an unsigned version and not
 * past its expiry. null otherwise — none yet, cancelled, expired, or a version
 * signed or void — and the dialog makes a new one rather than hand out a dead one.
 */
export function liveSigningLink(
  contract: LinkFields | null | undefined,
  now: Date = new Date(),
): { url: string; expiresAt: string | null } | null {
  if (!contract || !isUnsignedContract(contract)) return null;
  const url = (contract.signing_url ?? '').trim();
  if (!url || isSigningLinkExpired(contract.signing_expires_at, now)) return null;
  return { url, expiresAt: contract.signing_expires_at ?? null };
}

/**
 * The link as it is shown and sent: the server's full address, or a path it
 * gave made full on this site's origin. '' for anything else — never a
 * protocol-relative or script address in a message to a tenant.
 */
export function absoluteSigningUrl(url: string | null | undefined, origin: string): string {
  const value = (url ?? '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return `${origin.replace(/\/+$/, '')}${value}`;
  return '';
}

/**
 * Whether "שליחה לחתימה" is offered for a version: unsigned and not void. One
 * that no longer matches the agreement is shown but held back — the server
 * refuses it — with the reason in `blockedReason`.
 */
export function sendForSigningState(
  contract: { status: string; is_stale?: boolean } | null | undefined,
): { offered: boolean; blockedReason: string } {
  if (!contract || !isUnsignedContract(contract)) return { offered: false, blockedReason: '' };
  if (contract.is_stale) {
    return { offered: true, blockedReason: 'ההסכם השתנה אחרי שהגרסה הופקה — הפיקו גרסה חדשה ושלחו אותה' };
  }
  return { offered: true, blockedReason: '' };
}

// ---- where the signing stands ----

export type SigningStep = 'sent' | 'viewed' | 'signed';

export interface SigningChip {
  step: SigningStep;
  label: string;
  /** '11.9.2026, 14:05', in Israel. */
  time: string;
  tone: StatusTone;
  /** 'נשלח 11.9.2026, 14:05'. */
  text: string;
}

type StepTimes = Partial<Record<'sent_at' | 'viewed_at' | 'signed_at', string | null>>;

const STEPS: ReadonlyArray<{ step: SigningStep; key: keyof StepTimes; label: string; tone: StatusTone }> = [
  { step: 'sent', key: 'sent_at', label: 'נשלח', tone: 'progress' },
  { step: 'viewed', key: 'viewed_at', label: 'נצפה', tone: 'progress' },
  { step: 'signed', key: 'signed_at', label: 'נחתם', tone: 'signed' },
];

/**
 * The steps a version went through on its way to the tenant's signature, each
 * with when — only those the server stamped with a readable time, in order.
 */
export function signingChips(contract: StepTimes | null | undefined): SigningChip[] {
  if (!contract) return [];
  return STEPS.flatMap(({ step, key, label, tone }) => {
    const time = formatDateTime(contract[key]);
    return time ? [{ step, label, time, tone, text: `${label} ${time}` }] : [];
  });
}

/** 'נחתם על ידי דנה לוי'; '' without a name. */
export function signedByText(name: string | null | undefined): string {
  const who = (name ?? '').trim();
  return who ? `נחתם על ידי ${who}` : '';
}
