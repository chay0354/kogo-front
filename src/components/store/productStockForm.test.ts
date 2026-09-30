/**
 * The edit form's stock rows: one per size and place, a row without a size is
 * a real row, and the save says what the form loaded.
 */
import { describe, expect, it } from 'vitest';
import type { StoreProduct } from '@/types/store';
import type { Branch } from '@/types/branch';
import { cleanRows, listedSizesWithoutRows, loadRows, stockExpected } from './productStockForm';

const CENTER = '5c29b92c-8d1a-4431-afe9-47aa94bbc041';
const branches = [{ id: CENTER, name: 'סניף מרכז' }] as Branch[];

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 'p1', name: 'חולצה', category: 'ביגוד', size: '', cost_price: 40, sale_price: 90,
    stock_quantity: 9, min_stock_alert: 1, size_stocks: [], ...overrides,
  } as unknown as StoreProduct;
}

describe('loadRows', () => {
  it('keeps each row with a stable key and its place', () => {
    const rows = loadRows(product({
      size_stocks: [
        { id: 'a', size: 'M', stock_quantity: 6, sort_order: 0, branch: null },
        { id: 'b', size: 'M', stock_quantity: 3, sort_order: 1, branch: CENTER },
      ],
    }));
    expect(rows.map((r) => [r.uid, r.size, r.branch, r.stock_quantity])).toEqual([
      ['a', 'M', null, 6],
      ['b', 'M', CENTER, 3],
    ]);
  });

  it('shows two rows of one size and place as one, with both quantities', () => {
    const rows = loadRows(product({
      size_stocks: [
        { id: 'a', size: 'M', stock_quantity: 6, sort_order: 0, branch: null },
        { id: 'c', size: 'M', stock_quantity: 2, sort_order: 2, branch: null },
      ],
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].stock_quantity).toBe(8);
  });

  it('does not turn listed sizes into rows', () => {
    const legacy = product({ size: 'S,M,L', size_stocks: [] });
    expect(loadRows(legacy)).toEqual([]);
    expect(listedSizesWithoutRows(legacy)).toEqual(['S', 'M', 'L']);
  });
});

describe('cleanRows', () => {
  const row = (size: string, branch: string | null, stock_quantity: number) =>
    ({ uid: `${size}-${branch}`, size, branch, stock_quantity });

  it('keeps a row with a place and no size — stock per location without sizes', () => {
    const { rows, error } = cleanRows([row('', CENTER, 7), row('', null, 12)], branches);
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { size: '', stock_quantity: 7, sort_order: 0, branch: CENTER },
      { size: '', stock_quantity: 12, sort_order: 1, branch: null },
    ]);
  });

  it('drops an entirely empty row', () => {
    expect(cleanRows([row('', null, 0), row('M', null, 2)], branches).rows).toHaveLength(1);
  });

  it('says which size and place repeat', () => {
    const { error } = cleanRows([row('M', CENTER, 1), row(' M ', CENTER, 2)], branches);
    expect(error).toContain('המידה "M" בסניף מרכז מופיעה פעמיים');
    expect(cleanRows([row('', null, 1), row('', null, 2)], branches).error).toContain('בלי מידה במשלוח');
  });

  it('refuses a size longer than the database holds', () => {
    expect(cleanRows([row('X'.repeat(21), null, 1)], branches).error).toContain('עד 20 תווים');
  });
});

describe('stockExpected', () => {
  it('is the rows and the number as the form opened', () => {
    const p = product({ stock_quantity: 9, size_stocks: [{ id: 'a', size: '', stock_quantity: 9, sort_order: 0, branch: CENTER }] });
    expect(stockExpected(p, loadRows(p), branches)).toEqual({
      rows: [{ size: '', branch: CENTER, stock_quantity: 9 }],
      stock_quantity: 9,
    });
  });
});
