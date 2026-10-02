import { describe, expect, it } from 'vitest';
import { consentErrors, firstMissingConsent } from './consentCheck';

const nothing = { healthConsent: false, termsReadComplete: false, termsConsent: false, signed: false };
const all = { healthConsent: true, termsReadComplete: true, termsConsent: true, signed: true };

describe('consentErrors', () => {
  it('names every step that is not done', () => {
    expect(consentErrors(nothing)).toEqual({
      health: 'יש לאשר את ההתחייבות לגבי מצב בריאותי',
      terms: 'יש לפתוח את התקנון, לגלול עד הסוף ולאשר',
      signature: 'נדרשת חתימה',
    });
  });

  it('says nothing when all three are done', () => {
    expect(consentErrors(all)).toEqual({});
  });

  it('asks for the tick once the terms were read to the end', () => {
    expect(consentErrors({ ...all, termsConsent: false })).toEqual({ terms: 'יש לאשר את התקנון והנהלים' });
  });

  it('does not take a tick for terms that were not read', () => {
    expect(consentErrors({ ...all, termsReadComplete: false })).toEqual({
      terms: 'יש לפתוח את התקנון, לגלול עד הסוף ולאשר',
    });
  });
});

describe('firstMissingConsent', () => {
  it('speaks only of the first missing step, in the order of the screen', () => {
    expect(firstMissingConsent(nothing)).toEqual({ health: 'יש לאשר את ההתחייבות לגבי מצב בריאותי' });
    expect(firstMissingConsent({ ...nothing, healthConsent: true })).toEqual({
      terms: 'יש לפתוח את התקנון, לגלול עד הסוף ולאשר',
    });
    expect(firstMissingConsent({ ...all, termsConsent: false, signed: false })).toEqual({
      terms: 'יש לאשר את התקנון והנהלים',
    });
    expect(firstMissingConsent({ ...all, signed: false })).toEqual({ signature: 'נדרשת חתימה' });
  });

  it('is empty when nothing is missing', () => {
    expect(firstMissingConsent(all)).toEqual({});
  });
});
