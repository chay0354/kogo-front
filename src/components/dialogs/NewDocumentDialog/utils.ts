import { ALL_WIZARD_STEPS } from './constants';
import type { ClientType, StepDefinition, WizardStepId } from './types';

export function getWizardSteps(clientType: ClientType | null): StepDefinition[] {
  return ALL_WIZARD_STEPS.filter((step) => step.id !== 'selectCustomer' || clientType === 'existing');
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
  docType: string | null
): boolean {
  if (stepId === 'clientType') return clientType !== null;
  if (stepId === 'selectCustomer') return selectedCustomerId !== null;
  if (stepId === 'docType') return docType !== null;
  return true;
}

export function getNextButtonLabel(stepId: WizardStepId, steps: StepDefinition[]): string {
  const isLastStep = steps[steps.length - 1]?.id === stepId;
  return isLastStep ? 'צור מסמך' : 'הבא';
}
