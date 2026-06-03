'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { CourseFormData, Course, CourseWithLessons } from '@/types/course';
import { formatAge } from '@/lib/courseUtils';

interface EditCourseDialogProps {
  course: Course | CourseWithLessons;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditCourseDialog({
  course,
  open,
  onClose,
  onSuccess,
}: EditCourseDialogProps) {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Age options (1-18) to support ages 1-6 and grades א-יב (7-18)
  const ageOptions = Array.from({ length: 18 }, (_, i) => i + 1);

  // Update form data when course changes
  useEffect(() => {
    if (course) {
      setFormData({
        course_type: getCourseType(),
        name: course.name,
        description: course.description || '',
        price: Number(course.price),
        capacity: course.capacity,
        min_age: course.min_age || 6,
        max_age: course.max_age || 18,
      });
    }
  }, [course]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('שם החוג הוא שדה חובה');
      return;
    }

    if (formData.price <= 0) {
      setError('מחיר חייב להיות גדול מ-0');
      return;
    }

    if (formData.max_age < formData.min_age) {
      setError('גיל מקסימום חייב להיות גדול או שווה לגיל מינימום');
      return;
    }

    setLoading(true);
    try {
      await api.put(`/courses/courses/${course.id}/`, formData);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בעדכון חוג');
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
            <h2 className="text-2xl font-semibold text-gray-900">עריכת חוג<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #18</span></h2>
            <button
              onClick={onClose}
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
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

            {/* Price and Capacity */}
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
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
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
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="תיאור אופציונלי של החוג"
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
        </div>
      </div>
    </div>
  );
}

