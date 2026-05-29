'use client';

import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { adjustStock } from '@/lib/storeApi';
import type { StoreProduct, ProductSizeStock, AdjustmentReason } from '@/types/store';

interface AdjustStockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct | null;
  onSuccess: () => void;
}

type Direction = 'add' | 'subtract';

const ADD_REASONS: Array<{ value: AdjustmentReason; label: string }> = [
  { value: 'receipt', label: 'קבלת סחורה' },
  { value: 'recount', label: 'ספירה / תיקון' },
  { value: 'other', label: 'אחר' },
];

const SUBTRACT_REASONS: Array<{ value: AdjustmentReason; label: string }> = [
  { value: 'theft', label: 'גניבה' },
  { value: 'damage', label: 'בלאי / נזק' },
  { value: 'recount', label: 'ספירה / תיקון' },
  { value: 'other', label: 'אחר' },
];

function rowLocationLabel(row: ProductSizeStock): string {
  const n = row.branch_name?.trim();
  if (n) return n;
  return row.branch ? String(row.branch) : 'משלוח';
}

export default function AdjustStockDialog({ isOpen, onClose, product, onSuccess }: AdjustStockDialogProps) {
  const [direction, setDirection] = useState<Direction>('add');
  const [reason, setReason] = useState<AdjustmentReason>('receipt');
  const [quantity, setQuantity] = useState(0);
  const [note, setNote] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const sizeStocks = useMemo(
    () => (Array.isArray(product?.size_stocks) ? product!.size_stocks! : []),
    [product],
  );
  const hasPerSizeStock = sizeStocks.length > 0;

  const selectedRow = useMemo<ProductSizeStock | null>(() => {
    if (!hasPerSizeStock) return null;
    const i = Math.min(Math.max(0, selectedIndex), sizeStocks.length - 1);
    return sizeStocks[i] ?? null;
  }, [hasPerSizeStock, sizeStocks, selectedIndex]);

  const reasons = direction === 'add' ? ADD_REASONS : SUBTRACT_REASONS;

  // Reset on open / product change
  useEffect(() => {
    if (!isOpen) return;
    setDirection('add');
    setReason('receipt');
    setQuantity(0);
    setNote('');
    setSelectedIndex(0);
  }, [isOpen, product?.id]);

  // Keep reason valid when direction changes
  useEffect(() => {
    const validValues = reasons.map(r => r.value);
    if (!validValues.includes(reason)) {
      setReason(validValues[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const targetCurrentStock = (() => {
    if (!product) return 0;
    if (hasPerSizeStock && selectedRow) return Number(selectedRow.stock_quantity) || 0;
    return Number(product.stock_quantity) || 0;
  })();

  const previewStock = direction === 'add'
    ? targetCurrentStock + quantity
    : Math.max(0, targetCurrentStock - quantity);

  async function handleSubmit() {
    if (!product) return;
    if (quantity <= 0) {
      toast.error('יש להזין כמות גדולה מ-0');
      return;
    }

    const quantityDelta = direction === 'add' ? quantity : -quantity;

    setIsLoading(true);
    try {
      await adjustStock(product.id, {
        quantity_delta: quantityDelta,
        reason,
        note: note.trim() || undefined,
        size_stock_id: selectedRow?.id ?? null,
      });
      toast.success('המלאי עודכן בהצלחה!');
      onSuccess();
      onClose();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה בעדכון המלאי:\n${msg}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl">עדכון מלאי — {product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-2 mt-5">
          {/* Direction */}
          <div>
            <label className="block text-sm font-medium mb-3">סוג עדכון</label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={direction === 'add' ? 'default' : 'outline'}
                onClick={() => setDirection('add')}
                className="w-full"
              >
                ➕ הוספה
              </Button>
              <Button
                variant={direction === 'subtract' ? 'default' : 'outline'}
                onClick={() => setDirection('subtract')}
                className="w-full"
              >
                ➖ הפחתה
              </Button>
            </div>
          </div>

          {/* Per-size row selector */}
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
            </div>
          )}

          {/* Current stock display */}
          <div className="bg-teal-50 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-600 mb-1">
              מלאי נוכחי
              {hasPerSizeStock && selectedRow
                ? ` (${selectedRow.size} · ${rowLocationLabel(selectedRow)})`
                : ''}
            </p>
            <p className="text-3xl font-bold text-teal-600">{targetCurrentStock}</p>
            {hasPerSizeStock && (
              <p className="text-xs text-gray-500 mt-1">סך הכל: {product.stock_quantity}</p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium mb-2">סיבה</label>
            <Select
              value={reason}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setReason(e.target.value as AdjustmentReason)}
            >
              {reasons.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium mb-2">כמות</label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
              placeholder="הזן כמות"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium mb-2">הערה (אופציונלי)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="הוסף הערה..."
            />
          </div>

          {/* Preview */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">מלאי לאחר עדכון</p>
            <p className={`text-2xl font-bold ${previewStock < (product.min_stock_alert ?? 0) ? 'text-red-600' : ''}`}>
              {previewStock}
            </p>
            {previewStock < (product.min_stock_alert ?? 0) && (
              <p className="text-xs text-red-500 mt-1">⚠ מתחת לרף המינימום ({product.min_stock_alert})</p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={isLoading || quantity <= 0}>
              {isLoading ? 'מעדכן...' : 'עדכן מלאי'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
