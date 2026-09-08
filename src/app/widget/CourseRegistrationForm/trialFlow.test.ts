import { describe, expect, it } from 'vitest';
import { trialNextStep } from './trialFlow';

describe('trialNextStep', () => {
  it('sends a paid trial through the full consents flow', () => {
    expect(trialNextStep(true)).toBe('consents');
  });

  it('sends a free trial to the summary-and-confirm screen', () => {
    expect(trialNextStep(false)).toBe('trial_confirm');
  });
});
