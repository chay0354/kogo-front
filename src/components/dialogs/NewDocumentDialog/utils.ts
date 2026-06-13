import { ALL_WIZARD_STEPS } from './constants';
import type {
  BusinessCustomerFormData,
  ClientType,
  InvoiceDetailsData,
  StepDefinition,
  WizardStepId,
} from './types';

export function generateDocumentNumber(): string {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `INV-${year}-${seq}`;
}

export function getDocumentDetailsLabel(docType: string | null): string {
  if (docType === 'חשבונית מס') return 'פרטי חשבונית מס';
  if (docType === 'חשבונית מס/קבלה') return 'פרטי חשבונית מס/קבלה';
  if (docType === 'קבלה') return 'פרטי קבלה';
  if (docType === 'חשבונית עסקה') return 'פרטי חשבונית עסקה';
  if (docType === 'טיוטה') return 'פרטי טיוטה';
  return 'פרטי מסמך';
}

export function getWizardSteps(
  clientType: ClientType | null,
  docType: string | null
): StepDefinition[] {
  return ALL_WIZARD_STEPS.filter((step) => {
    if (step.id === 'businessClientDetails') return clientType === 'business';
    if (step.id === 'selectCustomer') return clientType === 'existing';
    return true;
  }).map((step) =>
    step.id === 'documentDetails'
      ? { ...step, label: getDocumentDetailsLabel(docType) }
      : step
  );
}

export function getStepStatus(
  stepId: WizardStepId,
  currentStepId: WizardStepId,
  steps: StepDefinition[]
): 'active' | 'completed' | 'pending' {
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  if (stepIndex === currentIndex) return 'active';
  if (stepIndex < currentIndex) return 'completed';
  return 'pending';
}

export function canAdvanceFromStep(
  stepId: WizardStepId,
  clientType: ClientType | null,
  selectedCustomerId: string | null,
  businessCustomerId: string | null,
  businessFormData: BusinessCustomerFormData | null,
  docType: string | null,
  invoiceDetails: InvoiceDetailsData | null,
  creditInvoiceDetails?: { linkedInvoiceId: string; creditReason: string; creditAmountBeforeVat: number } | null
): boolean {
  if (stepId === 'clientType') return clientType !== null;
  if (stepId === 'selectCustomer') return selectedCustomerId !== null;
  if (stepId === 'businessClientDetails') {
    return (
      businessCustomerId !== null ||
      (businessFormData !== null &&
        businessFormData.first_name.trim() !== '' &&
        businessFormData.last_name.trim() !== '')
    );
  }
  if (stepId === 'docType') return docType !== null;
  if (stepId === 'documentDetails') {
    if (docType === 'קבלה') return true;
    if (docType === 'חשבונית מס' || docType === 'חשבונית מס/קבלה' || docType === 'חשבונית עסקה') {
      if (!invoiceDetails) return false;
      return (
        invoiceDetails.description.trim() !== '' &&
        invoiceDetails.lineItems.some((item) => item.price > 0)
      );
    }
    if (docType === 'חשבונית מס זיכוי') {
      if (!creditInvoiceDetails) return false;
      return (
        creditInvoiceDetails.linkedInvoiceId.trim() !== '' &&
        creditInvoiceDetails.creditReason.trim() !== '' &&
        creditInvoiceDetails.creditAmountBeforeVat > 0
      );
    }
    return true;
  }
  return true;
}

export function getNextButtonLabel(stepId: WizardStepId, steps: StepDefinition[]): string {
  const isLastStep = steps[steps.length - 1]?.id === stepId;
  return isLastStep ? 'הפק' : 'הבא';
}
