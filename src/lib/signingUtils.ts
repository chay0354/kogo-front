/**
 * The electronic signature's display rules, apart from the screens so they can
 * be tested: when the new parts show at all, how a fingerprint and a time are
 * written, and what the key's backend is called.
 */
import type { SigningBackend, SigningStatus } from './signingApi';

/**
 * Whether anything new about signing is shown. Only a status the server said
 * `enabled: true` in turns it on — no status, a failed request or a server
 * without the feature all leave the screens exactly as they were.
 */
export function isSigningOn(status: SigningStatus | null | undefined): boolean {
  return status?.enabled === true;
}

/** A key is in place, whether or not the switch is on yet. */
export function isSigningConfigured(status: SigningStatus | null | undefined): boolean {
  return Boolean(status && status.backend !== 'none' && status.key_id);
}

const BACKEND_LABELS: Readonly<Record<SigningBackend, string>> = {
  gcp_kms: 'Google Cloud KMS (HSM)',
  local: 'מפתח מקומי — לבדיקות בלבד',
  none: 'לא הוגדר',
};

export function signingBackendLabel(backend: SigningBackend | null | undefined): string {
  return BACKEND_LABELS[backend ?? 'none'] ?? String(backend);
}

/**
 * A SHA-256 fingerprint the way Acrobat and openssl show it: upper-case hex in
 * pairs, split by colons — AB:CD:…. Whatever separators it arrived with are
 * dropped first. Anything that is not whole bytes of hex is shown as it came,
 * trimmed, rather than dressed up as a fingerprint it is not.
 */
export function formatFingerprint(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const hex = value.replace(/[\s:\-]/g, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return value;
  return (hex.toUpperCase().match(/.{2}/g) ?? []).join(':');
}

/**
 * D.M.YYYY, and HH:MM when the value carries a time. The server writes Israel
 * time, so it is read off the text rather than moved by the browser's clock.
 */
export function formatSigningStamp(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(iso ?? ''));
  if (!match) return '';
  const [, year, month, day, hour, minute] = match;
  const date = `${Number(day)}.${Number(month)}.${year}`;
  return hour !== undefined ? `${date} ${hour}:${minute}` : date;
}

/**
 * This moment as YYYY-MM-DDTHH:MM:SS on the office's own clock — what a mark
 * made on this screen is written as, so it reads like the server's Israel-time
 * values beside it. (toISOString would write UTC, three hours off.)
 */
export function localIsoStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** "1.1.2026 – 31.12.2035", or one side of it, or '' when neither is known. */
export function formatValidity(notBefore: string | null | undefined, notAfter: string | null | undefined): string {
  const from = formatSigningStamp(notBefore).split(' ')[0];
  const to = formatSigningStamp(notAfter).split(' ')[0];
  if (from && to) return `${from} – ${to}`;
  if (from) return `מ-${from}`;
  if (to) return `עד ${to}`;
  return '';
}
