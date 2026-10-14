import { describe, expect, it } from 'vitest';
import { MAX_SPECIAL_PRICE, specialPriceValue } from './cardLinkSpecialPrice';

describe('specialPriceValue', () => {
  it('reads a plain price', () => {
    expect(specialPriceValue('260')).toBe(260);
    expect(specialPriceValue(' 249.90 ')).toBe(249.9);
  });

  it('forgives a shekel sign and a thousands comma', () => {
    expect(specialPriceValue('₪260')).toBe(260);
    expect(specialPriceValue('1,200')).toBe(1200);
  });

  it('is empty for an empty box — the catalogue price applies', () => {
    expect(specialPriceValue('')).toBeNull();
    expect(specialPriceValue('   ')).toBeNull();
  });

  it('refuses what cannot be a monthly price', () => {
    expect(specialPriceValue('0')).toBeNull();
    expect(specialPriceValue('-5')).toBeNull();
    expect(specialPriceValue('abc')).toBeNull();
    expect(specialPriceValue(String(MAX_SPECIAL_PRICE + 1))).toBeNull();
  });

  it('keeps two decimals', () => {
    expect(specialPriceValue('260.555')).toBe(260.56);
  });
});
