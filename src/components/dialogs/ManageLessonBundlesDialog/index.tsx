'use client';

import { useEffect, useState } from 'react';
import { X, Check, Pencil, Trash2 } from 'lucide-react';
import api, { fetchInstructorsDropdown } from '@/lib/api';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Lesson } from '@/types/course';
import type {
  ManageLessonBundlesDialogProps,
  BundleFormState,
  LessonBundle,
  InstructorOption,
} from './types';
import { emptyFormState } from './types';
import styles from './index.module.css';

function lessonInstructorId(lesson: Lesson): string {
  if (!lesson.instructor) return '';
  if (typeof lesson.instructor === 'string') return lesson.instructor;
  return lesson.instructor.id || '';
}

export default function ManageLessonBundlesDialog({
  isOpen,
  onClose,
  courseId,
  courseName,
  lessons,
  onSaved,
}: ManageLessonBundlesDialogProps) {
  const [bundles, setBundles] = useState<LessonBundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [form, setForm] = useState<BundleFormState>(emptyFormState);
  const [formError, setFormError] = useState('');
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);

  const scheduledLessons = lessons.filter((l) => l.status === 'scheduled');

  useEffect(() => {
    if (isOpen) {
      loadBundles();
      fetchInstructorsDropdown()
        .then((rows) => setInstructors(Array.isArray(rows) ? rows : []))
        .catch(() => setInstructors([]));
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
    const instructorsByLesson: Record<string, string> = {};
    for (const lessonId of bundle.lessons) {
      const detail = bundle.lessons_detail.find((row) => row.id === lessonId);
      const courseLesson = lessons.find((row) => row.id === lessonId);
      instructorsByLesson[lessonId] =
        detail?.instructor_id || (courseLesson ? lessonInstructorId(courseLesson) : '') || '';
    }
    setEditingBundleId(bundle.id);
    setForm({
      name: bundle.name || '',
      lessonIds: bundle.lessons,
      combinedPrice: String(bundle.combined_price),
      instructorsByLesson,
    });
    setFormError('');
    setShowForm(true);
  };

  const toggleLesson = (lesson: Lesson) => {
    setForm((prev) => {
      const selected = prev.lessonIds.includes(lesson.id);
      if (selected) {
        const nextInstructors = { ...prev.instructorsByLesson };
        delete nextInstructors[lesson.id];
        return {
          ...prev,
          lessonIds: prev.lessonIds.filter((id) => id !== lesson.id),
          instructorsByLesson: nextInstructors,
        };
      }
      return {
        ...prev,
        lessonIds: [...prev.lessonIds, lesson.id],
        instructorsByLesson: {
          ...prev.instructorsByLesson,
          [lesson.id]: lessonInstructorId(lesson),
        },
      };
    });
  };

  const setLessonInstructor = (lessonId: string, instructorId: string) => {
    setForm((prev) => ({
      ...prev,
      instructorsByLesson: { ...prev.instructorsByLesson, [lessonId]: instructorId },
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
      const lesson_instructors: Record<string, string | null> = {};
      for (const lessonId of form.lessonIds) {
        lesson_instructors[lessonId] = form.instructorsByLesson[lessonId] || null;
      }
      const payload = {
        course: courseId,
        name: form.name.trim(),
        lessons: form.lessonIds,
        combined_price: price,
        lesson_instructors,
      };
      if (editingBundleId) {
        await api.patch(`/courses/bundles/${editingBundleId}/`, payload);
      } else {
        await api.post('/courses/bundles/', payload);
      }
      setShowForm(false);
      await loadBundles();
      onSaved?.();
    } catch (error: any) {
      const data = error?.response?.data;
      const message =
        data?.lesson_instructors ||
        data?.lessons ||
        data?.combined_price ||
        data?.error ||
        data?.detail ||
        'שגיאה בשמירת המסלול';
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

  const formatLessonWithInstructor = (lesson: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    instructor_name?: string | null;
  }) => {
    const schedule = formatLessonSchedule(lesson);
    return lesson.instructor_name ? `${schedule} · ${lesson.instructor_name}` : schedule;
  };

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
                      {bundle.lessons_detail.map(formatLessonWithInstructor).join(' + ')}
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
                <label className={styles.label}>בחר שיעורים (2 לפחות) ומדריך לכל שיעור</label>
                <div className={styles.lessonPicker}>
                  {scheduledLessons.map((lesson: Lesson) => {
                    const selected = form.lessonIds.includes(lesson.id);
                    return (
                      <div
                        key={lesson.id}
                        className={`${styles.lessonCard} ${selected ? styles.lessonCardSelected : ''}`}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          className={styles.lessonCardToggle}
                          onClick={() => toggleLesson(lesson)}
                        >
                          <span className={styles.lessonCardIcon}>
                            {selected && <Check size={14} />}
                          </span>
                          <span className={styles.lessonCardLabel}>{formatLessonSchedule(lesson)}</span>
                        </button>
                        {selected && (
                          <label className={styles.instructorField}>
                            <span className={styles.instructorLabel}>מדריך</span>
                            <select
                              value={form.instructorsByLesson[lesson.id] || ''}
                              onChange={(e) => setLessonInstructor(lesson.id, e.target.value)}
                              className={styles.instructorSelect}
                            >
                              <option value="">בחר מדריך</option>
                              {instructors.map((instructor) => (
                                <option key={instructor.id} value={instructor.id}>
                                  {instructor.full_name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
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
