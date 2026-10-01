import { describe, expect, it, vi } from 'vitest';
import {
  VAT_PERCENT,
  agorotAmount,
  agorotShekels,
  chargeBreakdown,
  chargeWhatsAppMessage,
  chargeWhatsAppUrl,
  copyText,
  parseAmountAgorot,
} from './businessCharge';

describe('parseAmountAgorot', () => {
  it('reads a typed sum to the agora', () => {
    expect(parseAmountAgorot('100')).toBe(10000);
    expect(parseAmountAgorot(' 4.24 ')).toBe(424);
    expect(parseAmountAgorot('0.5')).toBe(50);
    expect(parseAmountAgorot('.5')).toBe(50);
    expect(parseAmountAgorot('12.')).toBe(1200);
  });

  it('rounds a third decimal half up, without float drift', () => {
    expect(parseAmountAgorot('1.005')).toBe(101);
    expect(parseAmountAgorot('1.004')).toBe(100);
    expect(parseAmountAgorot('1.0049')).toBe(100);
    expect(parseAmountAgorot('0.295')).toBe(30);
  });

  it('refuses what is not a positive plain number', () => {
    for (const bad of ['', '   ', '.', '0', '0.00', '-5', '1,200', '12,5', '1e3', 'abc', '₪100']) {
      expect(parseAmountAgorot(bad)).toBeNull();
    }
    expect(parseAmountAgorot(null)).toBeNull();
    expect(parseAmountAgorot(undefined)).toBeNull();
  });
});

describe('chargeBreakdown', () => {
  it('uses the 18% rate', () => {
    expect(VAT_PERCENT).toBe(18);
  });

  it('adds VAT to a sum typed before VAT: 100 → 118', () => {
    expect(chargeBreakdown('100', 'net')).toEqual({ net: 10000, vat: 1800, gross: 11800 });
  });

  it('rounds the VAT to the agora: 4.24 → 5.00', () => {
    const split = chargeBreakdown('4.24', 'net');
    expect(split).toEqual({ net: 424, vat: 76, gross: 500 });
    expect(agorotAmount(split!.gross)).toBe('5.00');
  });

  it('rounds half an agora of VAT up', () => {
    // 0.25 × 18% = 4.5 agorot.
    expect(chargeBreakdown('0.25', 'net')).toEqual({ net: 25, vat: 5, gross: 30 });
  });

  it('splits a sum typed with VAT, keeping the total as typed', () => {
    expect(chargeBreakdown('118', 'gross')).toEqual({ net: 10000, vat: 1800, gross: 11800 });
    expect(chargeBreakdown('5.00', 'gross')).toEqual({ net: 424, vat: 76, gross: 500 });
    expect(chargeBreakdown('100', 'gross')).toEqual({ net: 8475, vat: 1525, gross: 10000 });
  });

  it('always adds up: net + VAT = total', () => {
    for (const raw of ['1', '9.99', '33.33', '1234.56', '99999.99']) {
      for (const mode of ['net', 'gross'] as const) {
        const split = chargeBreakdown(raw, mode)!;
        expect(split.net + split.vat).toBe(split.gross);
      }
    }
  });

  it('has nothing to show for an empty or invalid sum', () => {
    expect(chargeBreakdown('', 'net')).toBeNull();
    expect(chargeBreakdown('abc', 'gross')).toBeNull();
    expect(chargeBreakdown('0', 'gross')).toBeNull();
  });
});

describe('money as text', () => {
  it('writes the API amount with two decimals', () => {
    expect(agorotAmount(11800)).toBe('118.00');
    expect(agorotAmount(424)).toBe('4.24');
    expect(agorotAmount(5)).toBe('0.05');
  });

  it('writes the on-screen sum with the shekel sign and agorot', () => {
    expect(agorotShekels(11800)).toBe('₪118.00');
    expect(agorotShekels(123456)).toBe('₪1,234.56');
  });
});

describe('chargeWhatsAppUrl', () => {
  it('turns 05X… into 9725X…', () => {
    expect(chargeWhatsAppUrl('050-1234567', 'x')).toBe('https://wa.me/972501234567?text=x');
    expect(chargeWhatsAppUrl('0527654321', 'x')).toBe('https://wa.me/972527654321?text=x');
    expect(chargeWhatsAppUrl('+972 54 123 4567', 'x')).toBe('https://wa.me/972541234567?text=x');
  });

  it('opens WhatsApp without a recipient when there is no valid mobile number', () => {
    expect(chargeWhatsAppUrl('', 'x')).toBe('https://wa.me/?text=x');
    expect(chargeWhatsAppUrl(null, 'x')).toBe('https://wa.me/?text=x');
    expect(chargeWhatsAppUrl(undefined, 'x')).toBe('https://wa.me/?text=x');
    expect(chargeWhatsAppUrl('03-1234567', 'x')).toBe('https://wa.me/?text=x');
    expect(chargeWhatsAppUrl('12345', 'x')).toBe('https://wa.me/?text=x');
  });

  it('carries the Hebrew message and the link, encoded', () => {
    const message = chargeWhatsAppMessage({ customerName: 'דנה לוי', amount: '₪118.00', url: 'https://kogo.example/pay/abc' });
    const href = chargeWhatsAppUrl('0501234567', message);
    expect(href.startsWith('https://wa.me/972501234567?text=')).toBe(true);
    expect(decodeURIComponent(href.split('?text=')[1])).toBe(message);
    expect(href).not.toContain(' ');
  });
});

describe('chargeWhatsAppMessage', () => {
  it('greets by name, says the sum and gives the link', () => {
    expect(chargeWhatsAppMessage({ customerName: ' דנה לוי ', amount: '₪118.00', url: 'https://kogo.example/pay/abc' })).toBe(
      ['שלום דנה לוי,', 'מצורף קישור לתשלום מאובטח על סך ₪118.00:', 'https://kogo.example/pay/abc', 'תודה, קוגומלו'].join('\n'),
    );
  });

  it('still reads well without a name or a sum', () => {
    expect(chargeWhatsAppMessage({ url: 'https://kogo.example/pay/abc' })).toBe(
      ['שלום,', 'מצורף קישור לתשלום מאובטח:', 'https://kogo.example/pay/abc', 'תודה, קוגומלו'].join('\n'),
    );
  });
});

describe('copyText', () => {
  it('uses the clipboard when there is one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fallback = vi.fn(() => true);
    await expect(copyText('link', fallback, { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('link');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const fallback = vi.fn(() => true);
    await expect(copyText('link', fallback, { writeText })).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('falls back when there is no clipboard at all', async () => {
    const fallback = vi.fn(() => true);
    await expect(copyText('link', fallback, null)).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing worked', async () => {
    await expect(copyText('link', () => false, null)).resolves.toBe(false);
    await expect(copyText('link', () => { throw new Error('no document'); }, null)).resolves.toBe(false);
  });
});
