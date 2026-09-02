export type DocumentType =
  | 'tax_invoice'
  | 'receipt'
  | 'combined'
  | 'transaction_invoice'
  | 'credit_invoice'
  | 'draft';

export type DocumentClientType = 'business' | 'existing';
export type DocumentCurrency = 'ILS' | 'USD' | 'EUR';
export type DocumentPaymentMethod = 'cash' | 'check' | 'credit_card' | 'bank_transfer';

export interface DocumentLineItemOut {
  id: number;
  sku: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface DocumentPaymentOut {
  id: number;
  payment_method: DocumentPaymentMethod;
  amount: string;
  reference: string;
  notes: string;
  check_date: string | null;
  check_bank: string;
  check_branch: string;
  check_account: string;
  card_last_four: string;
  card_expiry: string;
  card_installments: number;
}

export interface FormalDocument {
  id: string;
  document_number: string;
  document_type: DocumentType;
  document_type_display: string;
  client_type: DocumentClientType;
  child: string | null;
  business_customer: string | null;
  document_date: string;
  due_date: string | null;
  description: string;
  currency: DocumentCurrency;
  vat_exempt: boolean;
  vat_percent: string;
  subtotal: string;
  discount_amount: string;
  discount_percent: string;
  vat_amount: string;
  total_amount: string;
  customer_notes: string;
  internal_notes: string;
  linked_document: string | null;
  linked_document_number: string;
  credit_reason: string;
  tranzila_doc_id: string;
  pdf_url: string;
  tranzila_issued: boolean;
  branch: string | null;
  created_at: string;
  updated_at: string;
  line_items: DocumentLineItemOut[];
  payments: DocumentPaymentOut[];
}

export interface FormalDocumentSummary {
  id: string;
  document_number: string;
  document_type: DocumentType;
  document_type_display: string;
  document_date: string;
  total_amount: string;
  currency: DocumentCurrency;
  tranzila_issued: boolean;
  pdf_url: string;
}

// ── Create payload types ─────────────────────────────────────────────────────

export interface LineItemInput {
  sku?: string;
  description?: string;
  quantity: number;
  price: number;
}

export interface InvoiceDetailsInput {
  document_date: string;
  due_date?: string | null;
  description?: string;
  currency?: DocumentCurrency;
  prices_include_vat?: boolean;
  line_items: LineItemInput[];
  discount_amount?: number;
  discount_percent?: number;
  vat_exempt?: boolean;
  round_total?: boolean;
  payment_terms?: string;
  customer_notes?: string;
  internal_notes?: string;
  payment_methods?: string[];
}

export interface ReceiptDetailsInput {
  payment_method: string;
  linked_invoice_id?: string;
  cash_amount?: number;
  cash_notes?: string;
  checks?: Array<{
    date: string;
    bank: string;
    branch: string;
    account_number: string;
    check_number: string;
    amount: number;
    confirmed: boolean;
  }>;
  withholding?: number;
  check_notes?: string;
  card_last_four?: string;
  card_expiry?: string;
  card_amount?: number;
  card_installments?: number;
  card_notes?: string;
  bank_date?: string | null;
  bank_reference?: string;
  bank_amount?: number;
  bank_notes?: string;
}

export interface CreditInvoiceInput {
  document_date: string;
  linked_invoice_id?: string;
  credit_reason: string;
  credit_amount_before_vat: number;
  vat_exempt?: boolean;
  customer_notes?: string;
  internal_notes?: string;
}

export interface CreateDocumentPayload {
  document_type: DocumentType;
  // Only for drafts: the type the document becomes when approved.
  draft_target_type?: 'tax_invoice' | 'transaction_invoice';
  client_type: DocumentClientType;
  child_id?: string | null;
  business_customer_id?: string | null;
  branch_id?: string | null;
  document_date?: string;
  invoice_details?: InvoiceDetailsInput;
  receipt_details?: ReceiptDetailsInput;
  credit_invoice_details?: CreditInvoiceInput;
}
