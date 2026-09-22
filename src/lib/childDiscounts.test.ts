/**
 * "Why does this family pay 225 and not 260?" — the screen has to answer that
 * from what the standing order already carries, and stay quiet when there is
 * nothing to answer.
 */
import { describe, expect, it } from 'vitest';
import { childDiscounts } from './childDiscounts';

const order = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  status: 'active',
  course_name: 'מחול א-ב-ג',
  base_amount: '260.00',
  discount_amount: '35.00',
  amount: '225.00',
  discount_details: [{ name: 'הנחת אח שני', type: 'percent', value: '10' }],
  ...over,
});

describe('childDiscounts', () => {
  it('shows the price before, what came off, and what is charged', () => {
    const [row] = childDiscounts([order()]);
    expect(row.base).toBe(260);
    expect(row.discount).toBe(35);
    expect(row.final).toBe(225);
    expect(row.courseName).toBe('מחול א-ב-ג');
  });

  it('names each discount and how it was worked out', () => {
    const [row] = childDiscounts([order()]);
    expect(row.lines).toEqual([{ name: 'הנחת אח שני', detail: '10%' }]);
  });

  it('reads a discount given in shekels as shekels', () => {
    const [row] = childDiscounts([order({ discount_details: [{ name: 'הנחה מיוחדת', type: 'fixed', value: '30' }] })]);
    expect(row.lines[0].detail).toBe('30 ₪');
  });

  it('keeps the reason beside the amount when one was written', () => {
    const [row] = childDiscounts([
      order({ discount_details: [{ name: 'הנחת מנהל', type: 'fixed', value: '50', reason: 'אחות במערכת' }] }),
    ]);
    expect(row.lines[0].detail).toBe('50 ₪ · אחות במערכת');
  });

  it('says nothing for a family that simply pays full price', () => {
    expect(childDiscounts([order({ discount_amount: '0.00', discount_details: [] })])).toEqual([]);
  });

  it('ignores an order that is no longer running', () => {
    expect(childDiscounts([order({ status: 'cancelled' })])).toEqual([]);
  });

  it('still shows a discount whose amount the old record never stored', () => {
    const [row] = childDiscounts([order({ discount_amount: '0.00' })]);
    expect(row.lines).toHaveLength(1);
  });

  it('survives missing fields and a missing list', () => {
    expect(childDiscounts([{ status: 'active', discount_amount: 'nonsense' } as never])).toEqual([]);
    expect(childDiscounts(undefined as never)).toEqual([]);
  });
});
