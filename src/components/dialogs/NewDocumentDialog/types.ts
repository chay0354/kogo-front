export type ClientType = 'business' | 'existing';

export type WizardStepId = 'clientType' | 'selectCustomer' | 'docType' | 'documentDetails' | 'summary';

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
