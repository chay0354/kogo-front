import { describe, expect, test } from 'vitest';

import {
  OTHER_PAYER,
  amountsProblem,
  defaultPayers,
  duplicateParent,
  payerInput,
  payerProblem,
} from '@/lib/paymentSplit';
import type { SplitParent } from '@/lib/paymentLinksApi';

const mother: SplitParent = { id: 'm', name: 'דנה לוי', phone: '0501111111', email: '', is_primary: true };
const father: SplitParent = { id: 'f', name: 'אבי לוי', phone: '0502222222', email: '', is_primary: false };

describe('amountsProblem — the office’s own figures must add up to the month', () => {
  test('halves of 260 are fine', () => {
    expect(amountsProblem(['130', '130'], '260.00')).toBe('');
  });
  test('says how much is missing or over', () => {
    expect(amountsProblem(['130', '120'], '260.00')).toContain('חסרים ₪10.00');
    expect(amountsProblem(['150', '130'], '260.00')).toContain('₪20.00 יותר');
  });
  test('every payer pays at least ₪1, and every box is filled', () => {
    expect(amountsProblem(['259.5', '0.5'], '260')).toContain('לפחות ₪1');
    expect(amountsProblem(['260', ''], '260')).toContain('למלא');
  });
  test('agorot are counted exactly', () => {
    expect(amountsProblem(['111.67', '111.67', '111.66'], '335.00')).toBe('');
  });
});

describe('defaultPayers', () => {
  test('the family’s parents first, then another payer', () => {
    expect(defaultPayers([mother, father], 3).map((p) => p.choice)).toEqual(['m', 'f', OTHER_PAYER]);
  });
  test('a parent already paying is not offered again', () => {
    expect(defaultPayers([mother, father], 1, ['m']).map((p) => p.choice)).toEqual(['f']);
  });
});

describe('a payer', () => {
  test('a parent with a phone is ready; one without is not', () => {
    expect(payerProblem({ choice: 'm', name: '', phone: '', email: '' }, [mother])).toBe('');
    expect(payerProblem({ choice: 'x', name: '', phone: '', email: '' }, [{ ...mother, id: 'x', phone: '' }])).toContain('אין טלפון');
  });
  test('a typed payer needs a name and a phone', () => {
    expect(payerProblem({ choice: OTHER_PAYER, name: 'אבי', phone: '050', email: '' }, [])).toContain('טלפון');
    expect(payerProblem({ choice: OTHER_PAYER, name: 'אבי', phone: '050-222-2222', email: '' }, [])).toBe('');
  });
  test('the same parent twice is caught', () => {
    expect(duplicateParent([{ choice: 'm', name: '', phone: '', email: '' }, { choice: 'm', name: '', phone: '', email: '' }])).toBe(true);
    expect(duplicateParent([{ choice: 'f', name: '', phone: '', email: '' }], ['m'])).toBe(false);
  });
  test('what is sent to the server', () => {
    expect(payerInput({ choice: 'm', name: '', phone: '', email: '' })).toEqual({ parent_id: 'm' });
    expect(payerInput({ choice: OTHER_PAYER, name: ' אבי ', phone: '0502222222', email: '' })).toEqual({ name: 'אבי', phone: '0502222222' });
  });
});
