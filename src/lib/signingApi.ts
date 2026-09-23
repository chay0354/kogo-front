import api from './api';
import { saveBlob } from './documentsApi';
import {
  readComputerizedDocsConsent,
  type ComputerizedDocsConsent,
} from '@/components/dialogs/computerizedDocsConsent';

/**
 * The secured electronic signature on the fiscal documents (הוראה 18ב):
 * whether it is on, the originals the office still has to hand over on paper,
 * the one print of such an original, the public certificate, and a business
 * customer's consent to receive documents by email (18ב(ג)).
 *
 * Every screen that uses this stays exactly as it was while `enabled` is false
 * — the server keeps sending documents the way it always has until then.
 */

// ── Status (managers) ────────────────────────────────────────────────────────

export type SigningBackend = 'gcp_kms' | 'local' | 'none';

export interface SigningCounts {
  /** Waiting for a signature, or (when enforced) for the customer's consent. */
  held: number;
  /** Paid in cash or by an uncrossed check, and the original not printed yet. */
  paper_pending: number;
  signed_today: number;
}

export interface SigningStatus {
  enabled: boolean;
  consent_enforced: boolean;
  backend: SigningBackend;
  key_id: string | null;
  cert_fingerprint: string | null;
  cert_subject: string | null;
  last_signed_at: string | null;
  counts: SigningCounts;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * The status as the screens read it, or null when the answer is not one — a
 * server without the feature, say. Null is read everywhere as "off", so a
 * screen never shows the new parts on an answer it cannot trust.
 */
export function readSigningStatus(data: unknown): SigningStatus | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.enabled !== 'boolean') return null;
  const backend = row.backend === 'gcp_kms' || row.backend === 'local' ? row.backend : 'none';
  const counts = (row.counts && typeof row.counts === 'object' ? row.counts : {}) as Record<string, unknown>;
  return {
    enabled: row.enabled,
    consent_enforced: row.consent_enforced === true,
    backend,
    key_id: text(row.key_id),
    cert_fingerprint: text(row.cert_fingerprint),
    cert_subject: text(row.cert_subject),
    last_signed_at: text(row.last_signed_at),
    counts: {
      held: count(counts.held),
      paper_pending: count(counts.paper_pending),
      signed_today: count(counts.signed_today),
    },
  };
}

export async function fetchSigningStatus(): Promise<SigningStatus | null> {
  const res = await api.get('/documents/signing/status/');
  return readSigningStatus(res.data);
}

// ── Signed originals (managers) ──────────────────────────────────────────────

export type SignedOriginalKind = 'ir' | 'store' | 'formal';
export type SignedOriginalDelivery = 'email' | 'paper' | 'held' | 'none';

export interface SignedOriginalRow {
  id: string;
  /** The fiscal number, e.g. IR-2026-000123. */
  number: string;
  kind: SignedOriginalKind;
  document_type_label: string;
  customer_name: string;
  document_date: string;
  total: number;
  delivery: SignedOriginalDelivery;
  /** Why it is delivered this way, in the server's words. */
  delivery_reason: string;
  signed_at: string | null;
  sent_at: string | null;
  paper_original_printed_at: string | null;
}

export interface SignedOriginalsPage {
  count: number;
  results: SignedOriginalRow[];
}

export interface SignedOriginalsQuery {
  delivery?: SignedOriginalDelivery;
  /** false: only originals whose one paper print has not been made yet. */
  printed?: boolean;
  limit?: number;
  offset?: number;
}

/** A row off the wire. A total can arrive as a decimal string; it is read as a number. */
export function readSignedOriginal(data: unknown): SignedOriginalRow | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.id === undefined || row.id === null) return null;
  const kind = row.kind === 'ir' || row.kind === 'store' ? row.kind : 'formal';
  const delivery = row.delivery === 'email' || row.delivery === 'paper' || row.delivery === 'held'
    ? row.delivery
    : 'none';
  const total = Number(row.total);
  return {
    id: String(row.id),
    number: String(row.number ?? ''),
    kind,
    document_type_label: String(row.document_type_label ?? ''),
    customer_name: String(row.customer_name ?? ''),
    document_date: String(row.document_date ?? ''),
    total: Number.isFinite(total) ? total : 0,
    delivery,
    delivery_reason: String(row.delivery_reason ?? ''),
    signed_at: text(row.signed_at),
    sent_at: text(row.sent_at),
    paper_original_printed_at: text(row.paper_original_printed_at),
  };
}

export async function fetchSignedOriginals(query: SignedOriginalsQuery = {}): Promise<SignedOriginalsPage> {
  const params: Record<string, string | number> = {};
  if (query.delivery) params.delivery = query.delivery;
  if (query.printed !== undefined) params.printed = query.printed ? 'true' : 'false';
  if (query.limit !== undefined) params.limit = query.limit;
  if (query.offset !== undefined) params.offset = query.offset;
  const res = await api.get('/documents/signing/originals/', { params });
  const data = (res.data ?? {}) as { count?: unknown; results?: unknown };
  const results = (Array.isArray(data.results) ? data.results : [])
    .map(readSignedOriginal)
    .filter((row): row is SignedOriginalRow => row !== null);
  const total = Number(data.count);
  return { count: Number.isFinite(total) ? total : results.length, results };
}

// ── The one print of a paper original ────────────────────────────────────────

/** What the office reads when the server refuses a second print without saying why. */
export const ORIGINAL_ALREADY_PRINTED_MESSAGE = 'המקור כבר הודפס — כל הדפסה נוספת היא העתק';

export type PrintOriginalResult =
  | { outcome: 'printed'; pdf: Blob }
  | { outcome: 'already_printed'; message: string };

/**
 * A refusal to a request made for a blob arrives as a Blob too. Read it back
 * into what the server said — its JSON, or its text — so the error reads like
 * every other request's. Anything that is not such a refusal passes as it came.
 */
export async function readBlobErrorBody(err: unknown): Promise<unknown> {
  const response = (err as { response?: { data?: unknown } } | null)?.response;
  const body = response?.data;
  if (!response || typeof Blob === 'undefined' || !(body instanceof Blob)) return err;
  try {
    const raw = (await body.text()).trim();
    try {
      response.data = raw ? JSON.parse(raw) : '';
    } catch {
      response.data = raw;
    }
  } catch {
    // Unreadable — the caller's own message covers it.
  }
  return err;
}

/** The server's own sentence out of an error (already read back from a blob), or ''. */
export function errorSentence(err: unknown): string {
  const data = (err as { response?: { data?: unknown } } | null)?.response?.data;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['error', 'detail']) {
      if (typeof record[key] === 'string' && (record[key] as string).trim()) return (record[key] as string).trim();
    }
  }
  // Plain text is the server talking; an HTML error page is not worth showing.
  if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) return data.trim();
  return '';
}

/**
 * Print the original of a document delivered on paper — once. The first call
 * answers with the stored, signed PDF and the server records the print; every
 * call after that is refused with 409, because any further print is a copy.
 * A 409 is an answer, not a failure, so it comes back as `already_printed`
 * with the server's sentence. Any other refusal is thrown, its body readable.
 */
export async function printOriginal(id: string): Promise<PrintOriginalResult> {
  try {
    const res = await api.post(
      `/documents/signing/originals/${encodeURIComponent(id)}/print-original/`,
      {},
      { responseType: 'blob', timeout: 60000 },
    );
    const data = res.data;
    const pdf = typeof Blob !== 'undefined' && data instanceof Blob
      ? data
      : new Blob([data as BlobPart], { type: 'application/pdf' });
    return { outcome: 'printed', pdf };
  } catch (err) {
    const read = await readBlobErrorBody(err);
    const status = (read as { response?: { status?: number } } | null)?.response?.status;
    if (status === 409) {
      return { outcome: 'already_printed', message: errorSentence(read) || ORIGINAL_ALREADY_PRINTED_MESSAGE };
    }
    throw read;
  }
}

// ── The public certificate (no account) ──────────────────────────────────────

export interface SigningCertificate {
  configured: boolean;
  pem: string | null;
  fingerprint_sha256: string | null;
  subject: string | null;
  not_before: string | null;
  not_after: string | null;
}

export function readSigningCertificate(data: unknown): SigningCertificate {
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const pem = text(row.pem);
  return {
    // Configured means there is something to show; a flag without a certificate is not.
    configured: row.configured === true && pem !== null,
    pem,
    fingerprint_sha256: text(row.fingerprint_sha256),
    subject: text(row.subject),
    not_before: text(row.not_before),
    not_after: text(row.not_after),
  };
}

export async function fetchSigningCertificate(): Promise<SigningCertificate> {
  const res = await api.get('/documents/signing/certificate/');
  return readSigningCertificate(res.data);
}

export const SIGNING_CERTIFICATE_FILENAME = 'cogomelo-signing-certificate.pem';

/** Hand the visitor the certificate as a .pem file. */
export function downloadCertificatePem(pem: string, filename = SIGNING_CERTIFICATE_FILENAME): void {
  const body = pem.endsWith('\n') ? pem : `${pem}\n`;
  saveBlob(body, 'application/x-pem-file', filename);
}

// ── A business customer's consent to computerized documents (18ב(ג)) ─────────

function businessCustomerUrl(id: string): string {
  return `/customers/business-customers/${encodeURIComponent(id)}/`;
}

/**
 * The customer's consent fields, read afresh from its own record. Null when
 * the record carries none — a server without them — and the screen then says
 * nothing rather than "no consent".
 */
export async function fetchBusinessCustomerConsent(id: string): Promise<ComputerizedDocsConsent | null> {
  const res = await api.get(businessCustomerUrl(id));
  return readComputerizedDocsConsent(res.data);
}

/** Record (true) or withdraw (false) the customer's consent, as the office records it. */
export async function setBusinessCustomerConsent(
  id: string,
  consent: boolean,
): Promise<ComputerizedDocsConsent | null> {
  const res = await api.post(`${businessCustomerUrl(id)}computerized-consent/`, { consent });
  return readComputerizedDocsConsent(res.data);
}
