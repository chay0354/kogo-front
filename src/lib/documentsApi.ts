import api from './api';
import type {
  FormalDocument,
  FormalDocumentSummary,
  CreateDocumentPayload,
} from '@/types/document';
import type { LedgerDimensions, PaymentLedgerItem } from '@/app/(crm)/invoices/types';

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
    tranzila_doc_id?: string;
    source?: string;
    branch?: string;
    branch_id?: string | null;
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

/** Hand a file fetched as a blob to the browser under a name of our choosing. */
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

export async function cancelCheckPlan(id: string): Promise<CheckPlanRow> {
  const res = await api.post(`/documents/check-plans/${id}/cancel/`);
  return res.data;
}

/** Approve a draft: it becomes a real document and takes a fiscal number. */
export async function finalizeDraft(id: string): Promise<void> {
  await api.post(`/documents/documents/${id}/finalize/`);
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
