'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ShoppingCart } from 'lucide-react';
import type { StoreProduct, StoreCartLine } from '@/types/store';

interface AddToCartDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct;
  onAdd: (line: StoreCartLine) => void;
}

type StockLineOption = {
  key: string;
  size: string;
  stock: number;
  branch: string | null;
  branch_name: string | null;
  size_stock_id: string | null;
  label: string;
};

export default function AddToCartDialog({ isOpen, onClose, product, onAdd }: AddToCartDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedLineKey, setSelectedLineKey] = useState('');
  const [filterBranch, setFilterBranch] = useState<string>('all');

  const hasPerSizeStock = Array.isArray(product.size_stocks) && product.size_stocks.length > 0;

  const lineOptions = useMemo((): StockLineOption[] => {
    if (hasPerSizeStock && product.size_stocks?.length) {
      return product.size_stocks.map((row, i) => {
        const loc = row.branch_name?.trim() || (row.branch ? String(row.branch) : 'משלוח');
        const stock = Number(row.stock_quantity) || 0;
        return {
          key: row.id ?? `idx-${i}`,
          size: row.size,
          stock,
          branch: row.branch ?? null,
          branch_name: row.branch_name ?? null,
          size_stock_id: row.id ?? null,
          label: `${row.size} — ${loc} (במלאי: ${stock})`,
        };
      });
    }
    const sizes = product.size ? product.size.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return sizes.map((size, i) => ({
      key: `csv-${size}-${i}`,
      size,
      stock: product.stock_quantity,
      branch: null,
      branch_name: null,
      size_stock_id: null,
      label: size,
    }));
  }, [product, hasPerSizeStock]);

  const branchOptions = useMemo(() => {
    if (!hasPerSizeStock) return [];
    const seen = new Map<string, string>();
    lineOptions.forEach((opt) => {
      const key = opt.branch ?? '__delivery__';
      if (!seen.has(key)) {
        seen.set(key, opt.branch ? (opt.branch_name ?? opt.branch) : 'משלוח');
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [lineOptions, hasPerSizeStock]);

  const filteredLineOptions = useMemo(() => {
    if (!hasPerSizeStock || filterBranch === 'all') return lineOptions;
    if (filterBranch === 'delivery') return lineOptions.filter((o) => !o.branch);
    return lineOptions.filter((o) => o.branch === filterBranch);
  }, [lineOptions, filterBranch, hasPerSizeStock]);

  const selectedLine =
    filteredLineOptions.find((o) => o.key === selectedLineKey) ??
    lineOptions.find((o) => o.key === selectedLineKey) ??
    null;

  const maxStock =
    lineOptions.length === 0 ? product.stock_quantity : selectedLine ? selectedLine.stock : 0;

  useEffect(() => {
    if (!isOpen) return;
    setQuantity(1);
    setFilterBranch('all');
    if (lineOptions.length === 0) {
      setSelectedLineKey('');
      return;
    }
    const firstAvailable = lineOptions.find((o) => !hasPerSizeStock || o.stock > 0) ?? lineOptions[0];
    setSelectedLineKey(firstAvailable.key);
  }, [isOpen, product.id, lineOptions, hasPerSizeStock]);

  useEffect(() => {
    if (filteredLineOptions.length > 0 && !filteredLineOptions.some((o) => o.key === selectedLineKey)) {
      setSelectedLineKey(filteredLineOptions[0].key);
    }
  }, [filterBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAdd() {
    const line: StoreCartLine = {
      key: `${product.id}::${selectedLine?.key ?? 'default'}`,
      product_id: product.id,
      product_name: product.name,
      sale_price: product.sale_price,
      quantity,
      max_stock: maxStock,
    };
    if (selectedLine) {
      line.size = selectedLine.size;
      if (selectedLine.branch) line.branch = selectedLine.branch;
      if (selectedLine.branch_name) line.branch_name = selectedLine.branch_name;
      if (selectedLine.size_stock_id) line.size_stock_id = selectedLine.size_stock_id;
    }
    onAdd(line);
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md mx-4 p-6 space-y-4">
        <DialogHeader className="px-0 pt-0">
          <DialogTitle className="text-xl">הוספה לסל</DialogTitle>
        </DialogHeader>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="font-semibold">{product.name}</div>
          <div className="text-sm text-gray-600">₪{product.sale_price} ליחידה</div>
        </div>

        {lineOptions.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              {hasPerSizeStock ? 'מידה ומיקום *' : 'מידה *'}
            </label>
            {hasPerSizeStock && branchOptions.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">סנן מיקום:</span>
                <Select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  className="text-sm h-8"
                >
                  <option value="all">כל המיקומים</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id === '__delivery__' ? 'delivery' : b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Select value={selectedLineKey} onChange={(e) => setSelectedLineKey(e.target.value)}>
              <option value="">בחר שורת מלאי</option>
              {filteredLineOptions.map((opt) => (
                <option key={opt.key} value={opt.key} disabled={hasPerSizeStock && opt.stock <= 0}>
                  {hasPerSizeStock ? opt.label : opt.size}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">
            כמות
            {maxStock > 0 ? (
              <span className="text-xs text-gray-500 mr-2">(במלאי: {maxStock})</span>
            ) : null}
          </label>
          <Input
            type="number"
            min="1"
            max={maxStock || 1}
            disabled={lineOptions.length > 0 && !selectedLineKey}
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.max(1, Math.min(maxStock || 1, parseInt(e.target.value) || 1)))
            }
          />
        </div>

        <div className="flex items-center justify-between bg-teal-50 px-4 py-3 rounded-lg">
          <span className="text-sm font-medium">סה"כ לשורה:</span>
          <span className="font-bold text-teal-700">₪{(product.sale_price * quantity).toFixed(2)}</span>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button
            onClick={handleAdd}
            disabled={(lineOptions.length > 0 && !selectedLineKey) || maxStock <= 0 || quantity > maxStock}
          >
            <ShoppingCart className="h-4 w-4 ml-1.5" />
            הוסף לסל
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
