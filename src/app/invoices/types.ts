export type DocType = 'חשבונית מס/קבלה' | 'חשבונית עסקה' | 'טיוטה';
export type ActiveTab = 'מסמכים' | 'תשלומים';

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
