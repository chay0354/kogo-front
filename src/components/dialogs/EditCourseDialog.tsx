'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { CourseFormData, Course, CourseWithLessons, LessonPriceTier } from '@/types/course';
import {
  FIRST_PRICE_TIER_INDEX,
  addExtraTier,
  cleanTiersForSubmit,
  removeExtraTier,
  tiersFromCourseLessons,
  updateExtraTierPrice,
} from '@/lib/coursePriceTiers';
import { formatAge } from '@/lib/courseUtils';

interface InstructorOption {
  id: string;
  full_name: string;
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
    min_age: course.min_age || 6,
    max_age: course.max_age || 18,
  });
  const [extraTiers, setExtraTiers] = useState<LessonPriceTier[]>(() =>
    tiersFromCourseLessons(courseWithLessons.lessons)
  );
  const [instructorId, setInstructorId] = useState('');
  const [instructorSalaryOverride, setInstructorSalaryOverride] = useState<number | undefined>();
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ageOptions = Array.from({ length: 18 }, (_, i) => i + 1);

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
    });
    setExtraTiers(tiersFromCourseLessons(courseWithLessons.lessons));
    setInstructorId(courseWithLessons.instructor?.id || '');
    setInstructorSalaryOverride(
      courseWithLessons.instructor_salary_override != null
        ? Number(courseWithLessons.instructor_salary_override)
        : undefined
    );
    setError('');

    api.get('/instructors/').then((res) => {
      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : data?.instructors || data?.results || [];
      setInstructors(list);
    }).catch(() => setInstructors([]));
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

    setLoading(true);
    try {
      await api.patch(`/courses/courses/${course.id}/`, {
        ...formData,
        instructor: instructorId,
        instructor_salary_override: instructorSalaryOverride ?? null,
      });

      const tierPayload = cleanTiersForSubmit(extraTiers);
      const lessons = courseWithLessons.lessons || [];

      if (lessons.length > 0) {
        await Promise.all(
          lessons.map((lesson) =>
            api.patch(`/courses/lessons/${lesson.id}/`, {
              price: null,
              ...tierPayload,
            })
          )
        );
      }

      onSuccess();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response
        ?.data;
      setError(data?.message || data?.error || 'שגיאה בעדכון קבוצה');
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
                  {ageOptions.map((age) => (
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
                  {ageOptions.map((age) => (
                    <option key={age} value={age}>
                      {formatAge(age)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
                <label htmlFor="instructor" className="block text-sm font-medium text-gray-700 mb-1">
                  מדריך <span className="text-red-500">*</span>
                </label>
                <select
                  id="instructor"
                  value={instructorId}
                  onChange={(e) => setInstructorId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
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
              <div>
                <label htmlFor="instructor_salary_override" className="block text-sm font-medium text-gray-700 mb-1">
                  שכר חריג (₪)
                </label>
                <input
                  type="number"
                  id="instructor_salary_override"
                  value={instructorSalaryOverride ?? ''}
                  onChange={(e) =>
                    setInstructorSalaryOverride(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="השאר ריק לשכר רגיל"
                  min="0"
                  step="0.01"
                />
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
