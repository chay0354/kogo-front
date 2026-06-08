'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { LessonFormData, Lesson, LessonPriceTier } from '@/types/course';

const FIRST_PRICE_TIER_INDEX = 2;

const sanitizePriceTiers = (
  tiers: LessonPriceTier[] | null | undefined,
  legacySecondLessonPrice?: number | string | null
): LessonPriceTier[] => {
  const normalized = Array.isArray(tiers)
    ? tiers
        .filter((t) => t && Number(t.course_index) >= FIRST_PRICE_TIER_INDEX)
        .map((t) => ({ course_index: Number(t.course_index), price: Number(t.price) || 0 }))
    : [];

  const legacyPrice = legacySecondLessonPrice == null ? 0 : Number(legacySecondLessonPrice);
  const hasSecondLessonTier = normalized.some((t) => t.course_index === FIRST_PRICE_TIER_INDEX);
  if (!hasSecondLessonTier && Number.isFinite(legacyPrice) && legacyPrice > 0) {
    normalized.unshift({ course_index: FIRST_PRICE_TIER_INDEX, price: legacyPrice });
  }

  return normalized
    .sort((a, b) => a.course_index - b.course_index)
    .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: t.price }));
};

interface EditLessonDialogProps {
  lesson: Lesson;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Monthly course price (display only; pricing is at course level). */
  coursePrice?: number | string | null;
}

interface Branch {
  id: string;
  name: string;
}

interface Room {
  id: string;
  name: string;
  branch: string;
}

interface Instructor {
  id: string;
  full_name: string;
}

export default function EditLessonDialog({
  lesson,
  open,
  onClose,
  onSuccess,
  coursePrice,
}: EditLessonDialogProps) {
  // Extract course ID - it might be a string ID or an object
  const getCourseId = (course: any): string => {
    if (!course) return '';
    if (typeof course === 'string') return course;
    if (course.id) return course.id;
    return '';
  };

  const [formData, setFormData] = useState<LessonFormData>({
    course: getCourseId(lesson.course),
    branch: lesson.branch?.id || '',
    room: lesson.room?.id || '',
    instructor: lesson.instructor?.id || '',
    day_of_week: lesson.day_of_week,
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    lesson_price_override: lesson.lesson_price_override !== null && lesson.lesson_price_override !== undefined ? Number(lesson.lesson_price_override) : undefined,
    instructor_salary_override: lesson.instructor_salary_override !== null && lesson.instructor_salary_override !== undefined ? Number(lesson.instructor_salary_override) : undefined,
    max_students: lesson.max_students !== null && lesson.max_students !== undefined ? Number(lesson.max_students) : undefined,
    notes: lesson.notes || '',
  });

  const [extraTiers, setExtraTiers] = useState<LessonPriceTier[]>(() =>
    sanitizePriceTiers(lesson.additional_course_prices, lesson.lesson_price_override)
  );

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');

  const daysOfWeek = [
    { value: 0, label: 'ראשון' },
    { value: 1, label: 'שני' },
    { value: 2, label: 'שלישי' },
    { value: 3, label: 'רביעי' },
    { value: 4, label: 'חמישי' },
    { value: 5, label: 'שישי' },
    { value: 6, label: 'שבת' },
  ];

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  // Update form data when lesson changes
  useEffect(() => {
    if (lesson) {
      setFormData({
        course: getCourseId(lesson.course),
        branch: lesson.branch?.id || '',
        room: lesson.room?.id || '',
        instructor: lesson.instructor?.id || '',
        day_of_week: lesson.day_of_week,
        start_time: lesson.start_time,
        end_time: lesson.end_time,
        lesson_price_override: lesson.lesson_price_override !== null && lesson.lesson_price_override !== undefined ? Number(lesson.lesson_price_override) : undefined,
        instructor_salary_override: lesson.instructor_salary_override !== null && lesson.instructor_salary_override !== undefined ? Number(lesson.instructor_salary_override) : undefined,
        max_students: lesson.max_students !== null && lesson.max_students !== undefined ? Number(lesson.max_students) : undefined,
        notes: lesson.notes || '',
      });
      setExtraTiers(sanitizePriceTiers(lesson.additional_course_prices, lesson.lesson_price_override));
    }
  }, [lesson, coursePrice]);

  const addExtraTier = () => {
    setExtraTiers((prev) => [
      ...prev,
      { course_index: FIRST_PRICE_TIER_INDEX + prev.length, price: 0 },
    ]);
  };

  const removeExtraTier = (idx: number) => {
    setExtraTiers((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: t.price }))
    );
  };

  const updateExtraTierPrice = (idx: number, raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    setExtraTiers((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, price: Number.isFinite(value) ? value : 0 } : t))
    );
  };

  useEffect(() => {
    // Auto-calculate end time (45 minutes after start time)
    if (formData.start_time) {
      const [hours, minutes] = formData.start_time.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + 45;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
      setFormData((prev) => ({ ...prev, end_time: endTime }));
    }
  }, [formData.start_time]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [branchesRes, roomsRes, instructorsRes] = await Promise.all([
        // Prefer lightweight dropdown payloads where supported
        api.get('/core/branches/?simple=true'),
        api.get('/core/rooms/'),
        api.get('/instructors/'),
      ]);

      const branchesData = Array.isArray(branchesRes.data)
        ? branchesRes.data
        : branchesRes.data?.results || [];
      const roomsData = Array.isArray(roomsRes.data) ? roomsRes.data : roomsRes.data?.results || [];
      const instructorsData = Array.isArray(instructorsRes.data)
        ? instructorsRes.data
        : instructorsRes.data?.instructors || instructorsRes.data?.results || [];

      setBranches(branchesData);
      setRooms(roomsData);
      setInstructors(instructorsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('שגיאה בטעינת נתונים');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.branch) {
      setError('יש לבחור סניף');
      return;
    }

    if (!formData.room) {
      setError('יש לבחור סטודיו');
      return;
    }

    if (!formData.instructor) {
      setError('יש לבחור מדריך');
      return;
    }

    if (formData.end_time <= formData.start_time) {
      setError('שעת סיום חייבת להיות אחרי שעת התחלה');
      return;
    }

    setLoading(true);
    try {
      const cleanedExtraTiers = extraTiers
        .filter((t) => Number.isFinite(t.price) && t.price > 0)
        .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: Number(t.price) }));
      const secondLessonTier = cleanedExtraTiers.find(
        (t) => t.course_index === FIRST_PRICE_TIER_INDEX
      );

      const submitData = {
        ...formData,
        price: null,
        lesson_price_override: secondLessonTier?.price || null,
        additional_course_prices: cleanedExtraTiers,
        instructor_salary_override: formData.instructor_salary_override || null,
        max_students: formData.max_students || null,
        is_recurring: true,
        status: 'scheduled',
      };

      await api.put(`/courses/lessons/${lesson.id}/`, submitData);
      onSuccess();
    } catch (err: any) {
      const errorData = err.response?.data;
      if (errorData?.room) {
        setError(errorData.room);
      } else if (errorData?.instructor) {
        setError(errorData.instructor);
      } else if (errorData?.detail) {
        setError(errorData.detail);
      } else if (errorData?.message) {
        setError(errorData.message);
      } else {
        setError('שגיאה בעדכון שיעור');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter rooms by selected branch
  const filteredRooms = formData.branch
    ? rooms.filter((room) => {
        // In case backend ever returns branch as object (defensive)
        const branchId = typeof (room as any).branch === 'string' ? (room as any).branch : (room as any).branch?.id;
        return branchId === formData.branch;
      })
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">עריכת שיעור<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #21</span></h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loadingData ? (
            <div className="py-8 text-center text-gray-600">טוען נתונים...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Day of Week */}
              <div>
                <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700 mb-1">
                  יום בשבוע <span className="text-red-500">*</span>
                </label>
                <select
                  id="day_of_week"
                  value={formData.day_of_week}
                  onChange={(e) => setFormData({ ...formData, day_of_week: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {daysOfWeek.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="start_time" className="block text-sm font-medium text-gray-700 mb-1">
                    שעת התחלה <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    id="start_time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="end_time" className="block text-sm font-medium text-gray-700 mb-1">
                    שעת סיום <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    id="end_time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">מתעדכן אוטומטית (+45 דקות)</p>
                </div>
              </div>

              {/* Branch */}
              <div>
                <label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-1">
                  סניף <span className="text-red-500">*</span>
                </label>
                <select
                  id="branch"
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value, room: '' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">בחר סניף</option>
                  {branches.map((branch: any) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Room */}
              <div>
                <label htmlFor="room" className="block text-sm font-medium text-gray-700 mb-1">
                  סטודיו / חדר <span className="text-red-500">*</span>
                </label>
                <select
                  id="room"
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={!formData.branch}
                  required
                >
                  <option value="">בחר סטודיו</option>
                  {filteredRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
                {!formData.branch && (
                  <p className="text-xs text-gray-500 mt-1">יש לבחור סניף קודם</p>
                )}
              </div>

              {/* Instructor */}
              <div>
                <label htmlFor="instructor" className="block text-sm font-medium text-gray-700 mb-1">
                  מדריך <span className="text-red-500">*</span>
                </label>
                <select
                  id="instructor"
                  value={formData.instructor}
                  onChange={(e) => setFormData({ ...formData, instructor: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">בחר מדריך</option>
                  {instructors.map((instructor: any) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Max Students */}
              <div>
                <label htmlFor="max_students" className="block text-sm font-medium text-gray-700 mb-1">
                  מקסימום תלמידים
                </label>
                <input
                  type="number"
                  id="max_students"
                  value={formData.max_students ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_students: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="השאר ריק לשימוש בקיבולת החדר"
                  min="1"
                  step="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  אופציונלי - מספר התלמידים המקסימלי שיכולים להירשם לשיעור
                </p>
              </div>

              {coursePrice != null && coursePrice !== '' && (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  מחיר חודשי לקבוצה: <strong>{Number(coursePrice).toLocaleString('he-IL')}₪</strong> (נערך בעריכת החוג)
                </p>
              )}

              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
                <p className="text-xs text-gray-600">
                  מחירים מוזלים לרישום מקביל (חוג שני ומעלה לתלמיד), חודשי.
                </p>
                {extraTiers.length > 0 && (
                  <div className="space-y-2">
                    {extraTiers.map((tier, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2"
                      >
                        <span className="flex-1 text-sm text-gray-700">
                          מחיר חודשי — חוג מקביל #{tier.course_index}
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            value={tier.price ? tier.price : ''}
                            onChange={(e) => updateExtraTierPrice(idx, e.target.value)}
                            className="w-32 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                            placeholder="₪"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExtraTier(idx)}
                          aria-label="הסר מדרגה"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addExtraTier}
                  className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  <span className="text-lg leading-none">+</span>
                  הוסף מחיר חודשי לחוג מקביל #{FIRST_PRICE_TIER_INDEX + extraTiers.length}
                </button>
              </div>

              {/* Salary Override */}
              <div>
                <label htmlFor="instructor_salary_override" className="block text-sm font-medium text-gray-700 mb-1">
                  שכר חריג (₪)
                </label>
                <input
                  type="number"
                  id="instructor_salary_override"
                  value={formData.instructor_salary_override || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      instructor_salary_override: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="השאר ריק לשכר רגיל"
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-gray-500 mt-1">
                  אופציונלי - עדיפות על פני מודל השכר הרגיל של המדריך
                </p>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  הערות
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="הערות נוספות"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-400"
                  disabled={loading}
                >
                  {loading ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

