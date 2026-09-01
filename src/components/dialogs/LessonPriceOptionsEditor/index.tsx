'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { AGE_OPTIONS, formatAge, formatAgeRange } from '@/lib/courseUtils';
import styles from './index.module.css';

export interface LessonPriceOption {
  id: string;
  lesson: string;
  display_title: string;
  monthly_price: number | string;
  min_age?: number | null;
  max_age?: number | null;
  sort_order: number;
  is_active: boolean;
}

interface FormState {
  display_title: string;
  monthly_price: string;
  sort_order: string;
  separateAge: boolean;
  min_age: string;
  max_age: string;
}

const emptyForm = (courseMinAge?: number | null, courseMaxAge?: number | null): FormState => ({
  display_title: '',
  monthly_price: '',
  sort_order: '0',
  separateAge: false,
  min_age: courseMinAge != null ? String(courseMinAge) : '',
  max_age: courseMaxAge != null ? String(courseMaxAge) : '',
});

interface LessonPriceOptionsEditorProps {
  lessonId: string;
  lessonLabel?: string;
  courseName: string;
  defaultPrice: number;
  courseMinAge?: number | null;
  courseMaxAge?: number | null;
  /** Inline panel inside another dialog (e.g. EditCourseDialog). */
  embedded?: boolean;
  onSaved?: () => void;
}

export default function LessonPriceOptionsEditor({
  lessonId,
  lessonLabel,
  courseName,
  defaultPrice,
  courseMinAge,
  courseMaxAge,
  embedded = false,
  onSaved,
}: LessonPriceOptionsEditorProps) {
  const [options, setOptions] = useState<LessonPriceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(courseMinAge, courseMaxAge));
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!lessonId) return;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm(courseMinAge, courseMaxAge));
    setFormError('');
    loadOptions();
  }, [lessonId, courseMinAge, courseMaxAge]);

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
    setForm(emptyForm(courseMinAge, courseMaxAge));
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (option: LessonPriceOption) => {
    setEditingId(option.id);
    setForm({
      display_title: option.display_title,
      monthly_price: String(option.monthly_price),
      sort_order: String(option.sort_order ?? 0),
      separateAge: option.min_age != null || option.max_age != null,
      min_age: option.min_age != null ? String(option.min_age) : (courseMinAge != null ? String(courseMinAge) : ''),
      max_age: option.max_age != null ? String(option.max_age) : (courseMaxAge != null ? String(courseMaxAge) : ''),
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
    let minAge: number | null = null;
    let maxAge: number | null = null;
    if (form.separateAge) {
      minAge = Number(form.min_age);
      maxAge = Number(form.max_age);
      if (!Number.isFinite(minAge) || !Number.isFinite(maxAge)) {
        setFormError('יש לבחור קבוצת גיל מינימום ומקסימום');
        return;
      }
      if (maxAge < minAge) {
        setFormError('גיל מקסימום חייב להיות גדול או שווה לגיל מינימום');
        return;
      }
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
        min_age: minAge,
        max_age: maxAge,
      };
      if (editingId) {
        await api.patch(`/courses/price-options/${editingId}/`, payload);
      } else {
        await api.post('/courses/price-options/', payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm(courseMinAge, courseMaxAge));
      await loadOptions();
      onSaved?.();
    } catch (error: unknown) {
      const err = error as { response?: { data?: Record<string, string[] | string> } };
      const data = err.response?.data;
      const message =
        (typeof data?.display_title === 'string' ? data.display_title : data?.display_title?.[0]) ||
        (typeof data?.monthly_price === 'string' ? data.monthly_price : data?.monthly_price?.[0]) ||
        (typeof data?.min_age === 'string' ? data.min_age : data?.min_age?.[0]) ||
        (typeof data?.max_age === 'string' ? data.max_age : data?.max_age?.[0]) ||
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
      onSaved?.();
    } catch {
      window.alert('לא ניתן למחוק את המחיר');
    }
  };

  const rootClass = embedded ? `${styles.root} ${styles.embedded}` : styles.root;

  return (
    <div className={rootClass} dir="rtl">
      <div className={styles.header}>
        <div>
          <p className={styles.title}>
            {embedded ? 'מחירים נוספים לווידג\'ט' : 'מחירים נוספים לשיעור'}
          </p>
          {lessonLabel ? (
            <p className={styles.subtitle}>
              {courseName} · {lessonLabel}
            </p>
          ) : (
            <p className={styles.subtitle}>{courseName}</p>
          )}
          <p className={styles.hint}>
            בווידג&apos;ט יופיעו שורות נפרדות עם כותרת ומחיר שונים לאותו שיעור. המחיר הרגיל של החוג
            (₪{defaultPrice}) נשאר כשורה נפרדת. אפשר גם לבחור קבוצת גיל אחרת, ואז השורה תופיע כשבוחרים את הגיל הזה.
          </p>
        </div>
      </div>

      {loading ? (
        /* The same row shape the list becomes, so the dialog does not resize
           under the pointer when the prices land. */
        <ListSkeleton rows={3} label="טוען מחירים" />
      ) : (
        <>
          <div className={styles.list}>
            {options.length === 0 && !showForm ? (
              <p className={styles.empty}>אין מחירים נוספים. הוסיפו אפשרות חדשה לווידג&apos;ט.</p>
            ) : (
              options.map((option) => (
                <div key={option.id} className={styles.row}>
                  <div>
                    <div className={styles.rowTitle}>{option.display_title}</div>
                    <div className={styles.rowMeta}>
                      ₪{Number(option.monthly_price).toFixed(0)} לחודש
                      {option.min_age != null || option.max_age != null
                        ? ` · ${formatAgeRange(option.min_age, option.max_age)}`
                        : ''}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.iconBtn} onClick={() => openEdit(option)} title="עריכה">
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtnDanger}
                      onClick={() => handleDelete(option.id)}
                      title="הסרה"
                    >
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
                כותרת בווידג&apos;ט
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
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={form.separateAge}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((prev) => ({
                      ...prev,
                      separateAge: checked,
                      min_age: prev.min_age || (courseMinAge != null ? String(courseMinAge) : ''),
                      max_age: prev.max_age || (courseMaxAge != null ? String(courseMaxAge) : ''),
                    }));
                  }}
                />
                קבוצת גיל נפרדת בווידג&apos;ט
              </label>
              {form.separateAge ? (
                <div className={styles.ageRow}>
                  <label className={styles.label}>
                    גיל מינימום
                    <select
                      className={styles.input}
                      value={form.min_age}
                      onChange={(e) => setForm((prev) => ({ ...prev, min_age: e.target.value }))}
                    >
                      <option value="">בחרו גיל</option>
                      {AGE_OPTIONS.map((age) => (
                        <option key={age} value={age}>
                          {formatAge(age)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.label}>
                    גיל מקסימום
                    <select
                      className={styles.input}
                      value={form.max_age}
                      onChange={(e) => setForm((prev) => ({ ...prev, max_age: e.target.value }))}
                    >
                      <option value="">בחרו גיל</option>
                      {AGE_OPTIONS.map((age) => (
                        <option key={age} value={age}>
                          {formatAge(age)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {formError ? <p className={styles.error}>{formError}</p> : null}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                >
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
  );
}
