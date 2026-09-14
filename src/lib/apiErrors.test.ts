import { describe, it, expect } from 'vitest';
import { describeApiError } from './apiErrors';

describe('describeApiError', () => {
  it('names the field and says what is wrong, in Hebrew', () => {
    // What a staff member actually hit: clearing the category field showed
    // `{"category":["This field may not be blank."]}` in the toast.
    expect(describeApiError({ category: ['This field may not be blank.'] }))
      .toBe('קטגוריה: אי אפשר להשאיר ריק');
  });

  it('leaves our own Hebrew messages alone', () => {
    const message = 'מחיר מכירה חייב להיות גבוה ממחיר עלות';
    expect(describeApiError({ non_field_errors: [message] })).toBe(message);
  });

  it('joins several fields onto their own lines', () => {
    const text = describeApiError({
      name: ['This field is required.'],
      sale_price: ['A valid number is required.'],
    });
    expect(text.split('\n').sort()).toEqual(['מחיר מכירה: נדרש מספר תקין', 'שם המוצר: שדה חובה']);
  });

  it('fills in the length from the message', () => {
    expect(describeApiError({ size: ['Ensure this field has no more than 100 characters.'] }))
      .toBe('מידות: עד 100 תווים');
  });

  it('reads a plain-string body', () => {
    expect(describeApiError('משהו השתבש')).toBe('משהו השתבש');
  });

  it('unwraps the error key the API uses for one-off failures', () => {
    expect(describeApiError({ error: 'החנות לא מוגדרת' })).toBe('החנות לא מוגדרת');
  });

  it('passes an unknown English message through rather than dropping it', () => {
    expect(describeApiError({ notes: ['Something specific happened.'] }))
      .toBe('הערות: Something specific happened.');
  });

  it('falls back to the axios message when the body says nothing', () => {
    expect(describeApiError(undefined, { message: 'Network Error' })).toBe('Network Error');
    expect(describeApiError({})).toBe('שגיאה לא ידועה');
  });

  it('describes a nested size_stocks error', () => {
    expect(describeApiError({ size_stocks: { 0: { size: ['This field may not be blank.'] } } }))
      .toContain('אי אפשר להשאיר ריק');
  });
});
