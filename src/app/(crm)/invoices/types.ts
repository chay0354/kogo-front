export type DocType = 'חשבונית מס/קבלה' | 'חשבונית מס' | 'קבלה' | 'חשבונית עסקה' | 'חשבונית מס זיכוי' | 'טיוטה';
export type ActiveTab = 'מסמכים' | 'תשלומים' | 'גבייה' | 'הוראת קבע' | "צ'קים";

/** שורה בדף הגבייה — חשבונית חנות ומסמך פורמלי מגיעים לאותה טבלה. */
export interface CollectionRow {
  id: string;
  kind: 'document' | 'store';
  customer: string;
  number: string;
  docType: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  total: number;
  paid: number;
  open: number;
  status: string;
}

export interface AgingBucket {
  key: 'current' | 'd31_60' | 'd61_90' | 'd90_plus';
  label: string;
  total: number;
  count: number;
}

/**
 * Where a ledger row's money came from, in the terms the shared filter bar
 * narrows on: which business, city and branch, which class, age group and
 * instructor.
 *
 * The backend is adding these to every ledger row. Until a row carries one the
 * field is simply absent, so every field is optional — such a row still
 * renders, it just cannot pass a filter on that dimension. Any tab's row can
 * satisfy this (a document, a charge, a standing order), so one matching rule
 * serves them all: matchesLedgerFilters in utils.ts.
 */
export interface LedgerDimensions {
  /** store_website / store_counter / subscription / manual / tranzila */
  origin?: string | null;
  branch_id?: string | null;
  business_id?: string | null;
  business_name?: string;
  city_id?: string | null;
  city_name?: string;
  course_id?: string | null;
  course_name?: string;
  course_type_id?: string | null;
  course_type_name?: string;
  age_key?: string;
  age_label?: string;
  instructor_id?: string | null;
  instructor_name?: string;
}

/**
 * The filters every tab shares. The page holds one copy (useLedgerFilters), so
 * a choice made on one tab is still in force on the next.
 */
export interface LedgerFilters {
  /** YYYY-MM-DD. Left empty, the default window is what the server is asked for. */
  dateFrom: string;
  dateTo: string;
  /** '' every income · 'branches' · 'store' · a business id (see LEDGER_BUSINESS_*). */
  business: string;
  /** עיר and סניף exist only under סניפים; choosing either one implies it. */
  cityId: string;
  branchId: string;
  courseTypeId: string;
  ageKey: string;
  instructorId: string;
  /** Free text. Which fields it is matched against is each tab's own call. */
  search: string;
}

export type LedgerFilterKey = keyof LedgerFilters;

/**
 * A row of the documents list. Besides its own fields it carries the ledger
 * dimensions above — business, city, course, age group, instructor — which
 * the backend is adding row by row; a row without them still renders.
 */
export interface DocumentRow extends LedgerDimensions {
  id: string;
  document_number: string;
  issue_date: string;
  customer_name: string;
  document_type: string;
  document_type_code?: string;
  total_amount: number;
  amount_paid: number;
  open_balance: number;
  /** A credit note: money going back. Never an open debt; subtracted from totals. */
  is_credit?: boolean;
  /** מועד התשלום שסוכם (שוטף+30 וכו') — קיים רק במסמכים מקומיים. */
  due_date?: string;
  payment_terms?: string;
  status: string;
  pdf_url?: string;
  store_invoice_id?: string;
  tranzila_doc_id?: string;
  source?: string;
  tranzila_issued?: boolean;
  is_draft?: boolean;
  branch?: string;
  branch_id?: string | null;
  /** מאיזו מערכת הגיע המסמך — חנות/אתר, חנות/סניף, מנוי, מסמך ידני. */
  origin?: DocOrigin;
  origin_label?: string;
  payment_method?: string;
  payment_method_label?: string;
  /** מספר ההזמנה שהקונה קיבל באתר — קיים רק בהזמנת משלוח. */
  website_order_number?: string;
  shipping_address?: string;
}

export type DocOrigin =
  | 'store_website'
  | 'store_counter'
  | 'subscription'
  | 'manual'
  | 'tranzila';

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
  // What the buyer typed at website checkout — on a store row only. Shown
  // under the name and searchable, so a phone number or an address finds
  // the order.
  customer_phone?: string;
  customer_email?: string;
  shipping_address?: string;
  customer_notes?: string;
  website_order_number?: string;
  store_invoice_id?: string;
}
