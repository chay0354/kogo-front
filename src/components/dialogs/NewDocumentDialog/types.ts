export type ClientType = 'business' | 'existing';

export type WizardStepId =
  | 'clientType'
  | 'businessClientDetails'
  | 'selectCustomer'
  | 'docType'
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
