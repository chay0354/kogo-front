/**
 * The stock rows of the "ערוך מוצר" form: what it loads, what it sends, and
 * what it tells the server it loaded.
 *
 * A row is one size at one place (a branch, or משלוח when there is none). A
 * row with no size is a real row too: a product without sizes keeping its
 * stock per location.
 *
 * The server updates rows in place and, told what the form loaded
 * (`stock_expected`), keeps a row the office did not touch as it is now — a
 * sale since the form opened is not undone — and refuses a row the office did
 * change if something moved it meanwhile (kogo-back apps/store/serializers.py).
 */
import type { Branch } from '@/types/branch';
import type { ProductSizeStock, StoreProduct } from '@/types/store';
import { coerceBranchFromApi, resolveStoreBranchId } from '@/lib/storeBranch';

export interface StockRowDraft extends ProductSizeStock {
  /** Stable React key: the row must not be rebuilt while it is typed into. */
  uid: string;
}

export interface SentRow {
  size: string;
  stock_quantity: number;
  sort_order: number;
  branch: string | null;
}

let counter = 0;
export function newRowUid(): string {
  counter += 1;
  return `row-${counter}`;
}

export function rowKey(size: string, branch: string | null | undefined): string {
  return `${(size || '').trim()}\u0000${branch ?? ''}`;
}

/**
 * The rows as the server holds them, one per size and place. Two rows for the
 * same size and place (the database allows it when the place is משלוח) are
 * shown as one, with both quantities — the save leaves one row.
 */
export function loadRows(product: StoreProduct | null): StockRowDraft[] {
  if (!product || !Array.isArray(product.size_stocks)) return [];
  const byKey = new Map<string, StockRowDraft>();
  const sorted = [...product.size_stocks].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
  );
  for (const row of sorted) {
    const branch = coerceBranchFromApi(row.branch);
    const key = rowKey(row.size, branch);
    const quantity = Number(row.stock_quantity) || 0;
    const existing = byKey.get(key);
    if (existing) {
      existing.stock_quantity += quantity;
      continue;
    }
    byKey.set(key, {
      uid: row.id || newRowUid(),
      id: row.id,
      size: (row.size || '').trim(),
      stock_quantity: quantity,
      sort_order: byKey.size,
      branch,
    });
  }
  return [...byKey.values()];
}

/**
 * Sizes a product lists (the old CSV) without keeping stock per size. They are
 * shown, not turned into rows: turning them into rows on open put the whole
 * stock on the first size and made every save convert the product.
 */
export function listedSizesWithoutRows(product: StoreProduct | null): string[] {
  if (!product || (product.size_stocks?.length ?? 0) > 0) return [];
  return (product.size || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** What the form loaded, sent with the save. */
export function stockExpected(product: StoreProduct, loaded: StockRowDraft[], branches: Branch[]) {
  return {
    rows: loaded.map((row) => ({
      size: row.size,
      branch: resolveStoreBranchId(row.branch, branches) ?? coerceBranchFromApi(row.branch),
      stock_quantity: Number(row.stock_quantity) || 0,
    })),
    stock_quantity: Number(product.stock_quantity) || 0,
  };
}

/**
 * The rows to send, or the reason the form cannot be saved as it is. A new
 * row with neither a size nor a quantity is dropped; a row with a quantity
 * and no size is kept (stock per location without sizes).
 */
export function cleanRows(
  rows: StockRowDraft[],
  branches: Branch[],
): { rows: SentRow[]; error?: string } {
  const out: SentRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const size = (row.size || '').trim();
    const rawBranch = coerceBranchFromApi(row.branch);
    const quantity = Math.max(0, Math.floor(Number(row.stock_quantity) || 0));
    // A new row left without a size or a quantity is one nobody filled in. A
    // row that came from the server stays even at 0: dropping it removes it.
    if (!size && quantity === 0 && !row.id) continue;
    if (size.length > 20) {
      return { rows: [], error: `המידה "${size}" ארוכה מדי — עד 20 תווים.` };
    }
    const branch = resolveStoreBranchId(row.branch, branches);
    if (rawBranch && branch == null) {
      return {
        rows: [],
        error: size
          ? `מיקום לא תקף למידה "${size}". בחרו מיקום מהרשימה או משלוח.`
          : 'מיקום לא תקף בשורת המלאי. בחרו מיקום מהרשימה או משלוח.',
      };
    }
    const key = rowKey(size, branch);
    if (seen.has(key)) {
      const place = branch ? branches.find((b) => b.id === branch)?.name ?? 'סניף' : 'משלוח';
      return {
        rows: [],
        error: size
          ? `המידה "${size}" ב${place} מופיעה פעמיים — אחדו את השורות או שנו מיקום.`
          : `שורת מלאי בלי מידה ב${place} מופיעה פעמיים — אחדו את השורות.`,
      };
    }
    seen.add(key);
    out.push({ size, stock_quantity: quantity, sort_order: out.length, branch });
  }
  return { rows: out };
}
