'use client';

import { useState, useEffect, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { updateProduct } from '@/lib/storeApi';
import {
  coerceBranchFromApi,
  isUuidString,
  resolveStoreBranchId,
  storeBranchSelectValue,
} from '@/lib/storeBranch';
import api from '@/lib/api';
import type { StoreProduct, ProductSizeStock } from '@/types/store';
import type { Branch } from '@/types/branch';

interface EditProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct | null;
  onSuccess: () => void;
}

function deriveSizeRows(product: StoreProduct | null): ProductSizeStock[] {
  if (!product) return [];

  if (Array.isArray(product.size_stocks) && product.size_stocks.length > 0) {
    return product.size_stocks
      .map((row, index) => {
        const rawSo = row.sort_order;
        const sortOrder =
          typeof rawSo === 'number' && !Number.isNaN(rawSo)
            ? rawSo
            : Number.isFinite(Number(rawSo))
              ? Math.max(0, Math.floor(Number(rawSo)))
              : index;
        return {
          size: row.size,
          stock_quantity: Number(row.stock_quantity) || 0,
          sort_order: sortOrder,
          branch: coerceBranchFromApi(row.branch),
        };
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  // Legacy: only a CSV size string. Seed rows so the staff can start tracking
  // per-size stock; first size keeps the current total to preserve inventory.
  const csvSizes = (product.size || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (csvSizes.length === 0) return [];

  return csvSizes.map((size, index) => ({
    size,
    stock_quantity: index === 0 ? Number(product.stock_quantity) || 0 : 0,
    sort_order: index,
    branch: coerceBranchFromApi(product.branch),
  }));
}

export default function EditProductDialog({ isOpen, onClose, product, onSuccess }: EditProductDialogProps) {
  const [formData, setFormData] = useState<any>({});
  const [sizeRows, setSizeRows] = useState<ProductSizeStock[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterBranch, setFilterBranch] = useState<string>('all');

  const totalSizeStock = sizeRows.reduce((sum, row) => sum + (Number(row.stock_quantity) || 0), 0);

  useEffect(() => {
    if (product && isOpen) {
      setFilterBranch('all');
      setFormData({
        name: product.name,
        category: product.category,
        size: product.size || '',
        cost_price: product.cost_price,
        sale_price: product.sale_price,
        branch: coerceBranchFromApi(product.branch),
        stock_quantity: product.stock_quantity,
        min_stock_alert: product.min_stock_alert,
        image_url: product.image_url || '',
        notes: product.notes || ''
      });
      setSizeRows(deriveSizeRows(product));
      fetchBranches();
    }
  }, [product, isOpen]);

  useEffect(() => {
    if (!isOpen || !product || branches.length === 0) return;

    setSizeRows((rows) => {
      let changed = false;
      const next = rows.map((row) => {
        const coerced = coerceBranchFromApi(row.branch);
        if (!coerced) return row;
        if (isUuidString(coerced)) return row;
        const match = branches.find((b) => b.id === coerced || b.name === coerced);
        if (!match) return row;
        if (row.branch !== match.id) changed = true;
        return { ...row, branch: match.id };
      });
      return changed ? next : rows;
    });

    setFormData((fd: Record<string, unknown>) => {
      const coerced = coerceBranchFromApi(fd?.branch);
      if (!coerced) return fd;
      if (isUuidString(coerced)) return fd;
      const match = branches.find((b) => b.id === coerced || b.name === coerced);
      if (!match || fd.branch === match.id) return fd;
      return { ...fd, branch: match.id };
    });
  }, [isOpen, product?.id, branches]);

  function addSizeRow() {
    setSizeRows((rows) => [
      ...rows,
      {
        size: '',
        stock_quantity: 0,
        sort_order: rows.length,
        branch: rows.length === 0 ? formData.branch : null,
      },
    ]);
  }

  function updateSizeRow(index: number, patch: Partial<ProductSizeStock>) {
    setSizeRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeSizeRow(index: number) {
    setSizeRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function fetchBranches() {
    try {
      const response = await api.get('/core/branches/', {
        params: { is_active: true }
      });
      const data = response.data;
      // Handle paginated response - extract results array
      const branchesArray = data.results || data;
      setBranches(Array.isArray(branchesArray) ? branchesArray : []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      setBranches([]);
    }
  }

  async function handleSubmit() {
    if (!product) return;

    const cleanedSizeRows: Array<{
      size: string;
      stock_quantity: number;
      sort_order: number;
      branch: string | null;
    }> = [];

    for (const row of sizeRows) {
      const size = row.size.trim();
      if (!size.length) continue;
      const rawBranch = coerceBranchFromApi(row.branch);
      const branchId = resolveStoreBranchId(row.branch, branches);
      if (rawBranch && branchId == null) {
        toast.error(`מיקום לא תקף למידה "${size}". בחרו מיקום מהרשימה או משלוח.`);
        return;
      }
      cleanedSizeRows.push({
        size,
        stock_quantity: Math.max(0, Math.floor(Number(row.stock_quantity) || 0)),
        sort_order: cleanedSizeRows.length,
        branch: branchId,
      });
    }

    const seen = new Set<string>();
    for (const row of cleanedSizeRows) {
      const key = `${row.size}\u0000${row.branch ?? ''}`;
      if (seen.has(key)) {
        toast.error(`שילוב מידה "${row.size}" ומיקום מופיע פעמיים — שנה מיקום או מידה.`);
        return;
      }
      seen.add(key);
    }

    const topRaw = coerceBranchFromApi(formData.branch);
    const topBranchId = resolveStoreBranchId(formData.branch, branches);
    if (topRaw && topBranchId == null) {
      toast.error('מיקום ברירת המחדל לא תקף. בחרו מיקום מהרשימה או משלוח.');
      return;
    }

    const payload = {
      name: formData.name,
      category: formData.category ?? '',
      size: cleanedSizeRows.length ? [...new Set(cleanedSizeRows.map((r) => r.size))].join(',') : (formData.size ?? ''),
      cost_price: Number(formData.cost_price) || 0,
      sale_price: Number(formData.sale_price) || 0,
      branch: topBranchId,
      stock_quantity: cleanedSizeRows.length ? totalSizeStock : Math.max(0, Math.floor(Number(formData.stock_quantity) || 0)),
      min_stock_alert: Math.max(0, Math.floor(Number(formData.min_stock_alert) || 0)),
      image_url: formData.image_url ?? '',
      notes: formData.notes ?? '',
      size_stocks: cleanedSizeRows,
    };

    setIsLoading(true);
    try {
      await updateProduct(product.id, payload);
      toast.success('המוצר עודכן בהצלחה!');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating product:', error);
      const d = error?.response?.data;
      const detail =
        (typeof d === 'string' && d) ||
        d?.error ||
        (d && typeof d === 'object' ? JSON.stringify(d) : null) ||
        error?.message ||
        'שגיאה לא ידועה';
      toast.error(`שגיאה בעדכון המוצר:\n${detail}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl">ערוך מוצר</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 px-2 mt-6">
          <div>
            <label className="block text-sm font-medium mb-2">שם המוצר *</label>
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">קטגוריה</label>
            <Input
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">מחיר עלות</label>
              <Input
                type="number"
                step="0.01"
                value={formData.cost_price || 0}
                onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">מחיר מכירה *</label>
              <Input
                type="number"
                step="0.01"
                value={formData.sale_price || 0}
                onChange={(e) => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                כמות במלאי {sizeRows.length > 0 && <span className="text-xs text-gray-500">(מחושב לפי מידות)</span>}
              </label>
              <Input
                type="number"
                disabled={sizeRows.length > 0}
                value={sizeRows.length > 0 ? totalSizeStock : (formData.stock_quantity ?? 0)}
                onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">התראת מלאי מינימום</label>
              <Input
                type="number"
                value={formData.min_stock_alert || 0}
                onChange={(e) => setFormData({ ...formData, min_stock_alert: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          {(() => {
            const effectiveStock = sizeRows.length > 0 ? totalSizeStock : Number(formData.stock_quantity ?? 0);
            const minAlert = Number(formData.min_stock_alert ?? 0);
            if (effectiveStock <= minAlert) {
              return (
                <p className="text-xs text-red-600 -mt-3">
                  מוצר זה ייספר כ"מלאי נמוך" בדשבורד (כמות במלאי {effectiveStock} ≤ התראת מינימום {minAlert}).
                </p>
              );
            }
            return null;
          })()}

          {/* Sizes + per-size stock */}
          <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">מידות ומלאי לכל מידה</label>
              <Button type="button" size="sm" variant="outline" onClick={addSizeRow}>
                <Plus className="h-4 w-4 ml-1" />
                הוסף מידה
              </Button>
            </div>

            {sizeRows.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  אם אין מידות, ניתן לדלג על שלב זה ולהשתמש בכמות במלאי הכללית למטה.
                </p>
                <div>
                  <label className="block text-sm font-medium mb-2">מיקום</label>
                  <Select
                    value={storeBranchSelectValue(formData.branch)}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const v = e.target.value;
                      setFormData({ ...formData, branch: v === 'delivery' ? null : v });
                    }}
                  >
                    <option value="delivery">משלוח</option>
                    {Array.isArray(branches) &&
                      branches.map((branch: Branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Location filter — client-side only, does not affect save */}
                {branches.length > 0 && (
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                    <label className="text-xs text-gray-600 whitespace-nowrap">סנן לפי מיקום:</label>
                    <Select
                      value={filterBranch}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterBranch(e.target.value)}
                      className="text-sm h-8"
                    >
                      <option value="all">כל המיקומים ({sizeRows.length})</option>
                      <option value="delivery">
                        משלוח ({sizeRows.filter(r => !r.branch).length})
                      </option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({sizeRows.filter(r => r.branch === b.id).length})
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {sizeRows.map((row, index) => {
                  // Apply client-side filter — hidden rows are still saved
                  const rowBranch = row.branch ?? null;
                  const visible =
                    filterBranch === 'all' ||
                    (filterBranch === 'delivery' ? !rowBranch : rowBranch === filterBranch);
                  if (!visible) return null;
                  return (
                  <div
                    key={`sr-${index}-${row.size}-${coerceBranchFromApi(row.branch) ?? 'd'}`}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end sm:items-center border-b border-gray-200 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="sm:col-span-3">
                      <label className="block text-xs text-gray-600 mb-1 sm:sr-only">מידה</label>
                      <Input
                        value={row.size}
                        onChange={(e) => updateSizeRow(index, { size: e.target.value })}
                        placeholder="מידה (S, M, L, 42, ...)"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 sm:sr-only">כמות במלאי</label>
                      <Input
                        type="number"
                        min="0"
                        value={row.stock_quantity}
                        onChange={(e) =>
                          updateSizeRow(index, {
                            stock_quantity: Math.max(0, parseInt(e.target.value) || 0)
                          })
                        }
                        placeholder="כמות במלאי"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <Select
                        aria-label="מיקום"
                        value={storeBranchSelectValue(row.branch)}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                          const v = e.target.value;
                          updateSizeRow(index, { branch: v === 'delivery' ? null : v });
                        }}
                      >
                        <option value="delivery">משלוח</option>
                        {Array.isArray(branches) &&
                          branches.map((branch: Branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeSizeRow(index)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  );
                })}
                <div className="text-xs text-gray-600 pt-1">
                  סך הכל במלאי לפי מידות: <span className="font-semibold">{totalSizeStock}</span>
                  {filterBranch !== 'all' && (
                    <span className="text-gray-400 mr-2">
                      (מוצג: {sizeRows.filter(r =>
                        filterBranch === 'delivery' ? !r.branch : r.branch === filterBranch
                      ).length} מתוך {sizeRows.length} שורות)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">הערות</label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3"
              rows={3}
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-3 justify-end mt-8 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'מעדכן...' : 'עדכן'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
