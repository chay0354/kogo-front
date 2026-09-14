/**
 * Where a store product's stock actually sits, for the store page's filters.
 *
 * A product's own `branch` is not where its stock is. When a product has size
 * rows the server sets it to the branch of the FIRST row only, and everything
 * synced from the B2C website is stored with no branch at all. Asking only
 * `product.branch` therefore hid every product whose stock lives in size rows
 * from the branch filter, and showed all of them under "משלוח". Both questions
 * have to look at the rows, the way the city filter and the server's own
 * partner scoping already do.
 */
import type { StoreProduct } from '@/types/store';
import type { Branch } from '@/types/branch';

/** The value the branch picker uses for "no branch — delivery". */
export const DELIVERY_BRANCH = 'delivery';

function sizeRowBranchIds(product: StoreProduct): Array<string | null> {
  return (product.size_stocks ?? []).map((row) => row.branch ?? null);
}

/** Branch ids this product holds stock in — its own, plus every size row's. */
export function productBranchIds(product: StoreProduct): Set<string> {
  const ids = new Set<string>();
  if (product.branch) ids.add(product.branch);
  for (const branchId of sizeRowBranchIds(product)) {
    if (branchId) ids.add(branchId);
  }
  return ids;
}

/** True when the product can be delivered: a size row with no branch, or, with
 *  no rows at all, the product itself sitting outside a branch. */
export function productIsDelivery(product: StoreProduct): boolean {
  const rows = product.size_stocks ?? [];
  if (rows.length) return sizeRowBranchIds(product).some((branchId) => branchId == null);
  return !product.branch;
}

export function productMatchesBranch(product: StoreProduct, branchFilter: string): boolean {
  if (branchFilter === 'all') return true;
  if (branchFilter === DELIVERY_BRANCH) return productIsDelivery(product);
  return productBranchIds(product).has(branchFilter);
}

export function productMatchesCity(
  product: StoreProduct,
  cityId: string,
  branches: Branch[],
): boolean {
  if (cityId === 'all') return true;
  const branchIdsInCity = new Set(
    branches.filter((b) => b.city === cityId).map((b) => b.id),
  );
  for (const branchId of productBranchIds(product)) {
    if (branchIdsInCity.has(branchId)) return true;
  }
  return false;
}

/**
 * Units of this product held in the filtered location.
 *
 * With no location filter this is the product's own total. With one, the KPIs
 * would otherwise count a product's whole stock — every branch of it — because
 * one of its rows happened to match, which read as "this city holds 43 units"
 * when it held 22.
 */
export function productStockInLocation(
  product: StoreProduct,
  cityId: string,
  branchFilter: string,
  branches: Branch[],
): number {
  if (cityId === 'all' && branchFilter === 'all') return product.stock_quantity;

  const rows = product.size_stocks ?? [];
  if (!rows.length) {
    // No rows: the product's single number sits wherever the product does.
    return productMatchesCity(product, cityId, branches) && productMatchesBranch(product, branchFilter)
      ? product.stock_quantity
      : 0;
  }

  const branchIdsInCity =
    cityId === 'all'
      ? null
      : new Set(branches.filter((b) => b.city === cityId).map((b) => b.id));

  let total = 0;
  for (const row of rows) {
    const rowBranch = row.branch ?? null;
    if (branchFilter !== 'all') {
      const wanted = branchFilter === DELIVERY_BRANCH ? rowBranch == null : rowBranch === branchFilter;
      if (!wanted) continue;
    }
    if (branchIdsInCity && !(rowBranch && branchIdsInCity.has(rowBranch))) continue;
    total += Number(row.stock_quantity) || 0;
  }
  return total;
}
