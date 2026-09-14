import { describe, it, expect } from 'vitest';
import { readableError } from './apiError';

describe('readableError', () => {
  it('falls back when there is no response body', () => {
    expect(readableError(new Error('network'))).toBe('השמירה נכשלה');
    expect(readableError(undefined, 'טעינה נכשלה')).toBe('טעינה נכשלה');
  });

  it('reads DRF detail and error keys', () => {
    expect(readableError({ response: { data: { detail: 'אין הרשאה. נדרש תפקיד מנהל.' } } })).toBe(
      'אין הרשאה. נדרש תפקיד מנהל.',
    );
    expect(readableError({ response: { data: { error: 'נפילה' } } })).toBe('נפילה');
  });

  it('joins field errors into one sentence', () => {
    expect(
      readableError({ response: { data: { name: ['יש להזין שם קטגוריה'], business: ['שדה חובה'] } } }),
    ).toBe('יש להזין שם קטגוריה · שדה חובה');
  });

  it('keeps a plain-string body and ignores an empty one', () => {
    expect(readableError({ response: { data: 'Bad Request' } })).toBe('Bad Request');
    expect(readableError({ response: { data: { name: [] } } })).toBe('השמירה נכשלה');
  });
});
