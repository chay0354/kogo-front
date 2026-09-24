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
/**
 * Why the signed file exists: `original` — the מקור, signed when the document
 * was issued; `archive` — a signed העתק לארכיון of a document issued before
 * signing existed. The archive copy never replaces or alters the original.
 */
export type SignedOriginalPurpose = 'original' | 'archive';

export interface SignedOriginalRow {
  id: string;
  /** The fiscal number, e.g. IR-2026-000123. */
  number: string;
  /** A server that lists no purpose lists originals only, so a row without one is an original. */
  purpose: SignedOriginalPurpose;
  kind: SignedOriginalKind;
  document_type_label: string;
  customer_name: string;
  /** YYYY-MM-DD, or '' when the server sent none. */
  document_date: string;
  /** Null when the server sent no total. */
  total: number | null;
  /** SHA-256 of the stored file, lower-case hex; '' while the row is not signed yet. */
  sha256: string;
  /** The stored file's size in bytes; 0 while the row is not signed yet. */
  size: number;
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

/** What narrows the signed files — the archive's filter, shared by its list and its export. */
export interface SignedOriginalsFilter {
  purpose?: SignedOriginalPurpose | '';
  kind?: SignedOriginalKind | '';
  /** Free text: a document number or a customer name. */
  q?: string;
  /** YYYY-MM-DD, on the document's date. */
  date_from?: string;
  date_to?: string;
}

export interface SignedOriginalsQuery extends SignedOriginalsFilter {
  delivery?: SignedOriginalDelivery;
  /** false: only originals whose one paper print has not been made yet. */
  printed?: boolean;
  limit?: number;
  offset?: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The filter as query parameters — only what narrows, so an empty field is not
 * sent. The list and the export both build their query here, so an export
 * always covers exactly the files the list shows.
 */
export function signedOriginalsFilterParams(filter: SignedOriginalsFilter = {}): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.purpose === 'original' || filter.purpose === 'archive') params.purpose = filter.purpose;
  if (filter.kind === 'ir' || filter.kind === 'store' || filter.kind === 'formal') params.kind = filter.kind;
  const q = String(filter.q ?? '').trim();
  if (q) params.q = q;
  if (filter.date_from && ISO_DAY.test(filter.date_from)) params.date_from = filter.date_from;
  if (filter.date_to && ISO_DAY.test(filter.date_to)) params.date_to = filter.date_to;
  return params;
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
  const total = row.total === null || row.total === undefined || row.total === '' ? NaN : Number(row.total);
  return {
    id: String(row.id),
    number: String(row.number ?? ''),
    purpose: row.purpose === 'archive' ? 'archive' : 'original',
    kind,
    document_type_label: String(row.document_type_label ?? ''),
    customer_name: String(row.customer_name ?? ''),
    document_date: String(row.document_date ?? ''),
    total: Number.isFinite(total) ? total : null,
    sha256: typeof row.sha256 === 'string' ? row.sha256.trim().toLowerCase() : '',
    size: count(row.size),
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
  Object.assign(params, signedOriginalsFilterParams(query));
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

// ── A signed file, exactly as stored (managers) ──────────────────────────────

/**
 * A header off a response, whichever way the client handed the headers over
 * (axios' own object, or a plain record), matched without regard to case.
 * Undefined when it is not there — or when the browser was not allowed to read
 * it: across origins only the headers the server exposes are readable.
 */
export function responseHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === 'function') {
    const value = (getter as (key: string) => unknown).call(headers, name);
    if (value !== undefined && value !== null && typeof value !== 'boolean') return String(value);
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === wanted && value !== undefined && value !== null) return String(value);
  }
  return undefined;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A SHA-256 written as 64 hex digits, lower-cased — or '' for anything else. */
export function normalizeSha256(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toLowerCase();
  return SHA256_HEX.test(value) ? value : '';
}

/** The SHA-256 of the bytes, as hex — or null where the browser offers no digest (an http page). */
export async function sha256Hex(blob: Blob): Promise<string | null> {
  const subtle = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : undefined;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `<number>.pdf`, with the characters no file name may hold replaced. */
export function signedOriginalFilename(number: string | null | undefined): string {
  const name = String(number ?? '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${name || 'מסמך'}.pdf`;
}

export interface SignedOriginalFile {
  pdf: Blob;
  /** The server's X-Content-SHA256, or '' when it sent none (or the browser could not read it). */
  sha256: string;
}

/** Thrown when the bytes that arrived are not the bytes the server says it stored. */
export class SignedFileMismatchError extends Error {
  constructor(message = 'The downloaded file does not match the stored SHA-256') {
    super(message);
    this.name = 'SignedFileMismatchError';
  }
}

/**
 * The stored signed PDF, byte for byte. Asked for as a blob so the request
 * carries the same token as every other; a refusal's body is read back out of
 * its blob before it is thrown, so it reads like any other request's error.
 */
export async function fetchSignedOriginalFile(id: string): Promise<SignedOriginalFile> {
  try {
    const res = await api.get(`/documents/signing/originals/${encodeURIComponent(id)}/file/`, {
      responseType: 'blob',
      timeout: 60000,
    });
    const data = res.data;
    const pdf = typeof Blob !== 'undefined' && data instanceof Blob
      ? data
      : new Blob([data as BlobPart], { type: 'application/pdf' });
    return { pdf, sha256: normalizeSha256(responseHeader(res.headers, 'X-Content-SHA256')) };
  } catch (err) {
    throw await readBlobErrorBody(err);
  }
}

export type SignedFileCheck = 'verified' | 'unchecked';

/**
 * Save one signed file as `<number>.pdf`. Before it is saved, its SHA-256 is
 * checked against the server's header (or, when the header is unreadable,
 * the row's own) — a file that does not match is not saved at all, since a
 * copy that differs by one byte no longer carries a valid signature.
 * `unchecked` when there was nothing to check against, or no digest to check with.
 */
export async function downloadSignedOriginal(
  row: Pick<SignedOriginalRow, 'id' | 'number' | 'sha256'>,
): Promise<{ check: SignedFileCheck }> {
  const file = await fetchSignedOriginalFile(row.id);
  const expected = file.sha256 || normalizeSha256(row.sha256);
  let check: SignedFileCheck = 'unchecked';
  if (expected) {
    const actual = await sha256Hex(file.pdf);
    if (actual !== null) {
      if (actual !== expected) throw new SignedFileMismatchError();
      check = 'verified';
    }
  }
  saveBlob(file.pdf, 'application/pdf', signedOriginalFilename(row.number));
  return { check };
}

// ── The accountant's export: the signed files as ZIP parts (managers) ────────

/** The server puts at most this many files in one ZIP; a longer export comes in parts. */
export const SIGNED_EXPORT_PART_SIZE = 40;

export interface SignedExportPart {
  zip: Blob;
  /** Files in the whole export — X-Export-Total, or the count the caller already had. Null when neither. */
  total: number | null;
  /** Where the next part starts; null when this part was the last. */
  nextOffset: number | null;
}

const wholeNumber = (raw: string | undefined): number | null => {
  const value = String(raw ?? '').trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
};

/**
 * Where an export stands after one part, from the part's headers.
 *
 * X-Export-Next-Offset empty means the export is finished. A next offset that
 * does not move forward is read as finished too — asking for it again would
 * ask for the same part forever. When the header is not readable at all (a
 * server that does not expose it across origins), the next part is worked out
 * from the count: `offset + limit`, until the count is reached.
 */
export function readExportPartHeaders(
  headers: unknown,
  position: { offset: number; limit: number; knownTotal?: number | null },
): { total: number | null; nextOffset: number | null } {
  const headerTotal = wholeNumber(responseHeader(headers, 'X-Export-Total'));
  const known = position.knownTotal;
  const total = headerTotal ?? (typeof known === 'number' && Number.isFinite(known) && known >= 0 ? known : null);
  const nextRaw = responseHeader(headers, 'X-Export-Next-Offset');
  if (nextRaw !== undefined) {
    const next = wholeNumber(nextRaw);
    return { total, nextOffset: next !== null && next > position.offset ? next : null };
  }
  if (total === null) return { total, nextOffset: null };
  const next = position.offset + position.limit;
  return { total, nextOffset: next < total ? next : null };
}

/**
 * One part of the export: the files of the filter from `offset`, zipped. The
 * signal lets the office cancel a part still on its way.
 */
export async function fetchSignedExportPart(
  filter: SignedOriginalsFilter,
  offset: number,
  options: { limit?: number; knownTotal?: number | null; signal?: AbortSignal } = {},
): Promise<SignedExportPart> {
  const limit = options.limit ?? SIGNED_EXPORT_PART_SIZE;
  try {
    const res = await api.get('/documents/signing/originals/export/', {
      params: { ...signedOriginalsFilterParams(filter), offset, limit },
      responseType: 'blob',
      // Forty signed PDFs read out of the database and zipped: longer than a page load.
      timeout: 120000,
      signal: options.signal,
    });
    const data = res.data;
    const zip = typeof Blob !== 'undefined' && data instanceof Blob
      ? data
      : new Blob([data as BlobPart], { type: 'application/zip' });
    return { zip, ...readExportPartHeaders(res.headers, { offset, limit, knownTotal: options.knownTotal }) };
  } catch (err) {
    throw await readBlobErrorBody(err);
  }
}

// ── The archive run: signed copies of documents issued before signing ────────

export interface ArchiveKindStatus {
  kind: string;
  label: string;
  /** Documents of this kind issued before signing, that the archive covers. */
  eligible: number;
  /** Of those, how many already have their signed archive copy. */
  archived: number;
  /** Signed originals of this kind — documents issued since signing began. */
  originals: number;
  remaining: number;
}

export interface ArchiveStatus {
  /** The archive switch on the server. Off, nothing can be run from here. */
  enabled: boolean;
  kinds: ArchiveKindStatus[];
  /** The last archive copy signed. */
  last_signed_at: string | null;
}

/**
 * The archive's status as the screen reads it, or null when the answer is not
 * one (a server without the archive). Counts that are missing or not numbers
 * are 0; `remaining` missing is what the other two leave.
 */
export function readArchiveStatus(data: unknown): ArchiveStatus | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.enabled !== 'boolean') return null;
  const kinds = (Array.isArray(row.kinds) ? row.kinds : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const eligible = count(item.eligible);
      const archived = count(item.archived);
      return {
        kind: String(item.kind ?? ''),
        label: String(item.label ?? ''),
        eligible,
        archived,
        originals: count(item.originals),
        remaining: item.remaining === undefined || item.remaining === null
          ? Math.max(0, eligible - archived)
          : count(item.remaining),
      };
    });
  return { enabled: row.enabled, kinds, last_signed_at: text(row.last_signed_at) };
}

export async function fetchArchiveStatus(): Promise<ArchiveStatus | null> {
  const res = await api.get('/documents/signing/archive/status/');
  return readArchiveStatus(res.data);
}

/** The server signs at most this many archive copies in one call. */
export const ARCHIVE_RUN_MAX_LIMIT = 50;

export interface ArchiveRunFailure {
  number: string;
  error: string;
}

export interface ArchiveRunBatch {
  signed: number;
  skipped: number;
  failed: ArchiveRunFailure[];
  /** Documents still without an archive copy, after this batch. */
  remaining: number;
  done: boolean;
}

export type ArchiveRunResult =
  | { outcome: 'ran'; batch: ArchiveRunBatch }
  /** 409 — the archive switch is off on the server. */
  | { outcome: 'off'; message: string }
  /** 503 — the signing key could not be reached; nothing in the batch was signed. */
  | { outcome: 'unavailable'; message: string };

export function readArchiveRunBatch(data: unknown): ArchiveRunBatch {
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const failed = (Array.isArray(row.failed) ? row.failed : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({ number: String(item.number ?? ''), error: String(item.error ?? '') }));
  return {
    signed: count(row.signed),
    skipped: count(row.skipped),
    failed,
    remaining: count(row.remaining),
    done: row.done === true,
  };
}

/**
 * Sign one batch of archive copies. The server skips a document that already
 * has one, so a batch asked again — after a lost answer, say — never signs a
 * document twice. 409 and 503 are answers, not failures, and come back as
 * such with the server's sentence; any other refusal is thrown.
 */
export async function runArchiveBatch(options: { limit?: number; since?: string } = {}): Promise<ArchiveRunResult> {
  const body: { limit?: number; since?: string } = {};
  if (options.limit !== undefined) {
    const limit = Math.floor(Number(options.limit));
    body.limit = Math.min(ARCHIVE_RUN_MAX_LIMIT, Math.max(1, Number.isFinite(limit) ? limit : ARCHIVE_RUN_MAX_LIMIT));
  }
  if (options.since && ISO_DAY.test(options.since)) body.since = options.since;
  try {
    // Every copy is drawn and signed through the key: a batch takes a while.
    const res = await api.post('/documents/signing/archive/run/', body, { timeout: 120000 });
    return { outcome: 'ran', batch: readArchiveRunBatch(res.data) };
  } catch (err) {
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    if (status === 409) return { outcome: 'off', message: errorSentence(err) };
    if (status === 503) return { outcome: 'unavailable', message: errorSentence(err) };
    throw err;
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
