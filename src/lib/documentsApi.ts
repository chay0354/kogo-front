import api from './api';
import type {
  FormalDocument,
  FormalDocumentSummary,
  CreateDocumentPayload,
} from '@/types/document';
import type { PaymentLedgerItem } from '@/app/(crm)/invoices/types';

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
}): Promise<{
  results: PaymentLedgerItem[];
  count: number;
  month_total: number;
  pending_count: number;
}> {
  const res = await api.get('/customers/payments/ledger/', {
    params: {
      page: 1,
      page_size: PAYMENTS_PAGE_SIZE,
      ordering: '-created_at',
      ...params,
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
    };
  }
  return {
    results: Array.isArray(data?.results) ? data.results : [],
    count: Number(data?.count ?? 0),
    month_total: Number(data?.month_total ?? 0),
    pending_count: Number(data?.pending_count ?? 0),
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
  group_by: 'branch' | 'business';
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

export interface CheckPlanRow {
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
