'use client';

import { useEffect, useState } from 'react';
import { X, Check, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Lesson } from '@/types/course';
import type { ManageLessonBundlesDialogProps, BundleFormState, LessonBundle } from './types';
import { emptyFormState } from './types';
import styles from './index.module.css';

export default function ManageLessonBundlesDialog({
  isOpen,
  onClose,
  courseId,
  courseName,
  lessons,
}: ManageLessonBundlesDialogProps) {
  const [bundles, setBundles] = useState<LessonBundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [form, setForm] = useState<BundleFormState>(emptyFormState);
  const [formError, setFormError] = useState('');

  const scheduledLessons = lessons.filter((l) => l.status === 'scheduled');

  useEffect(() => {
    if (isOpen) {
      loadBundles();
      setShowForm(false);
      setEditingBundleId(null);
      setForm(emptyFormState);
      setFormError('');
    }
  }, [isOpen, courseId]);

  const loadBundles = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/courses/bundles/?course=${courseId}`);
      setBundles(res.data.results || res.data || []);
    } catch (error) {
      console.error('Error loading lesson bundles:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingBundleId(null);
    setForm(emptyFormState);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (bundle: LessonBundle) => {
    setEditingBundleId(bundle.id);
    setForm({
      name: bundle.name || '',
      lessonIds: bundle.lessons,
      combinedPrice: String(bundle.combined_price),
    });
    setFormError('');
    setShowForm(true);
  };

  const toggleLesson = (lessonId: string) => {
    setForm((prev) => ({
      ...prev,
      lessonIds: prev.lessonIds.includes(lessonId)
        ? prev.lessonIds.filter((id) => id !== lessonId)
        : [...prev.lessonIds, lessonId],
    }));
  };

  const handleSave = async () => {
    if (form.lessonIds.length < 2) {
      setFormError('יש לבחור לפחות 2 שיעורים');
      return;
    }
    const price = Number(form.combinedPrice);
    if (!form.combinedPrice || Number.isNaN(price) || price < 0) {
      setFormError('יש להזין מחיר משולב תקין');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        course: courseId,
        name: form.name.trim(),
        lessons: form.lessonIds,
        combined_price: price,
      };
      if (editingBundleId) {
        await api.patch(`/courses/bundles/${editingBundleId}/`, payload);
      } else {
        await api.post('/courses/bundles/', payload);
      }
      setShowForm(false);
      await loadBundles();
    } catch (error: any) {
      const data = error?.response?.data;
      const message = data?.lessons || data?.combined_price || data?.error || data?.detail || 'שגיאה בשמירת המסלול';
      setFormError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (bundle: LessonBundle) => {
    try {
      await api.patch(`/courses/bundles/${bundle.id}/`, { is_active: !bundle.is_active });
      await loadBundles();
    } catch (error) {
      console.error('Error toggling bundle active state:', error);
    }
  };

  const handleDelete = async (bundle: LessonBundle) => {
    if (!confirm('האם למחוק את המסלול המשולב? (התלמידים הרשומים דרכו לא יימחקו)')) return;
    try {
      await api.delete(`/courses/bundles/${bundle.id}/`);
      await loadBundles();
    } catch (error) {
      console.error('Error deleting lesson bundle:', error);
    }
  };

  const formatLessonSchedule = (lesson: { day_of_week: number; start_time: string; end_time: string }) =>
    `${getDayName(lesson.day_of_week)} ${formatTimeRange(lesson.start_time, lesson.end_time)}`;

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>ניהול מסלולים משולבים — {courseName}</h2>
          <button onClick={onClose} className={styles.closeButton} aria-label="סגור">
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <p className={styles.emptyState}>טוען מסלולים...</p>
          ) : bundles.length === 0 && !showForm ? (
            <p className={styles.emptyState}>אין מסלולים משולבים לחוג זה</p>
          ) : (
            <div className={styles.bundleList}>
              {bundles.map((bundle) => (
                <div key={bundle.id} className={styles.bundleRow}>
                  <div className={styles.bundleInfo}>
                    <span className={styles.bundleName}>{bundle.name || 'מסלול משולב'}</span>
                    <span className={styles.bundleSchedule}>
                      {bundle.lessons_detail.map(formatLessonSchedule).join(' + ')}
                    </span>
                    <span className={styles.bundlePrice}>₪{bundle.combined_price} לחודש</span>
                  </div>
                  <div className={styles.bundleActions}>
                    <label className={styles.activeToggle}>
                      <input
                        type="checkbox"
                        checked={bundle.is_active}
                        onChange={() => handleToggleActive(bundle)}
                      />
                      פעיל
                    </label>
                    <button
                      onClick={() => openEditForm(bundle)}
                      className={`${styles.iconButton} ${styles.editIconButton}`}
                      title="עריכת מסלול"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(bundle)}
                      className={`${styles.iconButton} ${styles.deleteIconButton}`}
                      title="מחיקת מסלול"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showForm ? (
            <div className={styles.form}>
              <div className={styles.formField}>
                <label className={styles.label}>שם המסלול (אופציונלי)</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={styles.textInput}
                  placeholder="פעמיים בשבוע"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>בחר שיעורים (2 לפחות)</label>
                <div className={styles.lessonPicker}>
                  {scheduledLessons.map((lesson: Lesson) => {
                    const selected = form.lessonIds.includes(lesson.id);
                    return (
                      <div
                        key={lesson.id}
                        role="checkbox"
                        aria-checked={selected}
                        tabIndex={0}
                        className={`${styles.lessonCard} ${selected ? styles.lessonCardSelected : ''}`}
                        onClick={() => toggleLesson(lesson.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleLesson(lesson.id);
                          }
                        }}
                      >
                        <span className={styles.lessonCardIcon}>
                          {selected && <Check size={14} />}
                        </span>
                        <span className={styles.lessonCardLabel}>{formatLessonSchedule(lesson)}</span>
                      </div>
                    );
                  })}
                  {scheduledLessons.length === 0 && (
                    <p className={styles.emptyState}>אין שיעורים מתוזמנים בחוג זה</p>
                  )}
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>מחיר משולב (₪ לחודש)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.combinedPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, combinedPrice: e.target.value }))}
                  className={styles.textInput}
                  placeholder="300"
                />
              </div>

              {formError && <p className={styles.errorText}>{formError}</p>}

              <div className={styles.formActions}>
                <button onClick={() => setShowForm(false)} className={styles.cancelButton} disabled={saving}>
                  ביטול
                </button>
                <button onClick={handleSave} className={styles.saveButton} disabled={saving}>
                  {saving ? 'שומר...' : 'שמירה'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openCreateForm} className={styles.addButton}>
              + מסלול חדש
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
