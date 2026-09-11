/**
 * The message a failed event request leaves the user with. The axios instance
 * is mocked: nothing here calls the server.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ default: {} }));

import { eventApiError } from './eventUtils';

const failed = (status: number, data: unknown) => ({ response: { status, data } });

describe('eventApiError', () => {
  it("passes on the server's error or detail", () => {
    const held = 'השכירות שייכת להסכם השכירות של דנה לוי. יש לנתק אותה מההסכם לפני מחיקה.';
    expect(eventApiError(failed(400, { error: held }), 'מחיקה נכשלה')).toBe(held);
    expect(eventApiError(failed(403, { detail: 'אין הרשאה לסניף הזה' }), 'נכשל')).toBe('אין הרשאה לסניף הזה');
  });

  it('passes on the first field error', () => {
    expect(eventApiError(failed(400, { branch: ['יש לבחור סניף'] }), 'נכשל')).toBe('יש לבחור סניף');
    expect(eventApiError(failed(400, { city: ['עיר נדרשת'], studio: ['תפוס'] }), 'נכשל')).toBe('עיר נדרשת');
  });

  it('prefers error and detail over field errors', () => {
    expect(eventApiError(failed(400, { branch: ['א'], error: 'ב' }), 'נכשל')).toBe('ב');
  });

  it('falls back when the server said nothing usable', () => {
    expect(eventApiError(new Error('offline'), 'שגיאה ביצירת האירוע')).toBe('שגיאה ביצירת האירוע');
    expect(eventApiError(null, 'נכשל')).toBe('נכשל');
    expect(eventApiError(failed(500, '<html>boom</html>'), 'נכשל')).toBe('נכשל');
    expect(eventApiError(failed(400, {}), 'נכשל')).toBe('נכשל');
    expect(eventApiError(failed(400, { branch: [] }), 'נכשל')).toBe('נכשל');
  });
});
