import { useCallback, useMemo, useState } from 'react';
import { generateDocumentNumber, getWizardSteps } from './utils';
import type {
  BusinessCustomerFormData,
  CheckRow,
  ClientType,
  InvoiceDetailsData,
  LineItem,
  ReceiptDetailsData,
  WizardStepId,
} from './types';

const FIRST_STEP: WizardStepId = 'clientType';

const EMPTY_BUSINESS_FORM: BusinessCustomerFormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  id_number: '',
  company_number: '',
  business_type: '',
  category: '',
  notes: '',
};

const INITIAL_LINE_ITEM: LineItem = {
  id: '1',
  sku: '',
  description: '',
  quantity: 1,
  price: 0,
};

function createInitialReceiptDetails(): ReceiptDetailsData {
  const today = new Date().toISOString().split('T')[0];
  const initialCheck: CheckRow = {
    id: '1',
    date: today,
    bank: '',
    branch: '',
    accountNumber: '',
    checkNumber: '',
    amount: 0,
    confirmed: false,
  };
  return {
    paymentMethod: 'מזומן',
    linkedInvoiceId: '',
    cashAmount: 0,
    cashNotes: '',
    checks: [initialCheck],
    withholding: 0,
    checkNotes: '',
    cardLastFour: '',
    cardExpiry: '',
    cardAmount: 0,
    cardInstallments: 1,
    cardNotes: '',
    bankDate: today,
    bankReference: '',
    bankAmount: 0,
    bankNotes: '',
  };
}

function createInitialInvoiceDetails(): InvoiceDetailsData {
  return {
    documentNumber: generateDocumentNumber(),
    documentDate: new Date().toISOString().split('T')[0],
    description: '',
    currency: 'ILS',
    pricesIncludeVat: false,
    lineItems: [{ ...INITIAL_LINE_ITEM }],
    discountAmount: 0,
    discountPercent: 0,
    vatExempt: false,
    roundTotal: false,
    closeInvoice: false,
    customerNotes: '',
    internalNotes: '',
    paymentTerms: 'שוטף + 30',
    dueDate: '',
    paymentMethods: [],
    linkedInvoiceId: '',
    receiptNotes: '',
  };
}

export function useNewDocumentWizard(onClose: () => void) {
  const [currentStep, setCurrentStep] = useState<WizardStepId>(FIRST_STEP);
  const [clientType, setClientTypeState] = useState<ClientType | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [businessCustomerId, setBusinessCustomerId] = useState<string | null>(null);
  const [businessFormData, setBusinessFormData] =
    useState<BusinessCustomerFormData>(EMPTY_BUSINESS_FORM);
  const [docType, setDocType] = useState<string | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetailsData>(
    createInitialInvoiceDetails
  );
  const [receiptDetails, setReceiptDetails] = useState<ReceiptDetailsData>(
    createInitialReceiptDetails
  );

  const steps = useMemo(() => getWizardSteps(clientType, docType), [clientType, docType]);
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);

  const reset = useCallback(() => {
    setCurrentStep(FIRST_STEP);
    setClientTypeState(null);
    setSelectedCustomerId(null);
    setBusinessCustomerId(null);
    setBusinessFormData(EMPTY_BUSINESS_FORM);
    setDocType(null);
    setInvoiceDetails(createInitialInvoiceDetails());
    setReceiptDetails(createInitialReceiptDetails());
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const setClientType = useCallback((type: ClientType) => {
    setClientTypeState(type);
    setSelectedCustomerId((current) => (type === 'existing' ? current : null));
    if (type !== 'business') {
      setBusinessCustomerId(null);
      setBusinessFormData(EMPTY_BUSINESS_FORM);
    }
  }, []);

  const goToStep = useCallback(
    (step: WizardStepId) => {
      setCurrentStep((current) => {
        const targetIndex = stepIds.indexOf(step);
        const currentIndex = stepIds.indexOf(current);
        return targetIndex >= 0 && targetIndex < currentIndex ? step : current;
      });
    },
    [stepIds]
  );

  const goNext = useCallback(
    (canAdvance: boolean) => {
      if (!canAdvance) return;
      setCurrentStep((current) => {
        const currentIndex = stepIds.indexOf(current);
        if (currentIndex === stepIds.length - 1) {
          close();
          return current;
        }
        return stepIds[currentIndex + 1];
      });
    },
    [stepIds, close]
  );

  const goBack = useCallback(() => {
    setCurrentStep((current) => {
      const currentIndex = stepIds.indexOf(current);
      return currentIndex <= 0 ? current : stepIds[currentIndex - 1];
    });
  }, [stepIds]);

  return {
    currentStep,
    steps,
    clientType,
    selectedCustomerId,
    businessCustomerId,
    businessFormData,
    docType,
    invoiceDetails,
    receiptDetails,
    setClientType,
    setSelectedCustomerId,
    setBusinessCustomerId,
    setBusinessFormData,
    setDocType,
    setInvoiceDetails,
    setReceiptDetails,
    goToStep,
    goNext,
    goBack,
    close,
  };
}
