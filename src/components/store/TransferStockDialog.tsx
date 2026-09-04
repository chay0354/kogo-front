'use client';

import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { transferStock } from '@/lib/storeApi';
import type { StoreProduct, ProductSizeStock } from '@/types/store';

interface TransferStockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct | null;
  onSuccess: () => void;
}

function rowLabel(row: ProductSizeStock): string {
  const branch = row.branch_name?.trim() || (row.branch ? String(row.branch) : 'משלוח');
  // מוצר בלי מידות מחזיק שורה למיקום בלבד — אז המיקום הוא כל התווית
  return row.size
    ? `${row.size} — ${branch} (מלאי: ${row.stock_quantity})`
    : `${branch} (מלאי: ${row.stock_quantity})`;
}

export default function TransferStockDialog({ isOpen, onClose, product, onSuccess }: TransferStockDialogProps) {
  const [fromIndex, setFromIndex] = useState(0);
  const [toIndex, setToIndex] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const sizeStocks = useMemo(
    () => (Array.isArray(product?.size_stocks) ? product!.size_stocks! : []),
    [product],
  );

  useEffect(() => {
    if (!isOpen) return;
    setFromIndex(0);
    setToIndex(sizeStocks.length > 1 ? 1 : 0);
    setQuantity(1);
  }, [isOpen, product?.id, sizeStocks.length]);

  const fromRow = sizeStocks[Math.min(fromIndex, sizeStocks.length - 1)] ?? null;
  const toRow = sizeStocks[Math.min(toIndex, sizeStocks.length - 1)] ?? null;

  const canTransfer =
    fromRow &&
    toRow &&
    fromRow.id &&
    toRow.id &&
    fromRow.id !== toRow.id &&
    quantity > 0 &&
    quantity <= (fromRow.stock_quantity ?? 0);

  async function handleSubmit() {
    if (!product || !fromRow?.id || !toRow?.id) return;

    setIsLoading(true);
    try {
      await transferStock(product.id, {
        quantity,
        from_size_stock_id: fromRow.id,
        to_size_stock_id: toRow.id,
      });
      toast.success('המלאי הועבר בהצלחה!');
      onSuccess();
      onClose();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה בהעברת המלאי:\n${msg}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!product) return null;

  if (sizeStocks.length < 2) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md p-8">
          <DialogHeader>
            <DialogTitle>העברת מלאי — {product.name}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #35</span></DialogTitle>
          </DialogHeader>
          <p className="text-gray-500 mt-4">
            העברת מלאי מחייבת לפחות שתי שורות מלאי (מידה/מיקום). הגדר מידות ומיקומים נוספים בעריכת המוצר.
          </p>
          <div className="flex justify-end mt-6">
            <Button variant="outline" onClick={onClose}>סגור</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl">העברת מלאי — {product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-2 mt-5">
          {/* From */}
          <div>
            <label className="block text-sm font-medium mb-2">ממיקום (מקור)</label>
            <Select
              value={String(fromIndex)}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const idx = parseInt(e.target.value, 10);
                setFromIndex(idx);
                if (idx === toIndex) {
                  setToIndex(idx === 0 ? 1 : 0);
                }
              }}
            >
              {sizeStocks.map((row, idx) => (
                <option key={row.id ?? idx} value={idx}>
                  {rowLabel(row)}
                </option>
              ))}
            </Select>
          </div>

          {/* To */}
          <div>
            <label className="block text-sm font-medium mb-2">למיקום (יעד)</label>
            <Select
              value={String(toIndex)}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const idx = parseInt(e.target.value, 10);
                setToIndex(idx);
                if (idx === fromIndex) {
                  setFromIndex(idx === 0 ? 1 : 0);
                }
              }}
            >
              {sizeStocks.map((row, idx) => (
                <option key={row.id ?? idx} value={idx} disabled={idx === fromIndex}>
                  {rowLabel(row)}
                </option>
              ))}
            </Select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium mb-2">כמות להעברה</label>
            <Input
              type="number"
              min="1"
              max={fromRow?.stock_quantity ?? 0}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
            {fromRow && quantity > fromRow.stock_quantity && (
              <p className="text-xs text-red-500 mt-1">
                כמות מבוקשת ({quantity}) גדולה מהמלאי במקור ({fromRow.stock_quantity})
              </p>
            )}
          </div>

          {/* Preview */}
          {fromRow && toRow && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <p className="font-medium text-gray-700">תצוגה מקדימה לאחר העברה:</p>
              <div className="flex justify-between">
                <span className="text-gray-600">מקור ({[fromRow.size, fromRow.branch_name || 'משלוח'].filter(Boolean).join(' · ')}):</span>
                <span className={`font-bold ${(fromRow.stock_quantity - quantity) < 0 ? 'text-red-600' : 'text-teal-600'}`}>
                  {fromRow.stock_quantity} → {Math.max(0, fromRow.stock_quantity - quantity)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">יעד ({[toRow.size, toRow.branch_name || 'משלוח'].filter(Boolean).join(' · ')}):</span>
                <span className="font-bold text-teal-600">
                  {toRow.stock_quantity} → {toRow.stock_quantity + quantity}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={isLoading || !canTransfer}>
              {isLoading ? 'מעביר...' : 'העבר מלאי'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
