import api from './api';
import { saveBlob } from './documentsApi';
import { readBlobError } from './rentalsApi';
import { unwrapApiList } from './scopedFilters';

/**
 * Tenant billing (the tenant path, phase 4): a tenancy's monthly standing
 * order, the tenant's card for it, and the charges it makes — everything under
 * /rental-billing/. The office's calls need a manager or a partner (a partner
 * reaches their own branches only, anything else is 404); the card page's
 * calls need no login, the token in the link being the whole key.
 *
 * Nothing here charges by itself. The server charges only while
 * RENTAL_BILLING_ENABLED is on, and refuses with 503 whatever would reach
 * Tranzila while it is off. Money arrives as shekel strings ('566.40'); a
 * charge also carries it in whole agorot.
 */

export type StandingOrderStatus = 'pending_card' | 'active' | 'paused' | 'failed' | 'ended';
export type ChargeStatus = 'reserved' | 'charged' | 'failed' | 'review' | 'voided';
export type CardLinkStatus = 'pending' | 'processing' | 'used' | 'cancelled' | 'review';

/** A standing order's newest card link, in whatever state it is. */
export interface CardLinkInfo {
  id: string;
  status: CardLinkStatus | (string & {});
  status_label: string;
  /** The tenant's /rc/<token> page — only while the link can still be used, '' otherwise. */
  url: string;
  expired: boolean;
  expires_at: string | null;
  attempts: number;
  /** Why the last try on this link failed, in the gateway's or the server's words. */
  last_error: string;
  /** Why a try was frozen for the office to check (the outcome was unknown). */
  review_reason: string;
  used_at: string | null;
  created_at: string | null;
}

export interface StandingOrderTenant {
  id: string;
  full_name: string;
  company_number: string;
  id_number: string;
  phone: string;
  email: string;
}

/** The charge that holds an order's charging up, as the order names it. */
export interface BlockedCharge {
  id: string;
  /** 'YYYY-MM-01'. */
  period: string;
  status: ChargeStatus | (string & {});
  status_label: string;
}

export interface StandingOrder {
  id: string;
  tenancy_id: string;
  tenant: StandingOrderTenant;
  branch_id: string | null;
  branch_name: string;
  /** The business its charges are tagged to (סוחרים). */
  business_name: string;
  business_category_name: string;
  /** Shekel strings. */
  amount_before_vat: string;
  vat_amount: string;
  monthly_total: string;
  /** 1–28. */
  billing_day: number;
  start_date: string | null;
  end_date: string | null;
  next_charge_date: string | null;
  /** Typed loosely too: a status this build does not know is shown as the server labels it. */
  status: StandingOrderStatus | (string & {});
  status_label: string;
  /** 'signing' (opened by the signing page) or 'office'. */
  source: string;
  source_label: string;
  last_error: string;
  failed_at: string | null;
  notes: string;
  has_card: boolean;
  card_last4: string;
  /** 'MM/YY'; '' without a card. */
  card_expiry: string;
  card_link: CardLinkInfo | null;
  /**
   * The month waiting for a person to decide. While it is set nothing on this
   * tenancy is charged — not this month and not the next. It clears when a
   * manager marks that month charged or voids it. Optional: only a server that
   * sends it.
   */
  blocked_by_charge?: BlockedCharge | null;
  /**
   * Months before this one that were never charged at all ('YYYY-MM-01').
   * They are never charged automatically. Optional, as above.
   */
  months_never_charged?: string[] | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

/** A charge's receipt (חשבונית מס/קבלה), a document of the documents module. */
export interface ChargeReceipt {
  id: string;
  document_number: string;
  document_date: string;
  /** The server's own path to the file; downloadChargeReceipt fetches it by id instead (see there). */
  pdf_url: string;
  /** Issued after its month had passed — the office settled the charge later. */
  issued_late?: boolean;
}

/** One month of a standing order. */
export interface TenantCharge {
  id: string;
  standing_order_id: string;
  tenancy_id: string;
  tenant_name: string;
  branch_name: string;
  /** 'YYYY-MM-01'. */
  period: string;
  status: ChargeStatus | (string & {});
  status_label: string;
  trigger?: string;
  trigger_label: string;
  attempts: number;
  /** In review, or a reservation that never heard back: waiting for the office's decision. */
  undecided: boolean;
  /** Shekel strings. */
  amount_before_vat: string;
  vat_amount: string;
  total: string;
  amount_before_vat_agorot: number;
  vat_amount_agorot: number;
  total_agorot: number;
  card_last4: string;
  transaction_id: string;
  confirmation_code: string;
  error: string;
  charged_at: string | null;
  receipt: ChargeReceipt | null;
  /** Why the receipt was not issued, when it was not. */
  receipt_error: string;
  /** Charged, and no receipt: the office issues it from the charge. */
  needs_receipt: boolean;
  resolved_by_name: string;
  resolved_at: string | null;
  resolution_note: string;
  created_at?: string;
}

/** What a retry came to: 'charged', 'failed', 'review' (unknown — never retried blind) or 'late'. */
export interface RetryChargeResult {
  outcome: 'charged' | 'failed' | 'review' | 'late' | (string & {});
  charge: TenantCharge;
}

export interface BillingStatus {
  enabled: boolean;
  /** Why it is off, for the office; '' while it is on. */
  message: string;
  /** The business the charges are tagged to (סוחרים), and whether it exists — charging refuses until it does. */
  business_name: string;
  business_found: boolean;
  /** Which terminals the tenants' charges would run on. */
  tranzila: TranzilaTerminals;
}

/** Where a tenant's charge would land. Names only — never a terminal's keys. */
export interface TranzilaTerminals {
  /** 'production', 'rental' (a set of its own for the rentals) or 'mixed'. '' when the server does not say. */
  terminal_set: string;
  /** The terminal a first charge runs on, by name. */
  terminal: string;
  /** The terminal the monthly charge runs on, by name. */
  token_terminal: string;
  /** The settings overridden for the rentals, by name. */
  overridden: string[];
}

export interface StandingOrderCreatePayload {
  tenancy_id: string;
  /** Each defaults to the tenancy's on the server when left out. */
  amount_before_vat?: string;
  billing_day?: number;
  start_date?: string;
  end_date?: string | null;
  notes?: string;
}

/** The only fields the server lets the office change; anything else is a 400. */
export interface StandingOrderUpdatePayload {
  amount_before_vat?: string;
  billing_day?: number;
  end_date?: string | null;
  notes?: string;
}

export interface MarkChargedPayload {
  transaction_id: string;
  confirmation_code?: string;
  note?: string;
}

export interface StandingOrderFilters {
  tenancy?: string;
  /** One status, or several — sent as 'a,b'. */
  status?: string | readonly string[];
  branch?: string;
}

export interface ChargeFilters {
  status?: string | readonly string[];
  branch?: string;
  standing_order?: string;
  tenancy?: string;
  /** 'YYYY-MM'. */
  period?: string;
  needs_receipt?: boolean;
}

const BASE_URL = '/rental-billing/';
const ORDERS_URL = `${BASE_URL}standing-orders/`;
const CHARGES_URL = `${BASE_URL}charges/`;

/**
 * A call that may reach Tranzila, or issue a receipt through it, waits longer
 * than the client's default — cutting it short would leave the office not
 * knowing whether the card was charged.
 */
const GATEWAY_TIMEOUT_MS = 60000;

function orderUrl(id: string): string {
  return `${ORDERS_URL}${encodeURIComponent(id)}/`;
}

function chargeUrl(id: string): string {
  return `${CHARGES_URL}${encodeURIComponent(id)}/`;
}

function statusParam(value: string | readonly string[] | undefined): string {
  const list = typeof value === 'string' ? value.split(',') : [...(value ?? [])];
  return list.map((item) => item.trim()).filter(Boolean).join(',');
}

/** Only what is set goes on the query string, so a blank filter never narrows the list. */
export function standingOrderQueryParams(filters: StandingOrderFilters = {}): Record<string, string> {
  const params: Record<string, string> = {};
  const tenancy = (filters.tenancy ?? '').trim();
  const branch = (filters.branch ?? '').trim();
  const status = statusParam(filters.status);
  if (tenancy) params.tenancy = tenancy;
  if (status) params.status = status;
  if (branch) params.branch = branch;
  return params;
}

export function chargeQueryParams(filters: ChargeFilters = {}): Record<string, string> {
  const params: Record<string, string> = {};
  const status = statusParam(filters.status);
  if (status) params.status = status;
  (['branch', 'standing_order', 'tenancy', 'period'] as const).forEach((key) => {
    const value = (filters[key] ?? '').trim();
    if (value) params[key] = value;
  });
  if (filters.needs_receipt) params.needs_receipt = '1';
  return params;
}

// ---- the switch ----

function readTerminals(raw: unknown): TranzilaTerminals {
  const row = (raw ?? {}) as Partial<TranzilaTerminals>;
  return {
    terminal_set: String(row.terminal_set ?? '').trim(),
    terminal: String(row.terminal ?? '').trim(),
    token_terminal: String(row.token_terminal ?? '').trim(),
    overridden: Array.isArray(row.overridden) ? row.overridden.map((name) => String(name ?? '').trim()).filter(Boolean) : [],
  };
}

/**
 * Whether charging is on. A body that does not say so reads as off: the office
 * is told nothing will be charged rather than promised a charge that will not come.
 */
export async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await api.get(`${BASE_URL}status/`);
  const data = (res.data ?? {}) as Partial<BillingStatus>;
  return {
    enabled: data.enabled === true,
    message: String(data.message ?? '').trim(),
    business_name: String(data.business_name ?? '').trim(),
    business_found: data.business_found !== false,
    tranzila: readTerminals(data.tranzila),
  };
}

// ---- standing orders ----

export async function fetchStandingOrders(filters?: StandingOrderFilters): Promise<StandingOrder[]> {
  const res = await api.get(ORDERS_URL, { params: standingOrderQueryParams(filters) });
  return unwrapApiList<StandingOrder>(res.data);
}

export async function fetchStandingOrder(id: string): Promise<StandingOrder> {
  const res = await api.get(orderUrl(id));
  return res.data;
}

/** Open an order for a tenancy. It starts waiting for the tenant's card (pending_card). */
export async function createStandingOrder(payload: StandingOrderCreatePayload): Promise<StandingOrder> {
  const res = await api.post(ORDERS_URL, payload);
  return res.data;
}

export async function updateStandingOrder(id: string, payload: StandingOrderUpdatePayload): Promise<StandingOrder> {
  const res = await api.patch(orderUrl(id), payload);
  return res.data;
}

/** active → paused. */
export async function pauseStandingOrder(id: string): Promise<StandingOrder> {
  const res = await api.post(`${orderUrl(id)}pause/`, {});
  return res.data;
}

/** paused → active; the months that passed while paused are not charged. */
export async function resumeStandingOrder(id: string): Promise<StandingOrder> {
  const res = await api.post(`${orderUrl(id)}resume/`, {});
  return res.data;
}

/** → ended, for good; a card link waiting for the tenant is cancelled with it. */
export async function endStandingOrder(id: string): Promise<StandingOrder> {
  const res = await api.post(`${orderUrl(id)}end/`, {});
  return res.data;
}

/**
 * A new card link for the tenant, for the office to send itself — nothing is
 * sent from here. The previous URL stops working. 409 while the tenant is in
 * the middle of submitting a card on it; 400 for an order that takes no card.
 */
export async function createCardLink(orderId: string): Promise<CardLinkInfo> {
  const res = await api.post(`${orderUrl(orderId)}card-link/`, {});
  return res.data;
}

// ---- charges ----

/** An order's charges, newest month first. */
export async function fetchOrderCharges(orderId: string): Promise<TenantCharge[]> {
  const res = await api.get(`${orderUrl(orderId)}charges/`);
  return unwrapApiList<TenantCharge>(res.data);
}

/** Across orders, newest 500. */
export async function fetchCharges(filters?: ChargeFilters): Promise<TenantCharge[]> {
  const res = await api.get(CHARGES_URL, { params: chargeQueryParams(filters) });
  return unwrapApiList<TenantCharge>(res.data);
}

export async function fetchCharge(id: string): Promise<TenantCharge> {
  const res = await api.get(chargeUrl(id));
  return res.data;
}

/** Charge a failed month again, now, on the card the order holds. 503 while billing is off. */
export async function retryCharge(id: string): Promise<RetryChargeResult> {
  const res = await api.post(`${chargeUrl(id)}retry/`, {}, { timeout: GATEWAY_TIMEOUT_MS });
  return res.data;
}

/**
 * The office found the charge in Tranzila: a month in review (or a reservation
 * that never heard back) is charged, with the transaction id found there. The
 * server issues its receipt right after, hence the longer wait.
 */
export async function markChargeCharged(id: string, payload: MarkChargedPayload): Promise<TenantCharge> {
  const res = await api.post(`${chargeUrl(id)}mark-charged/`, payload, { timeout: GATEWAY_TIMEOUT_MS });
  return res.data;
}

/** A month in review, or a failed one, is not charged by this order. Final. */
export async function voidCharge(id: string, reason: string): Promise<TenantCharge> {
  const res = await api.post(`${chargeUrl(id)}void/`, { reason });
  return res.data;
}

/** The receipt of a charged month that has none. Issuing twice returns the first. */
export async function issueChargeReceipt(id: string): Promise<TenantCharge> {
  const res = await api.post(`${chargeUrl(id)}issue-receipt/`, {}, { timeout: GATEWAY_TIMEOUT_MS });
  return res.data;
}

/** What no file name may hold, and the direction marks that could make one read as something it is not (contractUtils' rule). */
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|\x00-\x1f\x7f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g;

/** 'קבלה 20012.pdf'. */
export function receiptFileName(receipt: Pick<ChargeReceipt, 'document_number'>): string {
  const number = String(receipt.document_number ?? '').replace(UNSAFE_IN_FILE_NAME, ' ').replace(/\s+/g, ' ').trim();
  return number ? `קבלה ${number}.pdf` : 'קבלה.pdf';
}

/**
 * Save a charge's receipt. It is a document like any other, so it comes from
 * the documents module by its id, as a blob with the office's token — the
 * receipt's pdf_url names the same file, but a plain link would arrive without
 * the token (downloadDocumentPdf's shape). A refusal's words are read back out
 * of the blob.
 */
export async function downloadChargeReceipt(
  receipt: Pick<ChargeReceipt, 'id' | 'document_number'>,
  filename: string = receiptFileName(receipt),
): Promise<void> {
  let data: BlobPart;
  try {
    const res = await api.get(`/documents/documents/${encodeURIComponent(receipt.id)}/pdf/`, { responseType: 'blob' });
    data = res.data;
  } catch (err) {
    throw await readBlobError(err);
  }
  saveBlob(data, 'application/pdf', filename);
}

// ---- the tenant's card page (public) ----

/** What the card page shows before the tenant types anything. */
export interface CardPagePreview {
  /** false while charging is switched off: the page takes no card then. */
  enabled: boolean;
  /** The standing order's status (pending_card, failed …). */
  state: string;
  tenant_name: string;
  branch_name: string;
  /** Shekel strings. */
  amount_before_vat: string;
  vat_amount: string;
  monthly_total: string;
  /** 1–28; null when the server sent none. */
  billing_day: number | null;
  start_date: string | null;
  end_date: string | null;
  expires_at: string | null;
  /** Today's card charges `charge_amount` for `charge_period`; otherwise it is only verified. */
  charge_now: boolean;
  charge_amount: string;
  /** 'YYYY-MM-01'. */
  charge_period: string | null;
  /** The first charge after today's: the next month's when charging now, the first one when verifying. */
  next_charge_date: string | null;
  /** Why this link takes no card right now, in the server's words; '' when it does. */
  error: string;
  /** The office-facing reason charging is off; the page words the off state itself. */
  message: string;
}

export interface CardDetails {
  card_number: string;
  expiry_month: number;
  /** Four digits. */
  expiry_year: number;
  cvv: string;
  card_holder_id: string;
}

export interface CardSubmitResult {
  success: boolean;
  /** The order's status afterwards — 'active' once the card is kept. */
  state: string;
  /** Money moved today (false for a card that was only verified). */
  charged: boolean;
  /** What was charged today, a shekel string ('0.00' for a verify). */
  amount: string;
  next_charge_date: string | null;
}

/** Card entry charges or verifies at Tranzila and records it, so it waits as long as the parents' card link does. */
const CARD_SUBMIT_TIMEOUT_MS = 90000;

function cardPageUrl(token: string): string {
  return `${BASE_URL}card/${encodeURIComponent(token)}/`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function textOrNull(value: unknown): string | null {
  return text(value) || null;
}

function positiveInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The preview as the page uses it: every text a string and every flag a real
 * boolean, whatever the server left out — the tenant should never meet a
 * blank screen because one field was missing. A body that does not say
 * charging is on reads as off, so the page never offers a form the server
 * would refuse.
 */
export function readCardPreview(raw: unknown): CardPagePreview {
  const row = record(raw);
  return {
    enabled: row.enabled === true,
    state: text(row.state),
    tenant_name: text(row.tenant_name),
    branch_name: text(row.branch_name),
    amount_before_vat: text(row.amount_before_vat),
    vat_amount: text(row.vat_amount),
    monthly_total: text(row.monthly_total),
    billing_day: positiveInteger(row.billing_day),
    start_date: textOrNull(row.start_date),
    end_date: textOrNull(row.end_date),
    expires_at: textOrNull(row.expires_at),
    charge_now: row.charge_now === true,
    charge_amount: text(row.charge_amount),
    charge_period: textOrNull(row.charge_period),
    next_charge_date: textOrNull(row.next_charge_date),
    error: text(row.error),
    message: text(row.message),
  };
}

export function readCardSubmitResult(raw: unknown): CardSubmitResult {
  const row = record(raw);
  return {
    success: row.success === true,
    state: text(row.state),
    charged: row.charged === true,
    amount: text(row.amount),
    next_charge_date: textOrNull(row.next_charge_date),
  };
}

/**
 * What the link is for. Refusals come as {success: false, error, processing,
 * already_done, disabled}: 404 unknown, 400 used / cancelled / expired, 409 a
 * try in progress or in review, 503 switched off.
 */
export async function fetchCardPage(token: string): Promise<CardPagePreview> {
  const res = await api.get(cardPageUrl(token));
  return readCardPreview(res.data);
}

/**
 * Store the card — charging the month it owes, or verifying it when the first
 * charge is later. The card goes straight through to Tranzila; the server keeps
 * only its token, expiry and last four digits. Refusals as fetchCardPage's, and
 * 429 when tried too often.
 */
export async function submitCardPage(token: string, card: CardDetails): Promise<CardSubmitResult> {
  const res = await api.post(cardPageUrl(token), { card_details: card }, { timeout: CARD_SUBMIT_TIMEOUT_MS });
  return readCardSubmitResult(res.data);
}
