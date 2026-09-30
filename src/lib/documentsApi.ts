import api from './api';
import type {
  FormalDocument,
  FormalDocumentSummary,
  CreateDocumentPayload,
} from '@/types/document';
import type { LedgerDimensions, PaymentLedgerItem } from '@/app/(crm)/invoices/types';
import {
  readInvoiceBalance,
  readOpenInvoices,
  type InvoiceBalance,
  type OpenInvoicesAnswer,
  type PayerType,
} from './settlements';
import type { CreditRoom } from './draftsAndCredits';

export async function createDocument(payload: CreateDocumentPayload): Promise<FormalDocument> {
  const res = await api.post('/documents/documents/create-document/', payload);
  return res.data;
}

export async function fetchDocuments(params?: {
  document_type?: string;
  child_id?: string;
  business_customer_id?: string;
  exclude_credits?: boolean;
  search?: string;
}): Promise<FormalDocumentSummary[]> {
  const res = await api.get('/documents/documents/', { params });
  return Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
}

export async function fetchTranzilaDocuments(params?: {
  start_date?: string;
  end_date?: string;
  local_only?: string;
}): Promise<{
  documents: Array<{
    id: string;
    document_number: string;
    issue_date: string;
    customer_name: string;
    document_type: string;
    document_type_code?: string;
    total_amount: number;
    amount_paid: number;
    open_balance: number;
    status: string;
    pdf_url?: string;
    store_invoice_id?: string;
    tranzila_issued?: boolean;
    is_draft?: boolean;
    allocation_number?: string;
    allocation_required?: boolean;
    tranzila_doc_id?: string;
    source?: string;
    branch?: string;
    branch_id?: string | null;
    /** WS-3: what credit notes took off an invoice; 0 elsewhere. Absent on an older server. */
    credited_amount?: number;
    /** WS-3: the part of a receipt that paid an invoice listed on its own row. */
    applied_amount?: number;
  }>;
  source: string;
  error?: string | null;
}> {
  const res = await api.get('/documents/documents/tranzila/', {
    params,
    timeout: 90000,
  });
  return res.data;
}

export async function fetchTranzilaTransactions(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<{
  payments: Array<{
    id: string;
    created_at: string;
    customer_name: string;
    invoice_number: string;
    amount: number;
    payment_method: string;
    transaction_reference: string;
    status: string;
    card_last4?: string;
    source?: string;
  }>;
  source: string;
  error?: string | null;
}> {
  const res = await api.get('/customers/payments/tranzila-transactions/', {
    params,
    timeout: 90000,
  });
  return res.data;
}

export const PAYMENTS_PAGE_SIZE = 20;

export async function fetchPaymentLedger(params?: {
  page?: number;
  page_size?: number;
  start_date?: string;
  end_date?: string;
  search?: string;
  status?: string;
  kind?: string;
  branch?: string;
  /** 'branches' (courses with no business of their own), 'store' (no CRM charges), or a business id. */
  business?: string;
  city?: string;
  course_type?: string;
  instructor?: string;
  /** The course's age key: '6-9', '6-', '-9'. */
  age?: string;
  /**
   * Ask for dimension_options too: every course type, age group and instructor
   * among the charges in the range, before the search and the filters — the
   * filter bar's choices. The page request asks; a count has no use for them.
   */
  with_options?: boolean;
}): Promise<{
  results: PaymentLedgerItem[];
  count: number;
  month_total: number;
  pending_count: number;
  /**
   * One dimension each — {course_type_id, course_type_name}, {age_key,
   * age_label} or {instructor_id, instructor_name}. Empty unless asked for.
   */
  dimension_options: LedgerDimensions[];
}> {
  const { with_options: withOptions, ...query } = params ?? {};
  const res = await api.get('/customers/payments/ledger/', {
    params: {
      page: 1,
      page_size: PAYMENTS_PAGE_SIZE,
      ordering: '-created_at',
      ...query,
      ...(withOptions ? { with_options: 1 } : {}),
    },
    timeout: 15000,
  });
  const data = res.data;
  if (Array.isArray(data)) {
    return {
      results: data,
      count: data.length,
      month_total: 0,
      pending_count: 0,
      dimension_options: [],
    };
  }
  return {
    results: Array.isArray(data?.results) ? data.results : [],
    count: Number(data?.count ?? 0),
    month_total: Number(data?.month_total ?? 0),
    pending_count: Number(data?.pending_count ?? 0),
    dimension_options: Array.isArray(data?.dimension_options) ? data.dimension_options : [],
  };
}

export async function fetchDocument(id: string): Promise<FormalDocument> {
  const res = await api.get(`/documents/documents/${id}/`);
  return res.data;
}

/**
 * The customer's invoices a `payerType` document can close that still owe
 * something, oldest first: tax invoices for a receipt, transaction invoices
 * for an invoice-receipt. A server from before settlements answers 404 — the
 * caller falls back to the older form.
 */
export async function fetchOpenInvoices(params: {
  childId?: string | null;
  businessCustomerId?: string | null;
  payerType: PayerType;
}): Promise<OpenInvoicesAnswer> {
  const res = await api.get('/documents/documents/open-invoices/', {
    params: {
      ...(params.childId ? { child_id: params.childId } : {}),
      ...(!params.childId && params.businessCustomerId ? { business_customer_id: params.businessCustomerId } : {}),
      payer_type: params.payerType,
    },
  });
  return readOpenInvoices(res.data, params.payerType);
}

export interface VoidSettlementAnswer {
  id: string;
  payer_number: string;
  invoice_number: string;
  amount: string;
  voided_at: string | null;
  /** The invoice's balance after the void — it opens again by the amount. */
  invoice_balance: InvoiceBalance | null;
}

/**
 * Void a settlement recorded by mistake (managers only). The row is kept with
 * who voided it and when; the invoice opens again. The reason is required —
 * the server refuses without one (400) and refuses a second void (409).
 */
export async function voidSettlement(id: string, reason: string): Promise<VoidSettlementAnswer> {
  const res = await api.post(`/documents/settlements/${encodeURIComponent(id)}/void/`, { reason });
  const data = (res.data ?? {}) as Record<string, unknown>;
  return {
    id: String(data.id ?? id),
    payer_number: String(data.payer_number ?? ''),
    invoice_number: String(data.invoice_number ?? ''),
    amount: String(data.amount ?? '0.00'),
    voided_at: data.voided_at ? String(data.voided_at) : null,
    invoice_balance: readInvoiceBalance(data.invoice_balance),
  };
}

export async function sendDocumentReminder(id: string): Promise<{ sent: boolean }> {
  const res = await api.post(`/documents/documents/${id}/send-reminder/`);
  return res.data;
}

/**
 * Every document in a period as one PDF, grouped by branch or by business.
 *
 * Fetched as a blob rather than opened by URL: the file sits behind the same
 * token every other request carries, and a plain window.open would arrive
 * without it. Same shape as the store's invoice download.
 */
export async function downloadPeriodReport(params: {
  start_date: string;
  end_date: string;
  group_by: 'branch' | 'business' | 'business_unit' | 'business_category';
  document_type?: string;
}): Promise<void> {
  const res = await api.get('/documents/documents/period-report/', {
    params: { ...params, document_type: params.document_type || undefined },
    responseType: 'blob',
  });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `invoices-${params.start_date}-${params.end_date}-${params.group_by}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

/** Hand the browser a file fetched as a blob, under a name of our choosing. Shared by signaturesApi and rentalsApi. */
export function saveBlob(data: BlobPart, type: string, filename: string): void {
  const blobUrl = window.URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

/**
 * Every document in the range — issued by hand, lesson receipts, store sales —
 * one row each, as a CSV the accountant opens in Excel: the period report's
 * rows, and the numbers that never became a document.
 */
export async function downloadDocumentsRegister(params: { start_date: string; end_date: string }): Promise<void> {
  const res = await api.get('/documents/documents/register-export/', { params, responseType: 'blob' });
  saveBlob(res.data, 'text/csv;charset=utf-8', `documents-${params.start_date}-${params.end_date}.csv`);
}

/**
 * The same documents in the Tax Authority's uniform structure (מבנה אחיד):
 * INI.TXT and BKMVDATA.TXT in their folder, zipped. One tax year at a time.
 */
export async function downloadUniformExport(params: { start_date: string; end_date: string }): Promise<void> {
  const res = await api.get('/documents/documents/uniform-export/', { params, responseType: 'blob' });
  saveBlob(res.data, 'application/zip', `uniform-${params.start_date}-${params.end_date}.zip`);
}

// ---------------------------------------------------------------- missing receipts

/** What the server wants typed before it issues — it checks the word itself. */
export const MISSING_RECEIPTS_CONFIRM_WORD = 'הפק';

/** The server refuses more than this in one request; a longer list is issued in rounds. */
export const MISSING_RECEIPTS_MAX_BATCH = 100;

/** A document issued by hand for the same family and sum near the charge — maybe its receipt already. */
export interface PossibleManualDocument {
  number: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Two decimals, as a string. */
  amount: string;
}

/** A completed charge that never got its חשבונית מס/קבלה, as /documents/missing-receipts/ lists it. */
export interface MissingReceiptRow {
  payment_id: string;
  /** When the money came in, ISO, local time. */
  paid_at: string;
  family_name: string;
  child_name: string;
  description: string;
  /** Two decimals, as a string. */
  amount: string;
  channel: 'trial' | 'registration' | 'card_link' | 'standing_order' | 'one_time' | string;
  channel_label: string;
  /** What the receipt will record: 'credit_card', or '' when the charge did not go through Tranzila. */
  method: string;
  method_label: string;
  /** Set when a hand-issued document may already cover this charge; such a row starts unticked. */
  possible_manual_document?: PossibleManualDocument | null;
}

/** One number run of the year, checked for numbers no document carries. */
export interface SeriesRunCheck {
  series: string;
  year: number;
  name: string;
  label: string;
  issued: number;
  first: string;
  last: string;
  missing: string[];
  complete: boolean;
  /** The run's first number: above 1 when it continues the previous software's run. Older servers omit it. */
  start?: number;
  previous_type_label?: string;
  previous_last_number?: number | null;
  /** 'ממשיך את הסדרה של התוכנה הקודמת (אחרון 40413)', or '' for a run that starts at 1. */
  continues?: string;
}

export interface MissingReceiptsReport {
  year: number;
  count: number;
  /** Two decimals, as a string. */
  total: string;
  /** The number the next receipt would take — dated today, so from this year's IR run. */
  next_number: string;
  rows: MissingReceiptRow[];
  continuity: SeriesRunCheck[];
}

export interface IssueMissingReceiptsResult {
  issued: Array<{ payment_id: string; number: string }>;
  /** Not missing any more (a receipt was issued meanwhile), not found, or not a completed charge. */
  skipped: Array<{ payment_id: string; reason: string; message: string }>;
  /** The message is for the office; the error itself is only in the server's log. */
  failed: Array<{ payment_id: string; message: string }>;
}

/** The charges of a year that never got their receipt — the same list `check_invoices` finds. */
export async function fetchMissingReceipts(year: number): Promise<MissingReceiptsReport> {
  const res = await api.get('/documents/missing-receipts/', { params: { year }, timeout: 60000 });
  const data = res.data ?? {};
  return {
    year: Number(data.year ?? year),
    count: Number(data.count ?? 0),
    total: String(data.total ?? '0.00'),
    next_number: String(data.next_number ?? ''),
    rows: Array.isArray(data.rows) ? data.rows : [],
    continuity: Array.isArray(data.continuity) ? data.continuity : [],
  };
}

/** The IR number issuing would start from right now — read as the confirmation opens, so it is not stale. */
export async function fetchMissingReceiptsNextNumber(): Promise<string> {
  const res = await api.get('/documents/missing-receipts/next-number/');
  return String(res.data?.next_number ?? '');
}

/** The same list as a CSV for the accountant to approve, before anything is issued. */
export async function downloadMissingReceiptsCsv(year: number): Promise<void> {
  const res = await api.get('/documents/missing-receipts/export/', { params: { year }, responseType: 'blob' });
  saveBlob(res.data, 'text/csv;charset=utf-8', `missing-receipts-${year}.csv`);
}

/**
 * Issue the receipts, exactly as `check_invoices --fix` does: dated today,
 * marked late, not mailed. `confirm` is what the user typed; the server
 * refuses anything but the word.
 */
export async function issueMissingReceipts(
  paymentIds: string[],
  confirm: string,
): Promise<IssueMissingReceiptsResult> {
  const res = await api.post(
    '/documents/missing-receipts/issue/',
    { payment_ids: paymentIds, confirm },
    // Each receipt is a few writes; a long backlog takes longer than a page load.
    { timeout: 120000 },
  );
  const data = res.data ?? {};
  return {
    issued: Array.isArray(data.issued) ? data.issued : [],
    skipped: Array.isArray(data.skipped) ? data.skipped : [],
    failed: Array.isArray(data.failed) ? data.failed : [],
  };
}

export interface CheckItemRow {
  id: string;
  due_date: string;
  amount: number | string;
  bank: string;
  bank_branch: string;
  account_number: string;
  check_number: string;
  status: 'pending' | 'invoiced' | 'cancelled' | string;
  tax_invoice: string | null;
  tax_invoice_number: string | null;
  invoiced_at: string | null;
  // WS-3 (30.9.2026) — absent on an older server.
  /** The tax invoice's own date: the day it was issued, on or after the check's. */
  tax_invoice_date?: string | null;
  /** When the check came back unpaid. */
  bounced_at?: string | null;
  /** The credit note that took back a bounced check's invoice. */
  credit_note?: string | null;
  credit_note_number?: string | null;
  /** The replacement check (an item of its own plan) and that plan. */
  replaced_by?: string | null;
  replaced_by_plan?: string | null;
}

/**
 * A check plan as /documents/check-plans/ sends it: the plan and its checks,
 * with the ledger dimensions of its lesson (business, city, course type, age
 * group, instructor — empty without a lesson) and its branch_id, as every row
 * of the invoices page carries them.
 */
export interface CheckPlanRow extends LedgerDimensions {
  id: string;
  child: string;
  child_name: string;
  lesson: string | null;
  lesson_name: string | null;
  description: string;
  status: 'active' | 'completed' | 'cancelled' | string;
  receipt: string | null;
  receipt_number: string | null;
  branch: string | null;
  branch_name: string | null;
  items: CheckItemRow[];
  total_amount: number | string;
  next_due_date: string | null;
  created_at: string;
  // WS-3 (30.9.2026) — absent on an older server.
  cancelled_at?: string | null;
  cancelled_by_name?: string;
}

export async function fetchCheckPlans(params?: {
  search?: string;
  status?: string;
  branch?: string;
}): Promise<CheckPlanRow[]> {
  const res = await api.get('/documents/check-plans/', { params });
  return Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
}

export async function createCheckPlan(payload: {
  child_id: string;
  lesson_id?: string | null;
  description?: string;
  checks: Array<{
    date: string;
    bank: string;
    branch: string;
    account_number: string;
    check_number: string;
    amount: number;
  }>;
}): Promise<CheckPlanRow> {
  const res = await api.post('/documents/check-plans/', payload);
  return res.data;
}

/**
 * Stop a plan: its checks still ahead are cancelled (no invoice for them),
 * and an invoice already issued that nothing paid is credited — a credit note
 * that is signed and emailed to the customer. Normally there is none: each
 * invoice is paid by its check. `credit_notes` lists what was issued (an
 * older server sends the plan alone).
 */
export async function cancelCheckPlan(
  id: string,
  reason = '',
): Promise<{ plan: CheckPlanRow; credit_notes: string[] }> {
  const res = await api.post(`/documents/check-plans/${id}/cancel/`, reason.trim() ? { reason: reason.trim() } : {});
  const data = (res.data ?? {}) as CheckPlanRow & { credit_notes?: unknown };
  const { credit_notes: notes, ...plan } = data;
  return {
    plan: plan as CheckPlanRow,
    credit_notes: Array.isArray(notes) ? notes.map(String).filter(Boolean) : [],
  };
}

/** A check that replaces one that came back: registered as a plan of its own. */
export interface ReplacementCheckInput {
  date: string;
  amount: number;
  bank: string;
  branch: string;
  account_number: string;
  check_number: string;
  check_crossed: boolean;
}

export interface BounceCheckAnswer {
  plan: CheckPlanRow;
  item_id: string;
  /** The credit note of the check's invoice, when one was issued; it is signed and emailed to the customer. */
  credit_note_number: string | null;
  /** The replacement check's own plan (its own receipt now, its own invoice on its day). */
  replacement_plan: CheckPlanRow | null;
}

/**
 * A check came back unpaid. If its tax invoice was issued, the invoice is
 * credited (a credit note, emailed to the customer); if not, the check is
 * cancelled and no invoice will follow. 404 for another plan's check, 409 when
 * it was marked already.
 */
export async function bounceCheck(
  planId: string,
  input: { item_id: string; reason?: string; replacement?: ReplacementCheckInput | null },
): Promise<BounceCheckAnswer> {
  const res = await api.post(`/documents/check-plans/${planId}/bounce/`, {
    item_id: input.item_id,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    ...(input.replacement ? { replacement: input.replacement } : {}),
  });
  const data = (res.data ?? {}) as Record<string, unknown>;
  return {
    plan: data.plan as CheckPlanRow,
    item_id: String(data.item_id ?? input.item_id),
    credit_note_number: data.credit_note_number ? String(data.credit_note_number) : null,
    replacement_plan: (data.replacement_plan as CheckPlanRow | null) ?? null,
  };
}

/**
 * Approve a draft: it becomes a real document and takes a fiscal number,
 * dated today. A receipt's or invoice-receipt's draft is checked again first
 * (its payments, and the invoices it settles against today's balances); a
 * refusal is 400 {error} and uses no number.
 */
export async function finalizeDraft(id: string): Promise<FormalDocument> {
  const res = await api.post(`/documents/documents/${id}/finalize/`);
  return res.data;
}

/** Delete a draft (manager). It has no number and settles nothing, so nothing is left behind. */
export async function discardDraft(id: string): Promise<{ id: string; document_number: string }> {
  const res = await api.post(`/documents/documents/${id}/discard/`);
  return res.data;
}

/**
 * Record the customer's confirmation of a credit note (הוראה 23א(3)) —
 * manager only, once (409 after). `date` is the day it arrived (YYYY-MM-DD),
 * when it is recorded later; without it the server stamps now.
 */
export async function recordCustomerAck(
  id: string,
  input: { note: string; date?: string },
): Promise<{ id: string; customer_ack_at: string; customer_ack_note: string }> {
  const res = await api.post(`/documents/documents/${id}/customer-ack/`, {
    note: input.note.trim(),
    ...(input.date ? { date: input.date } : {}),
  });
  return res.data;
}

/** "נותר לזכות" of a document, before VAT (GET documents/credit-room/). */
export async function fetchCreditRoom(number: string): Promise<CreditRoom> {
  const res = await api.get('/documents/documents/credit-room/', { params: { number } });
  return res.data;
}

/**
 * The document rendered by our own server. Used when Tranzila has no PDF for
 * it — drafts, credit invoices, and anything Tranzila never issued.
 */
export async function downloadDocumentPdf(id: string, documentNumber: string): Promise<void> {
  const res = await api.get(`/documents/documents/${id}/pdf/`, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${documentNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}


// ── Cash plans: paid up front, recognised month by month ─────────────────────

export interface CashPlanMonth {
  id: string;
  due_date: string;
  amount: string;
  status: 'pending' | 'invoiced';
  invoiced_at: string | null;
  document_number: string;
  document_type: string;
}

export interface CashPlan {
  id: string;
  child: string;
  child_name: string;
  lesson: string | null;
  course_name: string;
  branch_name: string;
  description: string;
  status: 'active' | 'completed' | 'cancelled';
  total_amount: string;
  monthly_amount: string;
  /** Ignored since 30.9.2026: no document is issued a month. */
  monthly_document_type: 'combined' | 'tax_invoice';
  /** The document issued when the cash was taken — an invoice-receipt since 30.9.2026, a receipt before. */
  receipt?: string | null;
  receipt_number: string;
  months: CashPlanMonth[];
  months_paid: number;
  months_total: number;
  created_at: string;
  // WS-3 (30.9.2026) — absent on an older server.
  /** 'upfront': one invoice-receipt for the whole sum; null: the older design (a receipt and a document a month). */
  mode?: 'upfront' | null;
  /** 'combined' for an upfront plan, 'receipt' for an older one. */
  receipt_document_type?: string;
  /** What the months not yet begun come to, as '1234.00'. */
  unused_amount?: string;
  cancelled_at?: string | null;
  cancelled_by_name?: string;
}

export async function fetchCashPlans(childId: string): Promise<CashPlan[]> {
  const res = await api.get('/documents/cash-plans/', { params: { child_id: childId } });
  return res.data?.results ?? res.data ?? [];
}

/** The months and amounts, before anything is issued. */
export async function previewCashPlan(input: {
  total_amount: string;
  monthly_amount: string;
  start_month?: string;
}) {
  const res = await api.post('/documents/cash-plans/preview/', input);
  return res.data as {
    total_amount: string;
    monthly_amount: string;
    months: number;
    schedule: Array<{ due_date: string; label: string; amount: string }>;
  };
}

export async function registerCashPlan(input: {
  child_id: string;
  lesson_id?: string | null;
  total_amount: string;
  monthly_amount: string;
  start_month?: string;
  description?: string;
}): Promise<CashPlan> {
  const res = await api.post('/documents/cash-plans/', input);
  return res.data;
}

export interface CancelCashPlanAnswer {
  plan: CashPlan;
  /** The credit note of the invoice-receipt, when one was issued (signed and emailed to the customer). */
  credit_note_number: string | null;
  /** What the months not yet begun came to, '1234.00'. */
  unused_amount: string;
  /** The server's explanation — an older plan has nothing to credit, and says what to tell the accountant. */
  message: string;
}

/**
 * Stop a cash plan: the months not yet begun get nothing more. An upfront
 * plan's invoice-receipt is credited for `refund_amount` (left out: the months
 * not begun; 0: nothing). An older plan has nothing to credit and `message`
 * says so; the server refuses a refund amount for it.
 */
export async function cancelCashPlan(
  id: string,
  input: { reason?: string; refund_amount?: string | null } = {},
): Promise<CancelCashPlanAnswer> {
  const res = await api.post(`/documents/cash-plans/${id}/cancel/`, {
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    ...(input.refund_amount != null && input.refund_amount !== '' ? { refund_amount: input.refund_amount } : {}),
  });
  const data = (res.data ?? {}) as CashPlan & { credit_note_number?: unknown; message?: unknown };
  const { credit_note_number: credit, message, ...plan } = data;
  return {
    plan: plan as CashPlan,
    credit_note_number: credit ? String(credit) : null,
    unused_amount: String(data.unused_amount ?? '0.00'),
    message: typeof message === 'string' ? message : '',
  };
}

/**
 * What the server answers to an allocation number. The fields after the first
 * two came on 25.9.2026 (a server before that sends only the first two):
 * whether the document's original is signed now and where it went, and
 * `copy_only` when the original was signed before the number and it will be
 * printed on copies only (`message` says so).
 */
export interface AllocationNumberAnswer {
  allocation_number: string;
  allocation_entered_at: string | null;
  copy_only?: boolean;
  signed?: boolean;
  delivery?: 'email' | 'paper' | 'held' | 'none' | null;
  delivery_reason?: string;
  message?: string;
}

/**
 * מספר הקצאה שנלקח ידנית מרשות המסים. מחרוזת ריקה מנקה אותו.
 * A document held for its number is signed and mailed once it is entered; once
 * the original is signed the server refuses a change (409, with its reason).
 */
export async function setAllocationNumber(documentId: string, allocationNumber: string): Promise<AllocationNumberAnswer> {
  const res = await api.post(`/documents/documents/${documentId}/allocation-number/`, {
    allocation_number: allocationNumber,
  });
  return res.data as AllocationNumberAnswer;
}
