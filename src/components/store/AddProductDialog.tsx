'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { createProduct } from '@/lib/storeApi';
import api from '@/lib/api';
import type { ProductFormData } from '@/types/store';
import type { Branch } from '@/types/branch';

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddProductDialog({ isOpen, onClose, onSuccess }: AddProductDialogProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    category: 'כללי',
    size: '',
    cost_price: 0,
    sale_price: 0,
    branch: null,
    stock_quantity: 0,
    min_stock_alert: 3,
    image_url: '',
    notes: ''
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      console.log('Fetched branches response:', data); // Debug log
      
      // Handle paginated response - extract results array
      const branchesArray = data.results || data;
      console.log('Branches array:', branchesArray); // Debug log
      
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

    setIsLoading(true);
    try {
      const result = await createProduct(formData);
      console.log('Product created:', result); // Debug log
      toast.success('המוצר נוסף בהצלחה!');
      handleReset();
      onClose();
      // Call onSuccess after closing to refresh the parent list
      onSuccess();
    } catch (error: any) {
      console.error('Error creating product:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה ביצירת המוצר:\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setFormData({
      name: '',
      category: 'כללי',
      size: '',
      cost_price: 0,
      sale_price: 0,
      branch: null,
      stock_quantity: 0,
      min_stock_alert: 3,
      image_url: '',
      notes: ''
    });
    setErrors({});
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl">הוסף מוצר חדש</DialogTitle>
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

          {/* Size */}
          <div>
            <label className="block text-sm font-medium mb-2">מידות (מופרדות בפסיקים)</label>
            <Input
              value={formData.size}
              onChange={(e) => setFormData({ ...formData, size: e.target.value })}
              placeholder="S,M,L,XL"
            />
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

          {/* Branch */}
          <div>
            <label className="block text-sm font-medium mb-2">מיקום *</label>
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
            {branches.length === 0 && <p className="text-sm text-gray-500 mt-1">טוען סניפים...</p>}
          </div>

          {/* Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">כמות במלאי</label>
              <Input
                type="number"
                value={formData.stock_quantity}
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

