import type { Step } from './types';

/**
 * Where a trial goes after the details step.
 *
 * A paid trial (the course charges for it) keeps the full flow — terms, signature,
 * then the card — exactly as before. A free trial goes to a summary screen with one
 * confirm: the parent has typed nothing but names and a date, and there is nothing
 * to sign for a lesson that costs nothing. The backend never received the consent
 * fields on this path anyway; the summary carries a link to the terms instead.
 */
export function trialNextStep(trialLessonIsPaid: boolean): Extract<Step, 'consents' | 'trial_confirm'> {
  return trialLessonIsPaid ? 'consents' : 'trial_confirm';
}
