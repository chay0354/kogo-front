export type ClientType = 'business' | 'existing';

export type WizardStep = 1 | 2 | 3 | 4;

export interface NewDocumentDialogProps {
  open: boolean;
  onClose: () => void;
}

export interface StepDefinition {
  step: WizardStep;
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
