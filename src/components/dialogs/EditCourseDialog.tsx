'use client';

import { useState, useEffect } from 'react';
import api, { fetchInstructorsDropdown } from '@/lib/api';
import { CourseFormData, Course, CourseWithLessons, LessonPriceTier } from '@/types/course';
import {
  FIRST_PRICE_TIER_INDEX,
  addExtraTier,
  cleanTiersForSubmit,
  removeExtraTier,
  tiersFromCourseLessons,
  updateExtraTierPrice,
} from '@/lib/coursePriceTiers';
import {
  AGE_OPTIONS,
  formatAge,
  formatCurrency,
  formatTimeRange,
  getDayName,
  getInstructorMonthlySalaryFromProfile,
  LESSONS_PER_MONTH,
} from '@/lib/courseUtils';
import LessonPriceOptionsEditor from '@/components/dialogs/LessonPriceOptionsEditor';
import InstructorSelect from '@/components/InstructorSelect';
import StudioBusyWarning, { useStudioBusyConflicts } from '@/components/dialogs/StudioBusyWarning';
import styles from './EditCourseDialog.module.css';

interface Branch {
  id: string;
  name: string;
  is_external?: boolean;
}

interface Room {
  id: string;
  name: string;
  branch: string;
}

interface InstructorOption {
  id: string;
  full_name: string;
  fixed_salary_per_lesson?: string | number;
}

interface EditCourseDialogProps {
  course: Course | CourseWithLessons;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function asCourseWithLessons(course: Course | CourseWithLessons): CourseWithLessons {
  return course as CourseWithLessons;
}

export default function EditCourseDialog({
  course,
  open,
  onClose,
  onSuccess,
}: EditCourseDialogProps) {
  const courseWithLessons = asCourseWithLessons(course);

  const getCourseType = (): string => {
    if ('course_type' in course && course.course_type) {
      return course.course_type;
    }
    return '';
  };

  const [formData, setFormData] = useState<CourseFormData>({
    course_type: getCourseType(),
    name: course.name,
    description: course.description || '',
    price: Number(course.price),
    capacity: course.capacity,
    min_age: course.min_age || 1,
    max_age: course.max_age || 14,
    is_adult: course.is_adult ?? false,
    must_attend_all_lessons: course.must_attend_all_lessons ?? false,
    trial_lesson_is_paid: course.trial_lesson_is_paid ?? false,
    trial_lesson_price: course.trial_lesson_price != null ? Number(course.trial_lesson_price) : null,
    external_link: course.external_link || '',
  });
  const [extraTiers, setExtraTiers] = useState<LessonPriceTier[]>(() =>
    tiersFromCourseLessons(courseWithLessons.lessons)
  );
  const [instructorId, setInstructorId] = useState('');
  const [instructorSalaryOverride, setInstructorSalaryOverride] = useState<number | undefined>();
  const [branchId, setBranchId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingReferenceData, setLoadingReferenceData] = useState(false);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedBranch = branches.find((b) => b.id === branchId);

  useEffect(() => {
    if (!open || !course) return;

    setFormData({
      course_type: getCourseType(),
      name: course.name,
      description: course.description || '',
      price: Number(course.price),
      capacity: course.capacity,
      min_age: course.min_age || 6,
      max_age: course.max_age || 18,
      is_adult: course.is_adult ?? false,
      must_attend_all_lessons: course.must_attend_all_lessons ?? false,
      trial_lesson_is_paid: course.trial_lesson_is_paid ?? false,
      trial_lesson_price: course.trial_lesson_price != null ? Number(course.trial_lesson_price) : null,
      external_link: course.external_link || '',
    });
    setExtraTiers(tiersFromCourseLessons(courseWithLessons.lessons));
    setInstructorId(courseWithLessons.instructor?.id || '');
    setInstructorSalaryOverride(
      courseWithLessons.instructor_salary_override != null
        ? Number(courseWithLessons.instructor_salary_override)
        : undefined
    );
    setBranchId(
      typeof courseWithLessons.branch === 'string' ? courseWithLessons.branch : ''
    );
    setRoomId(courseWithLessons.lessons?.[0]?.room?.id || '');
    setError('');

    setLoadingReferenceData(true);
    Promise.all([
      api.get('/core/branches/?simple=true'),
      api.get('/core/rooms/', { params: { dropdown: 'true' } }),
    ])
      .then(([branchesRes, roomsRes]) => {
        const branchList = Array.isArray(branchesRes.data)
          ? branchesRes.data
          : branchesRes.data?.results || [];
        setBranches(branchList);
        setRooms(Array.isArray(roomsRes.data) ? roomsRes.data : roomsRes.data?.results || []);
        if (!courseWithLessons.branch && courseWithLessons.branch_name) {
          const match = branchList.find(
            (branch: Branch) => branch.name === courseWithLessons.branch_name
          );
          if (match) setBranchId(match.id);
        }
      })
      .catch(() => {
        setBranches([]);
        setRooms([]);
      })
      .finally(() => setLoadingReferenceData(false));

    setLoadingInstructors(true);
    fetchInstructorsDropdown()
      .then((list) => setInstructors(Array.isArray(list) ? list : []))
      .catch(() => setInstructors([]))
      .finally(() => setLoadingInstructors(false));
  }, [open, course]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('שם הקבוצה הוא שדה חובה');
      return;
    }

    if (formData.price <= 0) {
      setError('מחיר חודשי חייב להיות גדול מ-0');
      return;
    }

    if (formData.max_age < formData.min_age) {
      setError('גיל מקסימום חייב להיות גדול או שווה לגיל מינימום');
      return;
    }

    if (!instructorId) {
      setError('יש לבחור מדריך');
      return;
    }

    if (formData.trial_lesson_is_paid && (!formData.trial_lesson_price || formData.trial_lesson_price <= 0)) {
      setError('יש להזין מחיר לשיעור ניסיון בתשלום');
      return;
    }

    if (!branchId) {
      setError('יש לבחור סניף');
      return;
    }

    const hasScheduledLessons = (courseWithLessons.lessons || []).some((l) => l.status === 'scheduled');
    if (!roomId && hasScheduledLessons) {
      setError('יש לבחור סטודיו');
      return;
    }

    setLoading(true);
    try {
      await api.patch(`/courses/courses/${course.id}/`, {
        ...formData,
        branch: branchId,
        instructor: instructorId,
        instructor_salary_override: instructorSalaryOverride ?? null,
        external_link: selectedBranch?.is_external ? (formData.external_link || '') : '',
        trial_lesson_price: formData.trial_lesson_is_paid ? formData.trial_lesson_price : null,
      });

      const tierPayload = cleanTiersForSubmit(extraTiers);
      const lessons = (courseWithLessons.lessons || []).filter((l) => l.status === 'scheduled');

      if (lessons.length > 0) {
        await Promise.all(
          lessons.map((lesson) =>
            api.patch(`/courses/lessons/${lesson.id}/`, {
              room: roomId,
              price: null,
              ...tierPayload,
            })
          )
        );
      }

      onSuccess();
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (err as any)?.response?.data;
      let msg: string;
      if (typeof data === 'string') {
        msg = data;
      } else if (data?.message) {
        msg = data.message;
      } else if (data?.error) {
        msg = data.error;
      } else if (data?.detail) {
        msg = data.detail;
      } else if (data && typeof data === 'object') {
        const flat = Object.values(data).flat().filter((v): v is string => typeof v === 'string');
        msg = flat.join(' | ') || 'שגיאה בעדכון קבוצה';
      } else {
        msg = 'שגיאה בעדכון קבוצה';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const scheduledLessons = (courseWithLessons.lessons || []).filter((l) => l.status === 'scheduled');
  const studioConflicts = useStudioBusyConflicts({
    open,
    slots: scheduledLessons.map((lesson) => ({
      roomId,
      dayOfWeek: lesson.day_of_week,
      startTime: lesson.start_time,
      endTime: lesson.end_time,
    })),
    excludeCourseId: course.id,
  });

  if (!open) return null;

  const filteredRooms = branchId
    ? rooms.filter((room) => {
        const roomBranchId =
          typeof room.branch === 'string' ? room.branch : (room as Room & { branch?: { id: string } }).branch?.id;
        return roomBranchId === branchId;
      })
    : [];

  // Default monthly pay derived from the instructor's salary model (מסך מדריכים).
  const slotCount = courseWithLessons.lessons?.length || 0;
  const selectedInstructor = instructors.find((i) => i.id === instructorId);
  let defaultMonthlySalary = 0;
  if (instructorId && instructorId === courseWithLessons.instructor?.id) {
    // Course's current instructor has full salary info (tiers/fixed) for an accurate calc.
    defaultMonthlySalary = getInstructorMonthlySalaryFromProfile(courseWithLessons);
  } else if (selectedInstructor?.fixed_salary_per_lesson != null) {
    defaultMonthlySalary =
      Number(selectedInstructor.fixed_salary_per_lesson) * LESSONS_PER_MONTH * slotCount;
  }
  const hasDefaultMonthlySalary = defaultMonthlySalary > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">עריכת קבוצה</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                שם הקבוצה / רמה <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="min_age" className="block text-sm font-medium text-gray-700 mb-1">
                  גיל מינימום <span className="text-red-500">*</span>
                </label>
                <select
                  id="min_age"
                  value={formData.min_age}
                  onChange={(e) => setFormData({ ...formData, min_age: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {AGE_OPTIONS.map((age) => (
                    <option key={age} value={age}>
                      {formatAge(age)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="max_age" className="block text-sm font-medium text-gray-700 mb-1">
                  גיל מקסימום <span className="text-red-500">*</span>
                </label>
                <select
                  id="max_age"
                  value={formData.max_age}
                  onChange={(e) => setFormData({ ...formData, max_age: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {AGE_OPTIONS.map((age) => (
                    <option key={age} value={age}>
                      {formatAge(age)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.adultToggleRow}>
              <label htmlFor="is_adult_edit" className={styles.adultToggleLabel}>
                <input type="checkbox" id="is_adult_edit" className={styles.adultCheckbox} checked={formData.is_adult ?? false} onChange={(e) => setFormData({ ...formData, is_adult: e.target.checked })} />
                18+
              </label>
            </div>

            <div className={styles.adultToggleRow}>
              <label htmlFor="must_attend_all_lessons_edit" className={styles.adultToggleLabel}>
                <input type="checkbox" id="must_attend_all_lessons_edit" className={styles.adultCheckbox} checked={formData.must_attend_all_lessons ?? false} onChange={(e) => setFormData({ ...formData, must_attend_all_lessons: e.target.checked })} />
                מחוייב בכל השיעורים
              </label>
            </div>

            <div className={styles.adultToggleRow}>
              <label htmlFor="trial_lesson_is_paid_edit" className={styles.adultToggleLabel}>
                <input
                  type="checkbox"
                  id="trial_lesson_is_paid_edit"
                  className={styles.adultCheckbox}
                  checked={formData.trial_lesson_is_paid ?? false}
                  onChange={(e) => setFormData({
                    ...formData,
                    trial_lesson_is_paid: e.target.checked,
                    trial_lesson_price: e.target.checked ? formData.trial_lesson_price : null,
                  })}
                />
                שיעור ניסיון בתשלום
              </label>
            </div>
            {formData.trial_lesson_is_paid ? (
              <div>
                <label htmlFor="trial_lesson_price_edit" className="block text-sm font-medium text-gray-700 mb-1">
                  מחיר שיעור ניסיון (₪) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="trial_lesson_price_edit"
                  value={formData.trial_lesson_price ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    trial_lesson_price: e.target.value === '' ? null : Number(e.target.value),
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="50"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                  מחיר חודשי (₪) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="price"
                  value={formData.price || ''}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  min="1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-1">
                  סניף <span className="text-red-500">*</span>
                </label>
                <select
                  id="branch"
                  value={branchId}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setRoomId('');
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                  disabled={loadingReferenceData}
                >
                  <option value="">{loadingReferenceData ? 'טוען...' : 'בחר סניף'}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="room" className="block text-sm font-medium text-gray-700 mb-1">
                  סטודיו / חדר <span className="text-red-500">*</span>
                </label>
                <select
                  id="room"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required={(courseWithLessons.lessons || []).some((l) => l.status === 'scheduled')}
                  disabled={!branchId || loadingReferenceData}
                >
                  <option value="">בחר סטודיו</option>
                  {filteredRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
                {courseWithLessons.lessons?.filter((l) => l.status === 'scheduled').length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    לקבוצה זו אין מועדי שיעור עדיין — הסטודיו ייבחר בעת הוספת המועד הראשון.
                  </p>
                )}
              </div>
            </div>

            {/* External link — shown only when the selected branch is external */}
            {selectedBranch?.is_external && (
              <div>
                <label htmlFor="course_external_link_edit" className="block text-sm font-medium text-gray-700 mb-1">
                  לינק חיצוני לחוג
                </label>
                <input
                  type="url"
                  id="course_external_link_edit"
                  value={formData.external_link || ''}
                  onChange={(e) => setFormData({ ...formData, external_link: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-500 mt-1">ריק = שימוש בלינק החיצוני של הסניף.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="instructor" className="block text-sm font-medium text-gray-700 mb-1">
                  מדריך <span className="text-red-500">*</span>
                </label>
                <InstructorSelect
                  id="instructor"
                  value={instructorId}
                  onChange={setInstructorId}
                  instructors={instructors}
                  disabled={loadingInstructors}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 text-right"
                  placeholder={loadingInstructors ? 'טוען מדריכים...' : 'בחר מדריך'}
                />
              </div>
              <div>
                <label htmlFor="instructor_salary_override" className="block text-sm font-medium text-gray-700 mb-1">
                  שכר מדריך לקבוצה (₪ לחודש)
                </label>
                <input
                  type="number"
                  id="instructor_salary_override"
                  value={instructorSalaryOverride ?? ''}
                  onChange={(e) =>
                    setInstructorSalaryOverride(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={
                    hasDefaultMonthlySalary
                      ? `ברירת מחדל: ${formatCurrency(defaultMonthlySalary)}`
                      : 'סכום חודשי למדריך עבור הקבוצה'
                  }
                  min="0"
                  step="0.01"
                />
                {hasDefaultMonthlySalary ? (
                  <p className="text-xs text-gray-500 mt-1">
                    שכר לפי הגדרות המדריך: {formatCurrency(defaultMonthlySalary)} לחודש. השאר ריק כדי
                    להשתמש בערך זה, או הזן סכום חודשי כדי לדרוס אותו.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    תשלום חודשי קבוע למדריך עבור הקבוצה. ריק = שכר לפי הגדרות המדריך במסך מדריכים.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">מחירים מוזלים — רישום מקביל</p>
              {extraTiers.length > 0 && (
                <div className="space-y-2">
                  {extraTiers.map((tier, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2"
                    >
                      <span className="flex-1 text-sm text-gray-700">
                        חוג מקביל #{tier.course_index}
                      </span>
                      <input
                        type="number"
                        value={tier.price ? tier.price : ''}
                        onChange={(e) =>
                          setExtraTiers((prev) => updateExtraTierPrice(prev, idx, e.target.value))
                        }
                        className="w-28 px-2 py-1 border border-gray-300 rounded-md text-sm"
                        placeholder="₪"
                        min="0"
                        step="0.01"
                      />
                      <button
                        type="button"
                        onClick={() => setExtraTiers((prev) => removeExtraTier(prev, idx))}
                        aria-label="הסר מדרגה"
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setExtraTiers((prev) => addExtraTier(prev))}
                className="text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                + הוסף מחיר לחוג מקביל #{FIRST_PRICE_TIER_INDEX + extraTiers.length}
              </button>
            </div>

            {scheduledLessons.length > 0 ? (
              <div className={styles.priceOptionsSection}>
                {scheduledLessons.map((lesson) => (
                  <LessonPriceOptionsEditor
                    key={lesson.id}
                    lessonId={lesson.id}
                    lessonLabel={`${getDayName(lesson.day_of_week)} ${formatTimeRange(lesson.start_time, lesson.end_time)}`}
                    courseName={formData.name || course.name}
                    defaultPrice={formData.price}
                    courseMinAge={formData.min_age}
                    courseMaxAge={formData.max_age}
                    embedded
                  />
                ))}
              </div>
            ) : (
              <p className={styles.priceOptionsHint}>
                לאחר הוספת מועד שיעור, ניתן להגדיר כאן מחירים נוספים לווידג&apos;ט (2 מחירונים לאותו שיעור).
              </p>
            )}

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                תיאור
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <StudioBusyWarning conflicts={studioConflicts} />

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                ביטול
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-400"
                disabled={loading}
              >
                {loading ? 'שומר...' : 'שמור שינויים'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
