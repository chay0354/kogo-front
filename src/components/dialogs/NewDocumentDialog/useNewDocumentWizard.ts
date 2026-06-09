import { useCallback, useMemo, useState } from 'react';
import { getWizardSteps } from './utils';
import type { ClientType, WizardStepId } from './types';

const FIRST_STEP: WizardStepId = 'clientType';

export function useNewDocumentWizard(onClose: () => void) {
  const [currentStep, setCurrentStep] = useState<WizardStepId>(FIRST_STEP);
  const [clientType, setClientTypeState] = useState<ClientType | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [docType, setDocType] = useState<string | null>(null);

  const steps = useMemo(() => getWizardSteps(clientType), [clientType]);
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);

  const reset = useCallback(() => {
    setCurrentStep(FIRST_STEP);
    setClientTypeState(null);
    setSelectedCustomerId(null);
    setDocType(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const setClientType = useCallback((type: ClientType) => {
    setClientTypeState(type);
    setSelectedCustomerId((current) => (type === 'existing' ? current : null));
  }, []);

  const goToStep = useCallback((step: WizardStepId) => {
    setCurrentStep((current) => {
      const targetIndex = stepIds.indexOf(step);
      const currentIndex = stepIds.indexOf(current);
      return targetIndex >= 0 && targetIndex < currentIndex ? step : current;
    });
  }, [stepIds]);

  const goNext = useCallback((canAdvance: boolean) => {
    if (!canAdvance) return;
    setCurrentStep((current) => {
      const currentIndex = stepIds.indexOf(current);
      if (currentIndex === stepIds.length - 1) {
        close();
        return current;
      }
      return stepIds[currentIndex + 1];
    });
  }, [stepIds, close]);

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
    docType,
    setClientType,
    setSelectedCustomerId,
    setDocType,
    goToStep,
    goNext,
    goBack,
    close,
  };
}
