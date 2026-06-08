import type { WizardStep } from './types';

export function getStepStatus(step: WizardStep, currentStep: WizardStep): 'active' | 'completed' | 'pending' {
  if (step === currentStep) return 'active';
  if (step < currentStep) return 'completed';
  return 'pending';
}

export function canAdvanceFromStep(step: WizardStep, clientType: string | null, docType: string | null): boolean {
  if (step === 1) return clientType !== null;
  if (step === 2) return docType !== null;
  return true;
}

export function getNextButtonLabel(step: WizardStep): string {
  return step === 4 ? 'צור מסמך' : 'הבא';
}
