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
