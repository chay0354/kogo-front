export type DocumentType =
  | 'tax_invoice'
  | 'receipt'
  | 'combined'
  | 'transaction_invoice'
  | 'credit_invoice'
  | 'draft';

/** What a draft becomes when approved (a receipt and an invoice-receipt since 30.9.2026, audit M11). */
export type DraftTargetType = 'tax_invoice' | 'transaction_invoice' | 'receipt' | 'combined';

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
  /** The credited original's date (סעיף 9(ה)(4)). */
  linked_document_date?: string | null;
  credit_reason: string;
  /** A credit note: when the customer confirmed receiving it (הוראה 23א(3)), and how. */
  customer_ack_at?: string | null;
  customer_ack_note?: string | null;
  /** A draft: what it becomes when approved. */
  draft_target_type?: DraftTargetType | '';
  /** A draft receipt / invoice-receipt: the invoices it will settle when approved. */
  draft_settlements?: Array<{ invoice_id: string; invoice_number: string; amount: string }> | null;
  tranzila_doc_id: string;
  pdf_url: string;
  tranzila_issued: boolean;
  branch: string | null;
  created_at: string;
  updated_at: string;
  line_items: DocumentLineItemOut[];
  payments: DocumentPaymentOut[];
  /**
   * Receipts against invoices (WS-3, 30.9.2026) — absent on an older server.
   * Read them through readDocumentSettlements (lib/settlements.ts).
   */
  balance?: unknown;
  settled_by?: unknown;
  settles?: unknown;
  /** Set when a receipt's checks became a check plan (receipt_details.invoice_per_check). */
  check_plan_id?: string;
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
  allocation_number?: string;
  allocation_required?: boolean;
}

// ── Create payload types ─────────────────────────────────────────────────────

export interface LineItemInput {
  sku?: string;
  description?: string;
  quantity: number;
  price: number;
}

/** One way an invoice-receipt was paid, for the amount paid that way. The rows add up to its total. */
export interface InvoicePaymentInput {
  method: 'cash' | 'check' | 'credit_card' | 'bank_transfer';
  amount: number;
  check_number?: string;
  check_bank?: string;
  check_branch?: string;
  check_account?: string;
  check_date?: string | null;
  /** Crossed "לא סחיר" in the customer's name — only then may the signed original go by email. */
  check_crossed?: boolean;
  card_last_four?: string;
  card_brand?: string;
  installments?: number;
  reference?: string;
  paid_on?: string | null;
  notes?: string;
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
  /** An invoice-receipt's payments (they and withholding_amount equal the total). */
  payments?: InvoicePaymentInput[];
  withholding_amount?: number;
  /** Older payload: accepted by the server only when it names a single method. */
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
    /** Crossed "לא סחיר" in the customer's name — only then may the signed original go by email. */
    check_crossed: boolean;
  }>;
  withholding?: number;
  check_notes?: string;
  card_last_four?: string;
  card_brand?: string;
  card_expiry?: string;
  card_amount?: number;
  card_installments?: number;
  card_notes?: string;
  bank_date?: string | null;
  bank_reference?: string;
  bank_amount?: number;
  bank_notes?: string;
  /**
   * "חשבונית מס לכל צ'ק": a check receipt of a private customer becomes a check
   * plan — a tax invoice on (or after) each check's date, paid by this receipt.
   */
  invoice_per_check?: boolean;
}

export interface CreditInvoiceInput {
  document_date: string;
  linked_invoice_id?: string;
  /** The original's date — required by the server for a number kogo never issued. */
  linked_document_date?: string | null;
  credit_reason: string;
  credit_amount_before_vat: number;
  vat_exempt?: boolean;
  customer_notes?: string;
  internal_notes?: string;
}

export interface CreateDocumentPayload {
  document_type: DocumentType;
  // Only for drafts: the type the document becomes when approved.
  draft_target_type?: DraftTargetType;
  client_type: DocumentClientType;
  child_id?: string | null;
  business_customer_id?: string | null;
  branch_id?: string | null;
  document_date?: string;
  invoice_details?: InvoiceDetailsInput;
  receipt_details?: ReceiptDetailsInput;
  credit_invoice_details?: CreditInvoiceInput;
  /**
   * The open invoices this document pays, and how much of each: tax invoices
   * for a receipt, transaction invoices for an invoice-receipt (settlement.py).
   * An older server ignores it.
   */
  settlements?: Array<{ invoice_id: string; amount: string }>;
}
