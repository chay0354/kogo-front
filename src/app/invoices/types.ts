export type DocType = 'חשבונית מס/קבלה' | 'חשבונית עסקה' | 'טיוטה';
export type ActiveTab = 'מסמכים' | 'תשלומים' | 'גבייה' | 'הוראת קבע';

export interface AgingBucket {
  key: 'current' | 'd31_60' | 'd61_90' | 'd90_plus';
  label: string;
  total: number;
  count: number;
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
}
