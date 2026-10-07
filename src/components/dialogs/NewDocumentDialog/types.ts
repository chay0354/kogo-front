import type { SettlementPicks } from '@/lib/settlements';
import type { CreditPrefill } from '@/lib/draftsAndCredits';

export type ClientType = 'business' | 'existing';

export type WizardStepId =
  | 'clientType'
  | 'businessClientDetails'
  | 'selectCustomer'
  | 'docType'
  | 'selectBranch'
  | 'documentDetails'
  | 'summary';

export interface NewDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Open as a credit note already linked to a document and its customer
   * ("זיכוי" on a tax invoice's or an invoice-receipt's row, audit #10).
   */
  initialCredit?: CreditPrefill | null;
}

export interface StepDefinition {
  id: WizardStepId;
  label: string;
}

export interface ClientTypeOption {
  type: ClientType;
  title: string;
  description: string;
}

export interface DocumentTypeOption {
  type: string;
  description: string;
}

export interface BusinessCustomer {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  id_number: string;
  company_number: string;
  address: string;
  business_type: string;
  category: string;
  business_id: string | null;
  business_category_id: string | null;
  branch_id: string | null;
  notes: string;
  /** Consent to computerized documents (18ב(ג)) — on a server that keeps it for business customers. */
  computerized_docs_consent_at?: string | null;
  accepts_computerized_documents?: boolean;
}

export interface BusinessCustomerFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  /** What the single "ת.ז/ח.פ" input shows and edits. Which of the card's two numbers it is: `number_field`. */
  id_number: string;
  company_number: string;
  /**
   * The card's number the "ת.ז/ח.פ" input is showing, for a customer picked
   * from the search. Missing for a new customer, or a card with no number yet.
   * Never sent: businessCustomerPayload reads it and leaves it out.
   */
  number_field?: 'id_number' | 'company_number';
  address: string;
  business_type: string;
  category: string;
  business_id: string | null;
  business_category_id: string | null;
  branch_id: string | null;
  notes: string;
}

export interface LineItem {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  price: number;
}

export interface CheckRow {
  id: string;
  date: string;
  bank: string;
  branch: string;
  accountNumber: string;
  checkNumber: string;
  amount: number;
  confirmed: boolean;
  /**
   * Crossed "לא סחיר" and drawn in the customer's name (הוראה 18ב(ד)). Unticked,
   * the receipt's signed original is handed over on paper, not emailed.
   */
  crossed: boolean;
}

export interface ReceiptDetailsData {
  paymentMethod: 'מזומן' | "צ'ק" | 'אשראי' | 'העברה בנקאית';
  linkedInvoiceId: string;
  cashAmount: number;
  cashNotes: string;
  checks: CheckRow[];
  withholding: number;
  checkNotes: string;
  cardLastFour: string;
  /** The card's brand (ויזה, מאסטרקארד…), as the office reads it off the slip. Optional. */
  cardBrand: string;
  cardExpiry: string;
  cardAmount: number;
  cardInstallments: number;
  cardNotes: string;
  bankDate: string;
  bankReference: string;
  bankAmount: number;
  bankNotes: string;
  /**
   * "חשבונית מס לכל צ'ק" (a check receipt of a private customer): the checks
   * become a check plan, and a tax invoice is issued on each check's day,
   * marked paid by this receipt.
   */
  invoicePerCheck: boolean;
  /** Which open tax invoices this receipt pays, and how much of each (lib/settlements.ts). */
  settlementPicks: SettlementPicks;
}

export interface CreditInvoiceData {
  documentNumber: string;
  documentDate: string;
  linkedInvoiceId: string;
  /**
   * The original's date (סעיף 9(ה)(4)): filled in from the document when kogo
   * issued it, typed for a number from the previous software.
   */
  linkedDocumentDate: string;
  creditReason: string;
  creditAmountBeforeVat: number;
  vatExempt: boolean;
  customerNotes: string;
  internalNotes: string;
}

export interface InvoiceDetailsData {
  documentNumber: string;
  documentDate: string;
  description: string;
  currency: string;
  pricesIncludeVat: boolean;
  lineItems: LineItem[];
  discountAmount: number;
  discountPercent: number;
  vatExempt: boolean;
  customerNotes: string;
  internalNotes: string;
  paymentTerms: string;
  dueDate: string;
  /** The methods an invoice-receipt was paid with — each opens its panel in `payments`. */
  paymentMethods: string[];
  /**
   * How an invoice-receipt was paid, in the receipt's own panels (cash, checks,
   * card, transfer): each method chosen above becomes payment rows of its own
   * amount, and the rows plus any withholding come to the total exactly (G).
   */
  payments: ReceiptDetailsData;
  /** ניכוי במקור the customer withheld from an invoice-receipt. */
  withholdingAmount: number;
  /** מספר הקצאה from the Tax Authority's portal, when the office already has it (9 digits). */
  allocationNumber: string;
  linkedInvoiceId: string;
  receiptNotes: string;
  /** Which open transaction invoices an invoice-receipt closes, and how much of each. */
  settlementPicks: SettlementPicks;
}
