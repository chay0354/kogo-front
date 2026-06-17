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
  notes: string;
}

export interface BusinessCustomerFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  id_number: string;
  company_number: string;
  address: string;
  business_type: string;
  category: string;
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
  cardExpiry: string;
  cardAmount: number;
  cardInstallments: number;
  cardNotes: string;
  bankDate: string;
  bankReference: string;
  bankAmount: number;
  bankNotes: string;
}

export interface CreditInvoiceData {
  documentNumber: string;
  documentDate: string;
  linkedInvoiceId: string;
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
  roundTotal: boolean;
  closeInvoice: boolean;
  customerNotes: string;
  internalNotes: string;
  paymentTerms: string;
  dueDate: string;
  paymentMethods: string[];
  linkedInvoiceId: string;
  receiptNotes: string;
}
