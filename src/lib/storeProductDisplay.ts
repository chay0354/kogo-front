import type { StoreProduct } from '@/types/store';
import type { Branch } from '@/types/branch';
import { coerceBranchFromApi } from '@/lib/storeBranch';

const DELIVERY = 'משלוח';

/**
 * Unique location labels where this product has per-size rows (prefers rows with stock > 0).
 * Uses `size_stocks[].branch_name` when present, otherwise resolves UUIDs via `branches`.
 */
export function getProductStockLocationLabels(
  product: StoreProduct,
  branches?: Branch[] | null,
  where?: { cityId?: string; branchFilter?: string },
): string[] {
  const idToName =
    branches && branches.length > 0 ? new Map(branches.map((b) => [b.id, b.name])) : null;

  // Under a location filter the list answers "where, within what I am looking
  // at". A branch filter that showed every other branch the product sits in
  // read as a filter that did not work.
  const branchFilter = where?.branchFilter ?? 'all';
  const cityId = where?.cityId ?? 'all';
  if (branchFilter === 'delivery') return [DELIVERY];
  if (branchFilter !== 'all') {
    const fromRow = product.size_stocks?.find((row) => row.branch === branchFilter)?.branch_name?.trim();
    return [fromRow || idToName?.get(branchFilter) || product.branch_name || branchFilter];
  }
  const inCity =
    cityId !== 'all' && branches
      ? new Set(branches.filter((b) => b.city === cityId).map((b) => b.id))
      : null;

  const rows = inCity
    ? product.size_stocks?.filter((row) => row.branch && inCity.has(row.branch))
    : product.size_stocks;
  if (Array.isArray(rows) && rows.length > 0) {
    const collect = (onlyWithStock: boolean): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const row of rows) {
        if (onlyWithStock && (Number(row.stock_quantity) || 0) <= 0) continue;
        const bid = coerceBranchFromApi(row.branch as string | null | { id?: string } | undefined);
        const key = bid ?? `__delivery__`;
        if (seen.has(key)) continue;
        seen.add(key);
        const fromRow = row.branch_name?.trim();
        const label =
          (fromRow && fromRow.length > 0 ? fromRow : null) ??
          (bid && idToName?.get(bid)) ??
          (bid ?? DELIVERY);
        out.push(label);
      }
      return out;
    };

    const withStock = collect(true);
    if (withStock.length > 0) return withStock;
    return collect(false);
  }

  return [product.branch_name || DELIVERY];
}
