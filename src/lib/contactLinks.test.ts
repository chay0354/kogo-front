import { describe, expect, it } from 'vitest';
import { telHref, whatsappHref, whatsappNumber } from './contactLinks';

/**
 * These were the register screen's private rules before three screens needed
 * them. The cases below are the ones actually found in the customer data —
 * dashes, spaces, a leading plus, and the country code already there.
 */
describe('whatsappNumber', () => {
  it('turns a local leading zero into the country code', () => {
    expect(whatsappNumber('052-123-4567')).toBe('972521234567');
  });

  it('leaves a number that already carries the country code alone', () => {
    expect(whatsappNumber('+972 52 123 4567')).toBe('972521234567');
  });

  it('does not invent a country code for a foreign number', () => {
    // 44… is not ours to rewrite; prefixing 972 would dial nowhere.
    expect(whatsappNumber('447911123456')).toBe('447911123456');
  });

  it('survives an empty number without throwing', () => {
    expect(whatsappNumber('')).toBe('');
  });
});

describe('whatsappHref', () => {
  it('opens the conversation and never pre-sends a message', () => {
    const href = whatsappHref('052-123-4567');
    expect(href).toBe('https://wa.me/972521234567');
    expect(href).not.toContain('text=');
  });
});

describe('telHref', () => {
  it('keeps a leading plus so an international number still dials', () => {
    expect(telHref('+972 52-123-4567')).toBe('tel:+972521234567');
  });

  it('strips the separators a number was typed with', () => {
    expect(telHref('052-123-4567')).toBe('tel:0521234567');
  });
});
