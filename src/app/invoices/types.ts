export type DocType = 'חשבונית מס/קבלה' | 'חשבונית מס' | 'קבלה' | 'חשבונית עסקה' | 'חשבונית מס זיכוי' | 'טיוטה';
export type ActiveTab = 'מסמכים' | 'תשלומים' | 'גבייה' | 'הוראת קבע';

export interface AgingBucket {
  key: 'current' | 'd31_60' | 'd61_90' | 'd90_plus';
  label: string;
  total: number;
  count: number;
}

export interface DocumentRow {
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
}

export interface PaymentRecord {
  id: number | string;
  created_at: string;
  customer_name: string;
  invoice_number: string;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  status: string;
  card_last4?: string;
  source?: string;
}
