'use client';

import { useState, useEffect, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { createProduct } from '@/lib/storeApi';
import {
  coerceBranchFromApi,
  resolveStoreBranchId,
  storeBranchSelectValue,
} from '@/lib/storeBranch';
import api from '@/lib/api';
import type { ProductFormData, ProductSizeStock } from '@/types/store';
import type { Branch } from '@/types/branch';

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMPTY_FORM: ProductFormData = {
  name: '',
  category: 'כללי',
  size: '',
  cost_price: 0,
  sale_price: 0,
  branch: null,
  stock_quantity: 0,
  min_stock_alert: 3,
  image_url: '',
  notes: '',
  size_stocks: []
};

export default function AddProductDialog({ isOpen, onClose, onSuccess }: AddProductDialogProps) {
  const [formData, setFormData] = useState<ProductFormData>({ ...EMPTY_FORM });
  const [sizeRows, setSizeRows] = useState<ProductSizeStock[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalSizeStock = sizeRows.reduce((sum, row) => sum + (Number(row.stock_quantity) || 0), 0);

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

  useEffect(() => {
    if (isOpen) {
      fetchBranches();
    }
  }, [isOpen]);

  async function fetchBranches() {
    try {
      const response = await api.get('/core/branches/', {
        params: { is_active: true }
      });
      const data = response.data;

      // Handle paginated response - extract results array
      const branchesArray = data.results || data;

      // Ensure we have an array
      setBranches(Array.isArray(branchesArray) ? branchesArray : []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      setBranches([]);
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.length < 2) {
      newErrors.name = 'שם המוצר חייב להכיל לפחות 2 תווים';
    }
    if (formData.sale_price <= 0) {
      newErrors.sale_price = 'מחיר מכירה חייב להיות גדול מ-0';
    }
    if (formData.sale_price <= formData.cost_price) {
      newErrors.sale_price = 'מחיר מכירה חייב להיות גבוה ממחיר עלות';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

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

    const payload: ProductFormData = {
      name: formData.name,
      category: formData.category,
      size: cleanedSizeRows.length ? [...new Set(cleanedSizeRows.map((r) => r.size))].join(',') : formData.size,
      cost_price: Number(formData.cost_price) || 0,
      sale_price: Number(formData.sale_price) || 0,
      branch: topBranchId,
      stock_quantity: cleanedSizeRows.length ? totalSizeStock : Math.max(0, Math.floor(Number(formData.stock_quantity) || 0)),
      min_stock_alert: Math.max(0, Math.floor(Number(formData.min_stock_alert) || 0)),
      image_url: formData.image_url ?? '',
      notes: formData.notes ?? '',
      size_stocks: cleanedSizeRows
    };

    setIsLoading(true);
    try {
      await createProduct(payload);
      toast.success('המוצר נוסף בהצלחה!');
      handleReset();
      onClose();
      // Call onSuccess after closing to refresh the parent list
      onSuccess();
    } catch (error: any) {
      console.error('Error creating product:', error);
      const d = error?.response?.data;
      const detail =
        (typeof d === 'string' && d) ||
        d?.error ||
        (d && typeof d === 'object' ? JSON.stringify(d) : null) ||
        error?.message ||
        'שגיאה לא ידועה';
      toast.error(`שגיאה ביצירת המוצר:\n${detail}`);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setFormData({ ...EMPTY_FORM });
    setSizeRows([]);
    setErrors({});
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl">הוסף מוצר חדש<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #31</span></DialogTitle>
        </DialogHeader>

        <div className="space-y-6 px-2 mt-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">שם המוצר *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="שם המוצר"
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-2">קטגוריה</label>
            <Input
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="כללי"
            />
          </div>

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
                  <label className="block text-sm font-medium mb-2">מיקום *</label>
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
                  {branches.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">טוען סניפים...</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {sizeRows.map((row, index) => (
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
                ))}
                <div className="text-xs text-gray-600 pt-1">
                  סך הכל במלאי לפי מידות: <span className="font-semibold">{totalSizeStock}</span>
                </div>
              </div>
            )}
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">מחיר עלות</label>
              <Input
                type="number"
                step="0.01"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">מחיר מכירה *</label>
              <Input
                type="number"
                step="0.01"
                value={formData.sale_price}
                onChange={(e) => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })}
              />
              {errors.sale_price && <p className="text-red-500 text-sm mt-1">{errors.sale_price}</p>}
            </div>
          </div>

          {/* Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                כמות במלאי {sizeRows.length > 0 && <span className="text-xs text-gray-500">(מחושב לפי מידות)</span>}
              </label>
              <Input
                type="number"
                disabled={sizeRows.length > 0}
                value={sizeRows.length > 0 ? totalSizeStock : formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">התראת מלאי מינימום</label>
              <Input
                type="number"
                value={formData.min_stock_alert}
                onChange={(e) => setFormData({ ...formData, min_stock_alert: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-2">הערות</label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end mt-8 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'מוסיף...' : 'הוסף מוצר'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

