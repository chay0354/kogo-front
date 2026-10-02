/**
 * What is still missing on the approvals screen, in the order the parent
 * meets it: the health commitment, the terms, the signature.
 */
export type ConsentKey = 'health' | 'terms' | 'signature';

export interface ConsentState {
  healthConsent: boolean;
  /** The terms were opened, scrolled to the end and confirmed. */
  termsReadComplete: boolean;
  termsConsent: boolean;
  signed: boolean;
}

export const CONSENT_ORDER: ConsentKey[] = ['health', 'terms', 'signature'];

/** Every step that is not done yet, with what to say about it. */
export function consentErrors(state: ConsentState): Partial<Record<ConsentKey, string>> {
  const errors: Partial<Record<ConsentKey, string>> = {};
  if (!state.healthConsent) {
    errors.health = 'יש לאשר את ההתחייבות לגבי מצב בריאותי';
  }
  if (!state.termsReadComplete) {
    errors.terms = 'יש לפתוח את התקנון, לגלול עד הסוף ולאשר';
  } else if (!state.termsConsent) {
    errors.terms = 'יש לאשר את התקנון והנהלים';
  }
  if (!state.signed) {
    errors.signature = 'נדרשת חתימה';
  }
  return errors;
}

/** One thing at a time: only the first step that is missing speaks up. */
export function firstMissingConsent(state: ConsentState): Partial<Record<ConsentKey, string>> {
  const errors = consentErrors(state);
  const first = CONSENT_ORDER.find((key) => errors[key]);
  return first ? { [first]: errors[first] } : {};
}
