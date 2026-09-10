'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';
import { createExternalStudent, updateExternalStudent } from '@/lib/externalStudents';
import type { ExternalStudent } from '@/types/externalStudent';
import type { Lesson } from '@/types/course';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** The branch's lessons, already loaded by the page. */
  lessons: Lesson[];
  /** Present when editing; absent when adding. */
  student?: ExternalStudent | null;
  preselectedLessonId?: string;
}

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function lessonLabel(lesson: Lesson): string {
  const course = (lesson as { course_name?: string }).course_name ?? '';
  const day = DAYS[lesson.day_of_week] ?? '';
  const start = (lesson.start_time || '').slice(0, 5);
  return `${course} · יום ${day} ${start}`.trim();
}

/**
 * Add or edit one municipality child.
 *
 * Adding keeps the dialog open on "שמור והוסף עוד": the real input is a paper
 * list of twenty names, and reopening a dialog twenty times is the difference
 * between a tool someone uses and one they avoid.
 */
export default function ExternalStudentDialog({
  isOpen,
  onClose: dismiss,
  onSuccess,
  lessons,
  student,
  preselectedLessonId,
}: Props) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  const isEdit = Boolean(student);
  const firstNameRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    lesson: '',
    first_name: '',
    last_name: '',
    phone: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSavedCount(0);
    setFormData({
      lesson: student?.lesson_id || preselectedLessonId || lessons[0]?.id || '',
      first_name: student?.first_name || '',
      last_name: student?.last_name || '',
      phone: student?.phone || '',
      notes: student?.notes || '',
    });
  }, [isOpen, student, preselectedLessonId, lessons]);

  const validate = (): string | null => {
    if (!formData.lesson) return 'יש לבחור שיעור';
    if (!formData.first_name.trim()) return 'שם פרטי הוא שדה חובה';
    if (!formData.last_name.trim()) return 'שם משפחה הוא שדה חובה';
    return null;
  };

  const save = async (keepOpen: boolean) => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        lesson: formData.lesson,
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        phone: formData.phone.trim(),
        notes: formData.notes.trim(),
      };
      if (student) {
        await updateExternalStudent(student.id, payload);
      } else {
        await createExternalStudent(payload);
      }
      onSuccess();
      if (keepOpen && !student) {
        // The lesson stays selected — the next name on the sheet is in the
        // same class far more often than not.
        setSavedCount((n) => n + 1);
        setFormData((prev) => ({ ...prev, first_name: '', last_name: '', phone: '', notes: '' }));
        firstNameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err: unknown) {
      const res = (err as { response?: { data?: Record<string, unknown> } }).response;
      const data = res?.data;
      const firstField = data && Object.values(data)[0];
      const message = Array.isArray(firstField) ? String(firstField[0]) : String(firstField ?? '');
      setError(message || 'שגיאה בשמירת התלמיד');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`}
      dir="rtl"
    >
      <div className={`bg-background rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}>
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background">
          <h2 className="text-xl font-bold">
            {isEdit ? 'עריכת תלמיד חיצוני' : 'הוספת תלמיד חיצוני'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors" aria-label="סגירה">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
          className="p-6 space-y-4"
        >
          {error && <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>}
          {savedCount > 0 && !error && (
            <div className="p-3 bg-emerald-500/10 text-emerald-700 rounded-lg text-sm">
              נשמרו {savedCount} תלמידים. אפשר להמשיך להקליד.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">שיעור</label>
            <select
              value={formData.lesson}
              onChange={(e) => setFormData((p) => ({ ...p, lesson: e.target.value }))}
              disabled={isEdit}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background disabled:opacity-60"
            >
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lessonLabel(lesson)}</option>
              ))}
            </select>
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                לא ניתן להעביר תלמיד בין שיעורים. להעברה: להסיר ולהוסיף מחדש.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-2">שם פרטי</label>
              <input
                ref={firstNameRef}
                value={formData.first_name}
                onChange={(e) => setFormData((p) => ({ ...p, first_name: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">שם משפחה</label>
              <input
                value={formData.last_name}
                onChange={(e) => setFormData((p) => ({ ...p, last_name: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">טלפון</label>
            <input
              value={formData.phone}
              onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
              placeholder="050-1234567"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              מוצג למדריך ברשימת הנוכחות, ומאפשר לשלוח וואטסאפ.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">הערה</label>
            <input
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-white bg-primary disabled:opacity-50"
            >
              {loading ? 'שומר…' : isEdit ? 'שמירה' : 'שמירה וסגירה'}
            </button>
            {!isEdit && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void save(true)}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                שמור והוסף עוד
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
