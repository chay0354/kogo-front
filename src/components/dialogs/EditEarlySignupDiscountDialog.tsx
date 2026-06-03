'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { 
  EarlySignupDiscount, 
  EarlySignupDiscountFormData 
} from '@/types/discount';

interface EditEarlySignupDiscountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  discount: EarlySignupDiscount | null;
  onSave: (data: EarlySignupDiscountFormData) => Promise<void>;
}

export default function EditEarlySignupDiscountDialog({
  isOpen,
  onClose,
  onSuccess,
  discount,
  onSave,
}: EditEarlySignupDiscountDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<EarlySignupDiscountFormData>({
    name: '',
    start_date: '',
    end_date: '',
    value: 0,
    is_active: true,
  });

  useEffect(() => {
    if (isOpen) {
      if (discount) {
        // Edit mode
        setFormData({
          name: discount.name || '',
          start_date: discount.start_date,
          end_date: discount.end_date,
          value: discount.value,
          is_active: discount.is_active,
        });
      } else {
        // Create mode - reset form
        setFormData({
          name: '',
          start_date: '',
          end_date: '',
          value: 0,
          is_active: true,
        });
      }
      setError(null);
    }
  }, [isOpen, discount]);

  const validateForm = (): string | null => {
    if (!formData.start_date) return 'תאריך התחלה הוא שדה חובה';
    if (!formData.end_date) return 'תאריך סיום הוא שדה חובה';
    if (formData.end_date < formData.start_date) {
      return 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה';
    }
    if (formData.value <= 0) return 'ערך ההנחה חייב להיות גדול מ-0';
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
      console.error('Error saving early signup discount:', error);
      console.error('Error details:', error.response?.data);
      
      // Extract error message from various possible formats
      let errorMsg = 'שגיאה בשמירת ההנחה';
      
      if (error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'string') {
          errorMsg = data;
        } else if (data.detail) {
          errorMsg = data.detail;
        } else if (data.message) {
          errorMsg = data.message;
        } else if (data.non_field_errors) {
          errorMsg = Array.isArray(data.non_field_errors) 
            ? data.non_field_errors.join(', ') 
            : data.non_field_errors;
        } else {
          // Try to extract first error from field-specific errors
          const firstError = Object.values(data)[0];
          if (Array.isArray(firstError)) {
            errorMsg = firstError[0];
          } else if (typeof firstError === 'string') {
            errorMsg = firstError;
          }
        }
      }
      
      setError(errorMsg);
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
      <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold">
            {discount ? 'עריכת הנחת רישום מוקדם' : 'הוספת טווח תאריכים חדש'}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #19</span>
          </h2>
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

          {/* Name (optional) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              שם ההנחה (אופציונלי)
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="input w-full"
              placeholder="יווצר אוטומטית אם לא תזין"
            />
            <p className="text-xs text-muted-foreground mt-1">
              אם תשאיר ריק, יווצר שם אוטומטי על פי הטווח תאריכים
            </p>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                תאריך התחלה <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                תאריך סיום <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
                className="input w-full"
                required
              />
            </div>
          </div>

          {/* Discount Value */}
          <div>
            <label className="block text-sm font-medium mb-2">
              ערך ההנחה (₪) <span className="text-destructive">*</span>
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
              סכום קבוע שינוכה מהתשלום
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
              {loading ? 'שומר...' : discount ? 'שמור שינויים' : 'הוסף הנחה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

