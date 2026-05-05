'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { updateProduct } from '@/lib/storeApi';
import api from '@/lib/api';
import type { StoreProduct } from '@/types/store';
import type { Branch } from '@/types/branch';

interface EditProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct | null;
  onSuccess: () => void;
}

export default function EditProductDialog({ isOpen, onClose, product, onSuccess }: EditProductDialogProps) {
  const [formData, setFormData] = useState<any>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (product && isOpen) {
      setFormData({
        name: product.name,
        category: product.category,
        size: product.size || '',
        cost_price: product.cost_price,
        sale_price: product.sale_price,
        branch: product.branch,
        stock_quantity: product.stock_quantity,
        min_stock_alert: product.min_stock_alert,
        image_url: product.image_url || '',
        notes: product.notes || ''
      });
      fetchBranches();
    }
  }, [product, isOpen]);

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

    setIsLoading(true);
    try {
      await updateProduct(product.id, formData);
      toast.success('המוצר עודכן בהצלחה!');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating product:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה בעדכון המוצר:\n${errorMessage}`);
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">קטגוריה</label>
              <Input
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">מידות</label>
              <Input
                value={formData.size || ''}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                placeholder="S,M,L,XL"
              />
            </div>
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

          <div>
            <label className="block text-sm font-medium mb-2">מיקום</label>
            <Select
              value={formData.branch || 'delivery'}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, branch: value === 'delivery' ? null : value });
              }}
            >
              <option value="">בחר מיקום...</option>
              {Array.isArray(branches) && branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
              <option value="delivery">משלוח</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">כמות במלאי</label>
              <Input
                type="number"
                value={formData.stock_quantity || 0}
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

