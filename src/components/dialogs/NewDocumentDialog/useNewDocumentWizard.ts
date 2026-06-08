import { useCallback, useState } from 'react';
import type { ClientType, WizardStep } from './types';

const FIRST_STEP: WizardStep = 1;
const LAST_STEP: WizardStep = 4;

export function useNewDocumentWizard(onClose: () => void) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(FIRST_STEP);
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [docType, setDocType] = useState<string | null>(null);

  const reset = useCallback(() => {
    setCurrentStep(FIRST_STEP);
    setClientType(null);
    setDocType(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep((current) => (step < current ? step : current));
  }, []);

  const goNext = useCallback((canAdvance: boolean) => {
    if (!canAdvance) return;
    setCurrentStep((current) => {
      if (current === LAST_STEP) {
        close();
        return current;
      }
      return (current + 1) as WizardStep;
    });
  }, [close]);

  const goBack = useCallback(() => {
    setCurrentStep((current) => (current === FIRST_STEP ? current : ((current - 1) as WizardStep)));
  }, []);

  return {
    currentStep,
    clientType,
    docType,
    setClientType,
    setDocType,
    goToStep,
    goNext,
    goBack,
    close,
  };
}
