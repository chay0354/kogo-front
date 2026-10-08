import { describe, expect, it } from 'vitest';
import {
  anotherClassDescription,
  anotherClassExample,
  anotherClassKind,
  anotherClassProblem,
  anotherClassValueLabel,
} from './anotherClassDiscount';

describe('anotherClassKind', () => {
  it('reads the kind the server sends', () => {
    expect(anotherClassKind({ discount_type: 'fixed' })).toBe('fixed');
    expect(anotherClassKind({ discount_type: 'fixed_final_price' })).toBe('fixed_final_price');
  });

  it('means the price when an older server does not say', () => {
    expect(anotherClassKind({})).toBe('fixed_final_price');
    expect(anotherClassKind(null)).toBe('fixed_final_price');
    expect(anotherClassKind({ discount_type: 'percentage' })).toBe('fixed_final_price');
  });
});

describe('the words on the card', () => {
  it('names the figure by its kind', () => {
    expect(anotherClassValueLabel('fixed')).toBe('הנחה על כל חוג נוסף');
    expect(anotherClassValueLabel('fixed_final_price')).toBe('מחיר לחוג נוסף');
  });

  it('says an amount off adds up, and a price is final', () => {
    expect(anotherClassDescription('fixed')).toContain('מצטרף להנחות האחרות');
    expect(anotherClassDescription('fixed_final_price')).toContain('המחיר הסופי');
  });
});

describe('anotherClassExample', () => {
  it('takes the shekels off a class', () => {
    expect(anotherClassExample('fixed', 10)).toBe('לדוגמה: חוג של ₪350 יעלה ₪340 כחוג נוסף. עם הנחת אח — עוד פחות.');
    expect(anotherClassExample('fixed', 10, 260)).toContain('₪250');
  });

  it('shows the price itself', () => {
    expect(anotherClassExample('fixed_final_price', 300)).toBe('לדוגמה: חוג של ₪350 יעלה ₪300 כחוג נוסף, גם אם יש אח.');
  });

  it('says nothing for nothing, or for a price that is no discount', () => {
    expect(anotherClassExample('fixed', 0)).toBe('');
    expect(anotherClassExample('fixed_final_price', 0)).toBe('');
    expect(anotherClassExample('fixed_final_price', 400)).toBe('');
  });

  it('never shows a class below nothing', () => {
    expect(anotherClassExample('fixed', 500)).toContain('יעלה ₪0');
  });
});

describe('anotherClassProblem', () => {
  it('lets a real sum through', () => {
    expect(anotherClassProblem('fixed', 10)).toBe('');
    expect(anotherClassProblem('fixed_final_price', 300)).toBe('');
  });

  it('stops nothing and less than nothing, in the words of the kind', () => {
    expect(anotherClassProblem('fixed', 0)).toBe('סכום ההנחה חייב להיות גדול מ-0');
    expect(anotherClassProblem('fixed_final_price', 0)).toBe('מחיר לחוג נוסף חייב להיות גדול מ-0');
    expect(anotherClassProblem('fixed', -5)).toBe('הסכום לא יכול להיות שלילי');
    expect(anotherClassProblem('fixed', Number.NaN)).toBe('הסכום לא יכול להיות שלילי');
  });
});
