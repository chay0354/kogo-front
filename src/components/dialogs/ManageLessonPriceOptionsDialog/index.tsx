'use client';

import { useEffect, useState } from 'react';
import { X, Check, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import styles from './index.module.css';

export interface LessonPriceOption {
  id: string;
  lesson: string;
  display_title: string;
  monthly_price: number | string;
  sort_order: number;
  is_active: boolean;
}

interface ManageLessonPriceOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  lessonLabel: string;
  courseName: string;
  defaultPrice: number;
  onSaved: () => void;
}

interface FormState {
  display_title: string;
  monthly_price: string;
  sort_order: string;
}

const emptyForm = (): FormState => ({
  display_title: '',
  monthly_price: '',
  sort_order: '0',
});

export default function ManageLessonPriceOptionsDialog({
  isOpen,
  onClose,
  lessonId,
  lessonLabel,
  courseName,
  defaultPrice,
  onSaved,
}: ManageLessonPriceOptionsDialogProps) {
  const [options, setOptions] = useState<LessonPriceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    loadOptions();
  }, [isOpen, lessonId]);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/courses/price-options/?lesson=${lessonId}`);
      setOptions(res.data.results || res.data || []);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (option: LessonPriceOption) => {
    setEditingId(option.id);
    setForm({
      display_title: option.display_title,
      monthly_price: String(option.monthly_price),
      sort_order: String(option.sort_order ?? 0),
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    const title = form.display_title.trim();
    const price = Number(form.monthly_price);
    const sortOrder = Number(form.sort_order || 0);
    if (!title) {
      setFormError('יש להזין כותרת לווידג\'ט');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError('יש להזין מחיר תקין');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        lesson: lessonId,
        display_title: title,
        monthly_price: price,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        is_active: true,
      };
      if (editingId) {
        await api.patch(`/courses/price-options/${editingId}/`, payload);
      } else {
        await api.post('/courses/price-options/', payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await loadOptions();
      onSaved();
    } catch (error: unknown) {
      const err = error as { response?: { data?: Record<string, string[] | string> } };
      const data = err.response?.data;
      const message =
        (typeof data?.display_title === 'string' ? data.display_title : data?.display_title?.[0]) ||
        (typeof data?.monthly_price === 'string' ? data.monthly_price : data?.monthly_price?.[0]) ||
        (typeof data?.detail === 'string' ? data.detail : undefined) ||
        'שגיאה בשמירה';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (optionId: string) => {
    if (!window.confirm('להסיר את המחיר הנוסף מהווידג\'ט?')) return;
    try {
      await api.delete(`/courses/price-options/${optionId}/`);
      await loadOptions();
      onSaved();
    } catch {
      window.alert('לא ניתן למחוק את המחיר');
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>מחירים נוספים לשיעור</h2>
            <p className={styles.subtitle}>{courseName} · {lessonLabel}</p>
            <p className={styles.hint}>
              בווידג\'ט יופיעו שורות נפרדות עם כותרת ומחיר שונים לאותו שיעור. המחיר הרגיל של החוג (₪{defaultPrice}) נשאר כשורה נפרדת.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגור">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <p className={styles.loading}>טוען...</p>
        ) : (
          <>
            <div className={styles.list}>
              {options.length === 0 && !showForm ? (
                <p className={styles.empty}>אין מחירים נוספים. הוסיפו אפשרות חדשה לווידג\'ט.</p>
              ) : (
                options.map((option) => (
                  <div key={option.id} className={styles.row}>
                    <div>
                      <div className={styles.rowTitle}>{option.display_title}</div>
                      <div className={styles.rowMeta}>₪{Number(option.monthly_price).toFixed(0)} לחודש</div>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconBtn} onClick={() => openEdit(option)} title="עריכה">
                        <Pencil size={16} />
                      </button>
                      <button type="button" className={styles.iconBtnDanger} onClick={() => handleDelete(option.id)} title="הסרה">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {showForm ? (
              <div className={styles.form}>
                <label className={styles.label}>
                  כותרת בווידג\'ט
                  <input
                    className={styles.input}
                    value={form.display_title}
                    onChange={(e) => setForm((prev) => ({ ...prev, display_title: e.target.value }))}
                    placeholder="לדוגמה: מסלול VIP"
                  />
                </label>
                <label className={styles.label}>
                  מחיר חודשי (₪)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={form.monthly_price}
                    onChange={(e) => setForm((prev) => ({ ...prev, monthly_price: e.target.value }))}
                  />
                </label>
                <label className={styles.label}>
                  סדר תצוגה
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                  />
                </label>
                {formError ? <p className={styles.error}>{formError}</p> : null}
                <div className={styles.formActions}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => { setShowForm(false); setEditingId(null); }}>
                    ביטול
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                    <Check size={16} />
                    {saving ? 'שומר...' : editingId ? 'עדכון' : 'הוספה'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.addBtn} onClick={openCreate}>
                + מחיר נוסף
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
