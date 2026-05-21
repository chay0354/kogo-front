'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { CourseFormData, LessonFormData, LessonPriceTier } from '@/types/course';
import { formatAge } from '@/lib/courseUtils';

const FIRST_PRICE_TIER_INDEX = 2;

const toPositiveNumber = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

interface Branch { id: string; name: string; }
interface Room { id: string; name: string; branch: string; }
interface Instructor { id: string; full_name: string; }

interface AddCourseDialogProps {
  courseTypeId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddCourseDialog({
  courseTypeId,
  open,
  onClose,
  onSuccess,
}: AddCourseDialogProps) {
  const [courseData, setCourseData] = useState<CourseFormData>({
    course_type: courseTypeId,
    name: '',
    description: '',
    price: 0,
    capacity: 20,
    min_age: 6,
    max_age: 18,
  });

  const [lessonData, setLessonData] = useState<LessonFormData>({
    course: '',
    branch: '',
    room: '',
    instructor: '',
    day_of_week: 0,
    start_time: '16:00',
    end_time: '16:45',
    price: undefined,
    lesson_price_override: undefined,
    instructor_salary_override: undefined,
    max_students: undefined,
    notes: '',
  });
  const [extraTiers, setExtraTiers] = useState<LessonPriceTier[]>([]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courseCreated, setCourseCreated] = useState(false);

  const ageOptions = Array.from({ length: 18 }, (_, i) => i + 1);

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
    if (open && branches.length === 0) {
      fetchReferenceData();
    }
  }, [open]);

  // Seed lesson price from course price when lesson price hasn't been customised
  useEffect(() => {
    if (courseData.price > 0) {
      setLessonData((prev) =>
        prev.price === undefined ? { ...prev, price: toPositiveNumber(courseData.price) } : prev
      );
    }
  }, [courseData.price]);

  // Auto-calculate end time (+45 min) on start time change
  useEffect(() => {
    if (lessonData.start_time) {
      const [hours, minutes] = lessonData.start_time.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + 45;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
      setLessonData((prev) => ({ ...prev, end_time: endTime }));
    }
  }, [lessonData.start_time]);

  const fetchReferenceData = async () => {
    setLoadingData(true);
    try {
      const [branchesRes, roomsRes, instructorsRes] = await Promise.all([
        api.get('/core/branches/?simple=true'),
        api.get('/core/rooms/'),
        api.get('/instructors/'),
      ]);
      setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data?.results || []);
      setRooms(Array.isArray(roomsRes.data) ? roomsRes.data : roomsRes.data?.results || []);
      const instructorsRaw = instructorsRes.data;
      setInstructors(
        Array.isArray(instructorsRaw)
          ? instructorsRaw
          : instructorsRaw?.instructors || instructorsRaw?.results || []
      );
    } catch {
      setError('שגיאה בטעינת נתונים');
    } finally {
      setLoadingData(false);
    }
  };

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

  const filteredRooms = lessonData.branch
    ? rooms.filter((room) => {
        const branchId =
          typeof (room as any).branch === 'string'
            ? (room as any).branch
            : (room as any).branch?.id;
        return branchId === lessonData.branch;
      })
    : [];

  const handleClose = () => {
    if (courseCreated) {
      onSuccess();
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Course validation
    if (!courseData.name.trim()) {
      setError('שם החוג הוא שדה חובה');
      return;
    }
    if (courseData.price <= 0) {
      setError('מחיר חייב להיות גדול מ-0');
      return;
    }
    if (courseData.max_age < courseData.min_age) {
      setError('גיל מקסימום חייב להיות גדול או שווה לגיל מינימום');
      return;
    }

    // Lesson validation
    if (!lessonData.branch) { setError('יש לבחור סניף'); return; }
    if (!lessonData.room) { setError('יש לבחור סטודיו'); return; }
    if (!lessonData.instructor) { setError('יש לבחור מדריך'); return; }
    if (lessonData.end_time <= lessonData.start_time) {
      setError('שעת סיום חייבת להיות אחרי שעת התחלה');
      return;
    }

    setLoading(true);
    try {
      // Step 1: create the course
      const courseRes = await api.post('/courses/courses/', courseData);
      const newCourseId = courseRes.data.id;

      // Step 2: create the lesson assigned to the new course
      setCourseCreated(true);
      try {
        const cleanedExtraTiers = extraTiers
          .filter((t) => Number.isFinite(t.price) && t.price > 0)
          .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: Number(t.price) }));
        const secondLessonTier = cleanedExtraTiers.find(
          (t) => t.course_index === FIRST_PRICE_TIER_INDEX
        );

        const lessonSubmitData = {
          ...lessonData,
          course: newCourseId,
          price: lessonData.price || null,
          lesson_price_override: secondLessonTier?.price || null,
          additional_course_prices: cleanedExtraTiers,
          instructor_salary_override: lessonData.instructor_salary_override || null,
          max_students: lessonData.max_students || null,
          is_recurring: true,
          status: 'scheduled',
        };

        await api.post('/courses/lessons/', lessonSubmitData);
        onSuccess();
      } catch (lessonErr: any) {
        const errorData = lessonErr.response?.data;
        const lessonErrMsg =
          errorData?.room ||
          errorData?.instructor ||
          errorData?.detail ||
          errorData?.message ||
          'שגיאה ביצירת שיעור';
        setError(
          `החוג נוצר בהצלחה. השיעור לא נוצר: ${lessonErrMsg}. ניתן לסגור ולהוסיף שיעור ידנית.`
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה ביצירת חוג');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">הוספת חוג חדש</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                שם החוג / רמה <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={courseData.name}
                onChange={(e) => setCourseData({ ...courseData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="לדוגמה: מתחילים, מתקדמים, כיתה א'-ג'"
                required
              />
            </div>

            {/* Age Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="min_age" className="block text-sm font-medium text-gray-700 mb-1">
                  גיל מינימום <span className="text-red-500">*</span>
                </label>
                <select
                  id="min_age"
                  value={courseData.min_age}
                  onChange={(e) => setCourseData({ ...courseData, min_age: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {ageOptions.map((age) => (
                    <option key={age} value={age}>{formatAge(age)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="max_age" className="block text-sm font-medium text-gray-700 mb-1">
                  גיל מקסימום <span className="text-red-500">*</span>
                </label>
                <select
                  id="max_age"
                  value={courseData.max_age}
                  onChange={(e) => setCourseData({ ...courseData, max_age: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {ageOptions.map((age) => (
                    <option key={age} value={age}>{formatAge(age)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Price and Capacity */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                  מחיר חודשי (₪) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="price"
                  value={courseData.price || ''}
                  onChange={(e) => setCourseData({ ...courseData, price: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="140"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 mb-1">
                  קיבולת מקסימלית
                </label>
                <input
                  type="number"
                  id="capacity"
                  value={courseData.capacity}
                  onChange={(e) => setCourseData({ ...courseData, capacity: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="20"
                  min="1"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                תיאור
              </label>
              <textarea
                id="description"
                value={courseData.description}
                onChange={(e) => setCourseData({ ...courseData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="תיאור אופציונלי של החוג"
              />
            </div>

            {/* Lesson fields */}
            <div className="border border-teal-200 rounded-lg p-4 space-y-4 bg-teal-50">
                <h3 className="text-lg font-semibold text-teal-800 border-b border-teal-200 pb-2">
                  פרטי השיעור
                </h3>

                {loadingData ? (
                  <div className="py-4 text-center text-gray-600">טוען נתונים...</div>
                ) : (
                  <>
                    {/* Day of Week */}
                    <div>
                      <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700 mb-1">
                        יום בשבוע <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="day_of_week"
                        value={lessonData.day_of_week}
                        onChange={(e) =>
                          setLessonData({ ...lessonData, day_of_week: Number(e.target.value) })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                      >
                        {daysOfWeek.map((day) => (
                          <option key={day.value} value={day.value}>{day.label}</option>
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
                          value={lessonData.start_time}
                          onChange={(e) =>
                            setLessonData({ ...lessonData, start_time: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
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
                          value={lessonData.end_time}
                          onChange={(e) =>
                            setLessonData({ ...lessonData, end_time: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">מתעדכן אוטומטית (+45 דקות)</p>
                      </div>
                    </div>

                    {/* Branch */}
                    <div>
                      <label htmlFor="lesson_branch" className="block text-sm font-medium text-gray-700 mb-1">
                        סניף <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="lesson_branch"
                        value={lessonData.branch}
                        onChange={(e) =>
                          setLessonData({ ...lessonData, branch: e.target.value, room: '' })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        required
                      >
                        <option value="">בחר סניף</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Room */}
                    <div>
                      <label htmlFor="lesson_room" className="block text-sm font-medium text-gray-700 mb-1">
                        סטודיו / חדר <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="lesson_room"
                        value={lessonData.room}
                        onChange={(e) =>
                          setLessonData({ ...lessonData, room: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        disabled={!lessonData.branch}
                        required
                      >
                        <option value="">בחר סטודיו</option>
                        {filteredRooms.map((room) => (
                          <option key={room.id} value={room.id}>{room.name}</option>
                        ))}
                      </select>
                      {!lessonData.branch && (
                        <p className="text-xs text-gray-500 mt-1">יש לבחור סניף קודם</p>
                      )}
                    </div>

                    {/* Instructor */}
                    <div>
                      <label htmlFor="lesson_instructor" className="block text-sm font-medium text-gray-700 mb-1">
                        מדריך <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="lesson_instructor"
                        value={lessonData.instructor}
                        onChange={(e) =>
                          setLessonData({ ...lessonData, instructor: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        required
                      >
                        <option value="">בחר מדריך</option>
                        {instructors.map((instructor) => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Max Students */}
                    <div>
                      <label htmlFor="lesson_max_students" className="block text-sm font-medium text-gray-700 mb-1">
                        מקסימום תלמידים
                      </label>
                      <input
                        type="number"
                        id="lesson_max_students"
                        value={lessonData.max_students ?? ''}
                        onChange={(e) =>
                          setLessonData({
                            ...lessonData,
                            max_students: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        placeholder="השאר ריק לשימוש בקיבולת החדר"
                        min="1"
                        step="1"
                      />
                    </div>

                    {/* Lesson Price */}
                    <div>
                      <label htmlFor="lesson_price" className="block text-sm font-medium text-gray-700 mb-1">
                        מחיר שיעור (₪)
                      </label>
                      <input
                        type="number"
                        id="lesson_price"
                        value={lessonData.price ?? ''}
                        onChange={(e) =>
                          setLessonData({
                            ...lessonData,
                            price: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        placeholder="השאר ריק לשימוש במחיר החוג"
                        min="0"
                        step="0.01"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        אופציונלי - אם ריק, ישתמש במחיר החוג
                      </p>
                    </div>

                    {/* Extra price tiers */}
                    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 space-y-3">
                      {extraTiers.length > 0 && (
                        <div className="space-y-2">
                          {extraTiers.map((tier, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                            >
                              <span className="flex-1 text-sm text-gray-700">
                                מחיר עבור השיעור ה-{tier.course_index}
                              </span>
                              <input
                                type="number"
                                value={tier.price ? tier.price : ''}
                                onChange={(e) => updateExtraTierPrice(idx, e.target.value)}
                                className="w-32 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                                placeholder="₪"
                                min="0"
                                step="0.01"
                              />
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
                        הוסף מחיר עבור השיעור ה-{FIRST_PRICE_TIER_INDEX + extraTiers.length}
                      </button>
                    </div>

                    {/* Salary Override */}
                    <div>
                      <label htmlFor="lesson_salary_override" className="block text-sm font-medium text-gray-700 mb-1">
                        שכר חריג (₪)
                      </label>
                      <input
                        type="number"
                        id="lesson_salary_override"
                        value={lessonData.instructor_salary_override ?? ''}
                        onChange={(e) =>
                          setLessonData({
                            ...lessonData,
                            instructor_salary_override: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        placeholder="השאר ריק לשכר רגיל"
                        min="0"
                        step="0.01"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        אופציונלי - עדיפות על פני מודל השכר הרגיל של המדריך
                      </p>
                    </div>
                  </>
                )}
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
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                {courseCreated ? 'סגור ורענן' : 'ביטול'}
              </button>
              {!courseCreated && (
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-400"
                  disabled={loading}
                >
                  {loading ? 'שומר...' : 'הוסף קבוצה ושיעור'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
