'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AdditionalLessonDiscount, AdditionalLessonDiscountFormData } from '@/types/discount';
import {
  anotherClassExample,
  anotherClassKind,
  anotherClassProblem,
  type AnotherClassKind,
} from '@/lib/anotherClassDiscount';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

interface EditAdditionalLessonDiscountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  discount: AdditionalLessonDiscount;
  onSave: (data: AdditionalLessonDiscountFormData) => Promise<void>;
}

export default function EditAdditionalLessonDiscountDialog({
  isOpen,
  onClose: dismiss,
  onSuccess,
  discount,
  onSave,
}: EditAdditionalLessonDiscountDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<AdditionalLessonDiscountFormData>({
    discount_type: 'fixed',
    value: 0,
    is_active: true,
  });

  useEffect(() => {
    if (isOpen && discount) {
      setFormData({
        // Nothing set yet: open on the amount off — the way the owner asked for
        // it (8.10.2026). A figure already set keeps the kind it was set in.
        discount_type: discount.value > 0 ? anotherClassKind(discount) : 'fixed',
        value: discount.value,
        is_active: discount.is_active,
      });
      setError(null);
    }
  }, [isOpen, discount]);

  const kind: AnotherClassKind = formData.discount_type ?? 'fixed';
  const example = anotherClassExample(kind, formData.value);

  const validateForm = (): string | null => anotherClassProblem(kind, formData.value) || null;

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
      console.error('Error saving additional lesson discount:', error);
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
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`}>
      <div className={`bg-background rounded-lg shadow-xl max-w-lg w-full ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold">עריכת הנחת שיעור נוסף<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #15</span></h2>
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
              ההנחה חלה אוטומטית על ילד שרשום ליותר מחוג אחד.
              החוג הראשון במחיר מלא, וכל חוג נוסף (2, 3 וכו׳) מקבל את ההנחה.
            </p>
          </div>

          {/* Kind */}
          <div>
            <label className="block text-sm font-medium mb-2">
              סוג הנחה <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent">
                <input
                  type="radio"
                  name="another_class_kind"
                  value="fixed"
                  checked={kind === 'fixed'}
                  onChange={() => setFormData({ ...formData, discount_type: 'fixed' })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">הפחתה מהמחיר</div>
                  <div className="text-xs text-muted-foreground">
                    אותו סכום יורד מכל חוג נוסף, בכל סוגי החוגים. מצטרף להנחת אח ולרישום מוקדם.
                  </div>
                </div>
              </label>
              <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent">
                <input
                  type="radio"
                  name="another_class_kind"
                  value="fixed_final_price"
                  checked={kind === 'fixed_final_price'}
                  onChange={() => setFormData({ ...formData, discount_type: 'fixed_final_price' })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">מחיר קבוע לחוג נוסף</div>
                  <div className="text-xs text-muted-foreground">
                    כל חוג נוסף עולה את הסכום הזה. זה המחיר הסופי — הנחות אחרות לא יורדות ממנו.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Discount Value */}
          <div>
            <label htmlFor="another-class-value" className="block text-sm font-medium mb-2">
              {kind === 'fixed' ? 'כמה יורד מכל חוג נוסף (₪)' : 'מחיר לחוג נוסף (₪)'}{' '}
              <span className="text-destructive">*</span>
            </label>
            <input
              id="another-class-value"
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
            {example ? <p className="text-xs text-muted-foreground mt-1">{example}</p> : null}
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

          {formData.value === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
              <p>
                ⚠️ הסכום חייב להיות גדול מ-0. בלי סכום ההנחה לא פועלת.
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
