export type DocType = 'חשבונית מס/קבלה' | 'חשבונית מס' | 'קבלה' | 'חשבונית עסקה' | 'חשבונית מס זיכוי' | 'טיוטה';
export type ActiveTab = 'מסמכים' | 'תשלומים' | 'גבייה' | 'הוראת קבע' | "צ'קים";

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
  tranzila_issued?: boolean;
  is_draft?: boolean;
  branch?: string;
  branch_id?: string | null;
}

export interface PaymentLedgerItem {
  id: string;
  child_name: string;
  family_name: string;
  branch: string | null;
  branch_name?: string | null;
  lesson_name?: string | null;
  payment_type: string;
  status: string;
  final_amount: number;
  registration_fee?: number;
  trial_lesson_date?: string | null;
  description: string;
  payment_date: string | null;
  created_at: string;
  tranzila_transaction_id?: string | null;
  tranzila_confirmation_code?: string | null;
}

export type ChargeKind = 'standing_order' | 'registration' | 'trial' | 'store' | 'one_time';
export type ChargeSource = 'payment' | 'store';

export interface PaymentRecord {
  id: string;
  source: ChargeSource;
  created_at: string;
  customer_name: string;
  description: string;
  kind: ChargeKind;
  kind_label: string;
  invoice_number: string;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  status: string;
  branch_id?: string | null;
  branch_name?: string | null;
  canRefund: boolean;
  card_last4?: string;
}
