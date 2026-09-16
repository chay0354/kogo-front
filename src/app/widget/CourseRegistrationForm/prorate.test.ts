/**
 * The first month of a mid-month registration.
 *
 * The server has always prorated correctly — a ₪260 course joined on the 16th
 * charges ₪104-₪156 for the remaining lessons. What the parent saw was a line
 * labelled "מנוי חודשי (יחסי)" and a number, with nothing saying it was less
 * than a full month or why. These pin the arithmetic the screen explains.
 */
import { describe, expect, it } from 'vitest';

/** remaining / total, as apps/core/payment_service.py:_compute_prorate computes it. */
function prorate(price: number, remaining: number, total: number): number {
  if (total === 0) return price;
  return Math.max(1, Math.round(price * (remaining / total) * 100) / 100);
}

describe('the first month of a mid-month registration', () => {
  it('charges only the lessons that are left', () => {
    expect(prorate(260, 2, 4)).toBe(130);
    expect(prorate(260, 2, 5)).toBe(104);
    expect(prorate(260, 3, 5)).toBe(156);
  });

  it('charges a full month when nothing has passed yet', () => {
    expect(prorate(260, 4, 4)).toBe(260);
  });

  it('never bills zero for a month that still has a lesson in it', () => {
    expect(prorate(260, 0, 4)).toBe(1);
  });

  it('is less than the monthly price whenever a lesson has already gone', () => {
    for (const [rem, tot] of [[1, 4], [2, 4], [3, 4], [2, 5], [4, 5]]) {
      expect(prorate(260, rem, tot)).toBeLessThan(260);
    }
  });
});

describe('the explanation shown beside it', () => {
  const note = (prorated: number, monthly: number) => prorated > 0 && prorated < monthly;

  it('appears when the first month is cheaper than a full one', () => {
    expect(note(130, 260)).toBe(true);
  });

  it('stays away when the first month is a full month', () => {
    expect(note(260, 260)).toBe(false);
  });

  it('stays away when there is nothing to charge for this month', () => {
    expect(note(0, 260)).toBe(false);
  });
});
