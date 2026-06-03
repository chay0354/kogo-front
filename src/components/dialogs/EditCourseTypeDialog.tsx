'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { CourseTypeWithStats } from '@/types/course';

interface EditCourseTypeDialogProps {
  courseType: CourseTypeWithStats;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditCourseTypeDialog({
  courseType,
  open,
  onClose,
  onSuccess,
}: EditCourseTypeDialogProps) {
  const [formData, setFormData] = useState({
    name: courseType.name,
    description: courseType.description ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('שם התחום הוא שדה חובה');
      return;
    }

    setLoading(true);
    try {
      await api.patch(`/courses/types/${courseType.id}/`, formData);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בעדכון תחום');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">עריכת תחום</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="ct-name" className="block text-sm font-medium text-gray-700 mb-1">
                שם התחום <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="ct-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>

            <div>
              <label htmlFor="ct-description" className="block text-sm font-medium text-gray-700 mb-1">
                תיאור
              </label>
              <textarea
                id="ct-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="תיאור אופציונלי של התחום"
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
