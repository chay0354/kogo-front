/**
 * Payment Types - Tranzila Integration
 * 
 * TypeScript interfaces for payment-related data structures
 */

export type PaymentType = 'recurring_subscription' | 'one_time';

export type PaymentStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'refunded' 
  | 'cancelled';

export type RecurringPaymentStatus = 
  | 'active' 
  | 'paused' 
  | 'cancelled' 
  | 'expired' 
  | 'failed';

export type TransactionType = 
  | 'authorization' 
  | 'charge' 
  | 'refund' 
  | 'recurring_setup' 
  | 'recurring_charge';

export interface PaymentDiscountSnapshot {
  id: string;
  discount_name: string;
  discount_type: string;
  discount_value: number;
  amount_deducted: number;
  reason: string;
  created_at: string;
}

export interface TranzilaTransaction {
  id: string;
  transaction_id: string;
  confirmation_code: string;
  transaction_type: TransactionType;
  response_code: string;
  response_message: string;
  is_successful: boolean;
  request_timestamp: string;
  response_timestamp: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  child: string;
  child_name: string;
  parent: string | null;
  family: string;
  family_name: string;
  branch: string | null;
  payment_type: PaymentType;
  status: PaymentStatus;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  description: string;
  payment_date: string | null;
  failure_reason: string;
  failure_code: string;
  discount_snapshots: PaymentDiscountSnapshot[];
  tranzila_transaction: TranzilaTransaction | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringPayment {
  id: string;
  child: string;
  child_name: string;
  initial_payment: string | null;
  initial_payment_details: Payment | null;
  status: RecurringPaymentStatus;
  amount: number | string;
  billing_day: number;
  start_date: string;
  end_date: string | null;
  next_billing_date: string | null;
  last_charge_date: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  lesson_name: string | null;
  course_name: string | null;
  branch_name: string | null;
  lesson_details: {
    course_name: string;
    day_of_week: number;
    day_name: string;
    start_time: string;
    branch_name: string;
    display: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface AppliedDiscount {
  name: string;
  type: string;
  value: number;
  reason: string;
}

export interface LessonInfo {
  id: string;
  name: string;
  day_of_week: string;
  time: string;
}

export interface PaymentInitiationRequest {
  child_id: string;
  lesson_id?: string;
  amount?: number;
  description?: string;
  payment_date?: string;
  success_url?: string;
  error_url?: string;
  callback_url?: string;
}

export interface PaymentInitiationResponse {
  payment_id: string;
  tranzila_url: string;
  course_index?: number;
  base_amount?: number;
  discount_amount?: number;
  final_amount: number;
  prorate_factor?: number;
  prorate_days_remaining?: number;
  days_in_month?: number;
  next_billing_date?: string;
  discounts_applied?: AppliedDiscount[];
  lesson?: LessonInfo;
}

export interface RecurringPaymentUpdateRequest {
  recalculate_discounts?: boolean;
}

export interface RecurringPaymentCancelRequest {
  cancellation_reason?: string;
}

export interface PaymentStatusResponse {
  payment_id: string;
  status: PaymentStatus;
  payment_type: PaymentType;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_date: string | null;
  child: {
    id: string;
    name: string;
  };
  discounts_applied: Array<{
    name: string;
    amount: number;
  }>;
  transaction: {
    id: string;
    confirmation_code: string;
  } | null;
}

export type InvoiceStatus = 
  | 'pending' 
  | 'paid' 
  | 'failed' 
  | 'cancelled' 
  | 'credit';

export type InvoicePaymentMethod = 
  | 'credit_card' 
  | 'cash' 
  | 'bank_transfer' 
  | 'check';

export type InvoicePaymentType = 
  | 'recurring' 
  | 'one_time' 
  | 'manual';

export interface InvoiceChild {
  id: string;
  child: string;
  child_name: string;
  course: string | null;
  course_name: string | null;
  lesson: string | null;
  lesson_details: {
    course_name: string;
    day_of_week: number;
    day_name: string;
    start_time: string;
    display: string;
  } | null;
  product: string | null;
  product_name: string | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  family: string;
  family_name: string;
  parent: string | null;
  parent_name: string | null;
  branch: string | null;
  branch_name: string | null;
  payment: string | null;
  amount: number | string;  // Django serializes Decimal as string
  status: InvoiceStatus;
  payment_method: InvoicePaymentMethod | string;
  payment_type: InvoicePaymentType;
  payer_name: string;
  payer_email: string;
  payer_phone: string;
  meshulam_id: string;
  tranzila_transaction_id: string;
  external_transaction_id: string;
  pdf_url: string;
  invoice_date: string;
  email_sent_at: string | null;
  whatsapp_sent_at: string | null;
  admin_notes: string;
  created_at: string;
  updated_at: string;
  children: InvoiceChild[];
}

export interface InvoiceCreditRequest {
  reason?: string;
  amount?: number;
}

