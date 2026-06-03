'use client';

import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { updateStock } from '@/lib/storeApi';
import type { StoreProduct, ProductSizeStock } from '@/types/store';

interface UpdateStockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct | null;
  onSuccess: () => void;
}

function rowLocationLabel(row: ProductSizeStock): string {
  const n = row.branch_name?.trim();
  if (n) return n;
  return row.branch ? String(row.branch) : 'משלוח';
}

export default function UpdateStockDialog({ isOpen, onClose, product, onSuccess }: UpdateStockDialogProps) {
  const [mode, setMode] = useState<'add' | 'subtract' | 'set'>('add');
  const [quantity, setQuantity] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const sizeStocks = useMemo(
    () => (Array.isArray(product?.size_stocks) ? product!.size_stocks! : []),
    [product]
  );
  const hasPerSizeStock = sizeStocks.length > 0;

  const selectedRow = useMemo(() => {
    if (!hasPerSizeStock || sizeStocks.length === 0) return null;
    const i = Math.min(Math.max(0, selectedIndex), sizeStocks.length - 1);
    return sizeStocks[i] ?? null;
  }, [hasPerSizeStock, sizeStocks, selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      setMode('add');
      setQuantity(0);
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex(0);
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!hasPerSizeStock || sizeStocks.length === 0) return;
    setSelectedIndex((i) => Math.min(i, sizeStocks.length - 1));
  }, [hasPerSizeStock, sizeStocks.length]);

  const targetCurrentStock = (() => {
    if (!product) return 0;
    if (hasPerSizeStock && selectedRow) {
      return Number(selectedRow.stock_quantity) || 0;
    }
    return Number(product.stock_quantity) || 0;
  })();

  const previewStock = () => {
    switch (mode) {
      case 'add':
        return targetCurrentStock + quantity;
      case 'subtract':
        return Math.max(0, targetCurrentStock - quantity);
      case 'set':
        return Math.max(0, quantity);
      default:
        return targetCurrentStock;
    }
  };

  const selectionSummary = (() => {
    if (!hasPerSizeStock || !selectedRow) return '';
    return `${selectedRow.size} · ${rowLocationLabel(selectedRow)}`;
  })();

  async function handleSubmit() {
    if (!product) return;

    if (hasPerSizeStock) {
      if (!selectedRow) {
        toast.error('יש לבחור שורת מלאי (מידה ומיקום)');
        return;
      }
    }

    setIsLoading(true);
    try {
      const payload =
        hasPerSizeStock && selectedRow
          ? selectedRow.id
            ? {
                mode,
                quantity,
                size_stock_id: selectedRow.id,
                size: selectedRow.size,
              }
            : {
                mode,
                quantity,
                size: selectedRow.size,
              }
          : {
              mode,
              quantity,
            };

      await updateStock(product.id, payload);
      toast.success('המלאי עודכן בהצלחה!');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating stock:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה בעדכון המלאי:\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl">עדכון מלאי - {product.name}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #36</span></DialogTitle>
        </DialogHeader>

        <div className="space-y-6 px-2 mt-6">
          {hasPerSizeStock && (
            <div>
              <label className="block text-sm font-medium mb-2">מידה ומיקום</label>
              <Select
                value={String(Math.min(selectedIndex, Math.max(0, sizeStocks.length - 1)))}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedIndex(parseInt(e.target.value, 10) || 0)}
              >
                {sizeStocks.map((row, idx) => (
                  <option key={row.id ?? `${row.size}-${idx}`} value={idx}>
                    {row.size} — {rowLocationLabel(row)} (מלאי: {row.stock_quantity})
                  </option>
                ))}
              </Select>
              <p className="text-xs text-gray-500 mt-1">המלאי מתעדכן לפי השורה שנבחרה (מידה + מיקום במחסן).</p>
            </div>
          )}

          <div className="bg-teal-50 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-600 mb-1">
              מלאי נוכחי
              {hasPerSizeStock && selectionSummary ? ` (${selectionSummary})` : ''}
            </p>
            <p className="text-3xl font-bold text-teal-600">{targetCurrentStock}</p>
            {hasPerSizeStock && (
              <p className="text-xs text-gray-500 mt-2">סך הכל לכל המידות: {product.stock_quantity}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">סוג עדכון</label>
            <div className="grid grid-cols-3 gap-3">
              <Button variant={mode === 'add' ? 'default' : 'outline'} onClick={() => setMode('add')} className="w-full">
                הוסף
              </Button>
              <Button
                variant={mode === 'subtract' ? 'default' : 'outline'}
                onClick={() => setMode('subtract')}
                className="w-full"
              >
                הפחת
              </Button>
              <Button variant={mode === 'set' ? 'default' : 'outline'} onClick={() => setMode('set')} className="w-full">
                קבע
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">כמות</label>
            <Input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
              placeholder="הזן כמות"
            />
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">
              מלאי לאחר עדכון
              {hasPerSizeStock && selectionSummary ? ` (${selectionSummary})` : ''}
            </p>
            <p className="text-2xl font-bold">{previewStock()}</p>
          </div>

          <div className="flex gap-3 justify-end mt-8 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'מעדכן...' : 'עדכן מלאי'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
