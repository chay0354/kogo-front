'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SecondChildDiscount, SecondChildDiscountFormData } from '@/types/discount';

interface EditSecondChildDiscountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  discount: SecondChildDiscount;
  onSave: (data: SecondChildDiscountFormData) => Promise<void>;
}

export default function EditSecondChildDiscountDialog({
  isOpen,
  onClose,
  onSuccess,
  discount,
  onSave,
}: EditSecondChildDiscountDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<SecondChildDiscountFormData>({
    discount_type: 'fixed',
    value: 0,
    is_active: true,
  });

  useEffect(() => {
    if (isOpen && discount) {
      setFormData({
        discount_type: discount.discount_type || 'fixed',
        value: discount.value,
        is_active: discount.is_active,
      });
      setError(null);
    }
  }, [isOpen, discount]);

  const validateForm = (): string | null => {
    if (formData.value < 0) return 'ערך ההנחה לא יכול להיות שלילי';
    if (formData.discount_type === 'fixed_final_price' && formData.value === 0) {
      return 'מחיר סופי קבוע חייב להיות גדול מ-0';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSave(formData);
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error saving second child discount:', error);
      setError(
        error.response?.data?.detail ||
        error.response?.data?.message ||
        'שגיאה בשמירת ההנחה'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold">עריכת הנחת ילד נוסף</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-medium mb-1">איך זה עובד?</p>
            <p>
              ההנחה תוחל אוטומטית על ילד שני ומעלה במשפחה. הילד הראשון משלם מלא,
              והילדים הבאים מקבלים את ההנחה.
            </p>
          </div>

          {/* Discount Type */}
          <div>
            <label className="block text-sm font-medium mb-2">
              סוג הנחה <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent">
                <input
                  type="radio"
                  name="discount_type"
                  value="fixed"
                  checked={formData.discount_type === 'fixed'}
                  onChange={(e) => setFormData({ ...formData, discount_type: 'fixed' })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">הנחה קבועה</div>
                  <div className="text-xs text-muted-foreground">הפחתת סכום מהמחיר המקורי</div>
                </div>
              </label>
              <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent">
                <input
                  type="radio"
                  name="discount_type"
                  value="fixed_final_price"
                  checked={formData.discount_type === 'fixed_final_price'}
                  onChange={(e) => setFormData({ ...formData, discount_type: 'fixed_final_price' })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">מחיר סופי קבוע</div>
                  <div className="text-xs text-muted-foreground">מחיר קבוע לשיעור, ללא קשר למחיר המקורי</div>
                </div>
              </label>
            </div>
          </div>

          {/* Discount Value */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {formData.discount_type === 'fixed_final_price' 
                ? 'מחיר לשיעור (₪)' 
                : 'ערך ההנחה (₪)'} <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              value={formData.value}
              onChange={(e) =>
                setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })
              }
              className="input w-full"
              min="0"
              step="0.01"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formData.discount_type === 'fixed_final_price'
                ? 'המחיר הסופי לשיעור עבור ילד שני ומעלה (למשל 100 ₪ לשיעור)'
                : 'סכום קבוע שינוכה מהתשלום עבור כל ילד שני ומעלה'
              }
            </p>
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="is_active" className="text-sm font-medium">
              ההנחה פעילה
            </label>
          </div>

          {formData.value === 0 && formData.discount_type === 'fixed' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
              <p>
                💡 הערך הנוכחי הוא 0 ₪. במצב זה, ההנחה לא תוחל על ילדים שניים.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
              disabled={loading}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

