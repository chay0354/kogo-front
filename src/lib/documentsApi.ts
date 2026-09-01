import api from './api';
import type {
  FormalDocument,
  FormalDocumentSummary,
  CreateDocumentPayload,
} from '@/types/document';
import type { Payment } from '@/types/payment';

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

export async function fetchAllCustomerPayments(): Promise<Payment[]> {
  const items: Payment[] = [];
  let page = 1;
  while (page <= 100) {
    const res = await api.get('/customers/payments/', {
      params: { page, page_size: 200, ordering: '-created_at' },
    });
    const data = res.data;
    if (Array.isArray(data)) {
      items.push(...data);
      break;
    }
    const batch = Array.isArray(data?.results) ? data.results : [];
    items.push(...batch);
    if (!data?.next || batch.length === 0) break;
    page += 1;
  }
  return items;
}

export async function fetchDocument(id: string): Promise<FormalDocument> {
  const res = await api.get(`/documents/documents/${id}/`);
  return res.data;
}

export async function sendDocumentReminder(id: string): Promise<{ sent: boolean }> {
  const res = await api.post(`/documents/documents/${id}/send-reminder/`);
  return res.data;
}
