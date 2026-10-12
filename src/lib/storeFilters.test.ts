import { describe, it, expect } from 'vitest';
import {
  firstRowIndexInLocation,
  productIsDelivery,
  productIsLowStockInLocation,
  productMatchesBranch,
  productMatchesCity,
  productStockInLocation,
  startingLocationFor,
} from './storeFilters';
import { getProductStockLocationLabels } from './storeProductDisplay';
import type { StoreProduct, ProductSizeStock } from '@/types/store';
import type { Branch } from '@/types/branch';

const NORTH = 'branch-north';
const SOUTH = 'branch-south';
const HAIFA = 'city-haifa';
const TEL_AVIV = 'city-tel-aviv';

const branches = [
  { id: NORTH, name: 'סניף צפון', city: HAIFA },
  { id: SOUTH, name: 'סניף דרום', city: TEL_AVIV },
] as unknown as Branch[];

function product(over: Partial<StoreProduct> & { size_stocks?: ProductSizeStock[] }): StoreProduct {
  return {
    id: 'p1',
    name: 'מוצר',
    category: 'ביגוד',
    size: null,
    cost_price: 10,
    sale_price: 100,
    branch: null,
    branch_name: null,
    stock_quantity: 0,
    min_stock_alert: 3,
    is_low_stock: false,
    image_url: null,
    notes: '',
    is_active: true,
    profit_margin: 0,
    created_at: '',
    updated_at: '',
    ...over,
  } as StoreProduct;
}

/** What the server leaves behind: `branch` is the FIRST size row's branch. */
const splitAcrossBranches = product({
  branch: NORTH,
  stock_quantity: 9,
  size_stocks: [
    { size: 'S', stock_quantity: 2, branch: NORTH },
    { size: 'M', stock_quantity: 7, branch: SOUTH },
  ],
});

/** Synced from the website: no branch of its own, all stock in rows. */
const syncedFromWebsite = product({
  branch: null,
  stock_quantity: 4,
  size_stocks: [{ size: 'L', stock_quantity: 4, branch: SOUTH }],
});

/** No rows at all — the legacy single number, sold by delivery. */
const deliveryOnly = product({ branch: null, stock_quantity: 40 });

const mixed = product({
  branch: NORTH,
  stock_quantity: 5,
  size_stocks: [
    { size: '', stock_quantity: 3, branch: NORTH },
    { size: '', stock_quantity: 2, branch: null },
  ],
});

describe('productMatchesBranch', () => {
  it('finds stock a product holds only through a size row', () => {
    expect(productMatchesBranch(splitAcrossBranches, SOUTH)).toBe(true);
    expect(productMatchesBranch(syncedFromWebsite, SOUTH)).toBe(true);
  });

  it('still matches the branch stored on the product itself', () => {
    expect(productMatchesBranch(splitAcrossBranches, NORTH)).toBe(true);
  });

  it('does not match a branch the product has no stock in', () => {
    expect(productMatchesBranch(syncedFromWebsite, NORTH)).toBe(false);
    expect(productMatchesBranch(deliveryOnly, NORTH)).toBe(false);
  });

  it('"all" matches everything', () => {
    for (const p of [splitAcrossBranches, syncedFromWebsite, deliveryOnly, mixed]) {
      expect(productMatchesBranch(p, 'all')).toBe(true);
    }
  });
});

describe('delivery', () => {
  it('is a row with no branch, or no rows and no branch', () => {
    expect(productIsDelivery(deliveryOnly)).toBe(true);
    expect(productIsDelivery(mixed)).toBe(true);
  });

  it('is not merely an empty branch field', () => {
    // The bug: every website-synced product has branch === null, and used to
    // show up under "משלוח" although its stock sits in a branch.
    expect(syncedFromWebsite.branch).toBeNull();
    expect(productIsDelivery(syncedFromWebsite)).toBe(false);
    expect(productMatchesBranch(syncedFromWebsite, 'delivery')).toBe(false);
  });

  it('is not true for a product stocked only in branches', () => {
    expect(productIsDelivery(splitAcrossBranches)).toBe(false);
  });
});

describe('productMatchesCity', () => {
  it('follows size rows as well as the product branch', () => {
    expect(productMatchesCity(splitAcrossBranches, TEL_AVIV, branches)).toBe(true);
    expect(productMatchesCity(syncedFromWebsite, TEL_AVIV, branches)).toBe(true);
    expect(productMatchesCity(syncedFromWebsite, HAIFA, branches)).toBe(false);
  });

  it('"all" matches everything', () => {
    expect(productMatchesCity(deliveryOnly, 'all', branches)).toBe(true);
  });
});

describe('productStockInLocation', () => {
  it('is the product total when nothing is filtered', () => {
    expect(productStockInLocation(splitAcrossBranches, 'all', 'all', branches)).toBe(9);
  });

  it('counts only the filtered branch, not the whole product', () => {
    expect(productStockInLocation(splitAcrossBranches, 'all', SOUTH, branches)).toBe(7);
    expect(productStockInLocation(splitAcrossBranches, 'all', NORTH, branches)).toBe(2);
  });

  it('counts only the filtered city', () => {
    expect(productStockInLocation(splitAcrossBranches, HAIFA, 'all', branches)).toBe(2);
    expect(productStockInLocation(splitAcrossBranches, TEL_AVIV, 'all', branches)).toBe(7);
  });

  it('counts delivery rows for the delivery filter', () => {
    expect(productStockInLocation(mixed, 'all', 'delivery', branches)).toBe(2);
  });

  it('keeps the single number for a product with no rows', () => {
    expect(productStockInLocation(deliveryOnly, 'all', 'delivery', branches)).toBe(40);
    expect(productStockInLocation(deliveryOnly, 'all', NORTH, branches)).toBe(0);
  });
});

describe('productIsLowStockInLocation', () => {
  const alertAt3 = product({
    min_stock_alert: 3,
    is_low_stock: false, // 9 units in total is comfortably above the threshold
    stock_quantity: 9,
    size_stocks: [
      { size: 'S', stock_quantity: 2, branch: NORTH },
      { size: 'M', stock_quantity: 7, branch: SOUTH },
    ],
  });

  it('uses the server flag when nothing is filtered', () => {
    expect(productIsLowStockInLocation(alertAt3, 'all', 'all', branches)).toBe(false);
  });

  it('is low in the branch that is nearly out, even when the total looks fine', () => {
    expect(productIsLowStockInLocation(alertAt3, 'all', NORTH, branches)).toBe(true);
  });

  it('is not low in the branch that is well stocked', () => {
    expect(productIsLowStockInLocation(alertAt3, 'all', SOUTH, branches)).toBe(false);
  });

  it('follows a city filter too', () => {
    expect(productIsLowStockInLocation(alertAt3, HAIFA, 'all', branches)).toBe(true);
    expect(productIsLowStockInLocation(alertAt3, TEL_AVIV, 'all', branches)).toBe(false);
  });

  it('counts a product with no stock in the location as low', () => {
    expect(productIsLowStockInLocation(deliveryOnly, 'all', NORTH, branches)).toBe(true);
  });
});

// Owner, 12.10.2026: "אני מסנן לפי ראש העין, וזה מראה לי לפי סניפים אחרים."
describe('the location shown under a filter', () => {
  it('with no filter lists every branch that holds stock', () => {
    expect(getProductStockLocationLabels(splitAcrossBranches, branches)).toEqual(['סניף צפון', 'סניף דרום']);
  });

  it('under a branch filter names that branch only', () => {
    expect(
      getProductStockLocationLabels(splitAcrossBranches, branches, { branchFilter: NORTH }),
    ).toEqual(['סניף צפון']);
  });

  it('names the filtered branch even when it has run out there', () => {
    const outInNorth = product({
      branch: NORTH,
      stock_quantity: 7,
      size_stocks: [
        { size: 'S', stock_quantity: 0, branch: NORTH },
        { size: 'M', stock_quantity: 7, branch: SOUTH },
      ],
    });
    // It used to answer "סניף דרום" — the one place that had stock.
    expect(getProductStockLocationLabels(outInNorth, branches, { branchFilter: NORTH })).toEqual(['סניף צפון']);
  });

  it('under a city filter lists that city\'s branches only', () => {
    expect(
      getProductStockLocationLabels(splitAcrossBranches, branches, { cityId: TEL_AVIV }),
    ).toEqual(['סניף דרום']);
  });

  it('under the delivery filter says delivery', () => {
    expect(getProductStockLocationLabels(mixed, branches, { branchFilter: 'delivery' })).toEqual(['משלוח']);
  });

  it('a product with one number and no rows is named by its own branch', () => {
    const flat = product({ branch: NORTH, branch_name: 'סניף צפון', stock_quantity: 3 });
    expect(getProductStockLocationLabels(flat, branches, { branchFilter: NORTH })).toEqual(['סניף צפון']);
  });
});

describe('where a product\'s dialog opens under the page filter', () => {
  it('opens on the filtered branch when the product is held there', () => {
    expect(startingLocationFor(splitAcrossBranches, NORTH)).toBe(NORTH);
    expect(startingLocationFor(mixed, 'delivery')).toBe('delivery');
  });

  it('opens on everything when there is no filter, or nothing of it there', () => {
    expect(startingLocationFor(splitAcrossBranches, 'all')).toBe('all');
    expect(startingLocationFor(splitAcrossBranches, undefined)).toBe('all');
    expect(startingLocationFor(syncedFromWebsite, NORTH)).toBe('all');
    expect(startingLocationFor(deliveryOnly, NORTH)).toBe('all');
  });

  it('starts on the first row of the branch that has stock', () => {
    const rows = [
      { size: 'S', stock_quantity: 4, branch: SOUTH },
      { size: 'S', stock_quantity: 0, branch: NORTH },
      { size: 'M', stock_quantity: 2, branch: NORTH },
    ];
    expect(firstRowIndexInLocation(rows, NORTH)).toBe(2);
    expect(firstRowIndexInLocation(rows, SOUTH)).toBe(0);
    expect(firstRowIndexInLocation(rows, 'all')).toBe(0);
  });

  it('falls back to the branch\'s first row, then to the first row of all', () => {
    const rows = [
      { size: 'S', stock_quantity: 4, branch: SOUTH },
      { size: 'S', stock_quantity: 0, branch: NORTH },
    ];
    expect(firstRowIndexInLocation(rows, NORTH)).toBe(1);
    expect(firstRowIndexInLocation(rows, 'somewhere-else')).toBe(0);
    expect(firstRowIndexInLocation([], NORTH)).toBe(0);
  });
});
