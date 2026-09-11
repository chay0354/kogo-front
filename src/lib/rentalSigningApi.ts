import api from './api';
import { signatureParagraphs } from './signatureUtils';

/**
 * The tenant's side of a rental contract (the tenant path, phase 3): the
 * public page at /s/<token> shows the version sent for signing and signs it.
 * There is no login — the token in the link is the whole key — so every call
 * here lives under /rentals/sign/<token>/, and nothing here is the office's.
 */

export type SigningState = 'open' | 'signed' | 'expired' | 'cancelled';

export interface SigningTenant {
  name: string;
  id_number: string;
  phone: string;
  email: string;
}

export interface SigningStudio {
  name: string;
  company_number: string;
  phone: string;
  email: string;
}

/** One calendar slot the contract covers, worded by the server. Money as decimal strings, before VAT. */
export interface SigningSlot {
  label: string;
  weekday_or_date: string;
  hours: string;
  rate: string;
  monthly: string;
}

export interface SigningContract {
  /** Typed loosely too: a state this build does not know is read as a link that cannot be used. */
  state: SigningState | (string & {});
  /** 0 when the server sent none. */
  version: number;
  tenant: SigningTenant;
  branch_name: string;
  studio: SigningStudio;
  slots: SigningSlot[];
  /** Decimal strings. */
  monthly_amount: string;
  vat_rate: string;
  vat_amount: string;
  monthly_total: string;
  /** 1–28; null when the server sent none. */
  billing_day: number | null;
  start_date: string | null;
  end_date: string | null;
  /** The text frozen into the version, one plain-text paragraph each. Never HTML. */
  document: string[];
  signed_at: string | null;
  signer_name: string;
}

export interface SignaturePayload {
  signer_name: string;
  signer_id_number: string;
  /** A PNG data URL of the drawn signature. */
  signature: string;
  accept: true;
}

export interface SignatureResult {
  state: 'signed';
  signed_at: string | null;
  /** Kept as the server sent it; the page opens the signed copy by signingPdfUrl (see there). */
  pdf_url: string | null;
}

/** Signing renders the signed PDF on the server, so it gets longer than the client's default wait. */
const SIGN_TIMEOUT_MS = 60000;

function signUrl(token: string): string {
  return `/rentals/sign/${encodeURIComponent(token)}/`;
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function textOrNull(value: unknown): string | null {
  return text(value) || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function positiveInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The contract as the page uses it: every list safe to iterate and every text
 * a string, whatever the server left out — the tenant should never meet a
 * blank screen because one field was missing.
 */
export function readSigningContract(raw: unknown): SigningContract {
  const row = record(raw);
  const tenant = record(row.tenant);
  const studio = record(row.studio);
  return {
    state: text(row.state),
    version: positiveInteger(row.version) ?? 0,
    tenant: {
      name: text(tenant.name),
      id_number: text(tenant.id_number),
      phone: text(tenant.phone),
      email: text(tenant.email),
    },
    branch_name: text(row.branch_name),
    studio: {
      name: text(studio.name),
      company_number: text(studio.company_number),
      phone: text(studio.phone),
      email: text(studio.email),
    },
    slots: (Array.isArray(row.slots) ? row.slots : []).map((item) => {
      const slot = record(item);
      return {
        label: text(slot.label),
        weekday_or_date: text(slot.weekday_or_date),
        hours: text(slot.hours),
        rate: text(slot.rate),
        monthly: text(slot.monthly),
      };
    }),
    monthly_amount: text(row.monthly_amount),
    vat_rate: text(row.vat_rate),
    vat_amount: text(row.vat_amount),
    monthly_total: text(row.monthly_total),
    billing_day: positiveInteger(row.billing_day),
    start_date: textOrNull(row.start_date),
    end_date: textOrNull(row.end_date),
    document: signatureParagraphs(row.document),
    signed_at: textOrNull(row.signed_at),
    signer_name: text(row.signer_name),
  };
}

/** The version sent for signing. 404 with an `error` for a token the server does not know. */
export async function fetchSigningContract(token: string): Promise<SigningContract> {
  const res = await api.get(signUrl(token));
  return readSigningContract(res.data);
}

/**
 * Sign. Refusals come back with a Hebrew `error`: 400 bad input, 409 already
 * signed or the contract changed, 410 the link expired or was cancelled.
 */
export async function submitContractSignature(token: string, payload: SignaturePayload): Promise<SignatureResult> {
  const res = await api.post(signUrl(token), payload, { timeout: SIGN_TIMEOUT_MS });
  const data = record(res.data);
  return { state: 'signed', signed_at: textOrNull(data.signed_at), pdf_url: textOrNull(data.pdf_url) };
}

/**
 * Where the contract's PDF opens: a plain link rather than a blob download.
 * The tenant is on a phone inside WhatsApp, whose browser ignores a download a
 * script starts but opens a PDF link in its viewer, and the file needs no
 * login. Once the version is signed the same address serves the signed copy;
 * `signed` changes the address, so a copy the phone kept from before signing
 * is never shown in its place.
 */
export function signingPdfUrl(token: string, { signed = false }: { signed?: boolean } = {}): string {
  return api.getUri({ url: `${signUrl(token)}pdf/`, params: signed ? { copy: 'signed' } : undefined });
}
