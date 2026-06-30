'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { CourseTypeWithStats } from '@/types/course';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');

  const canDelete = courseType.courses_count === 0;

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

  const handleDeleteConfirm = async (confirmed: boolean) => {
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      await api.delete(`/courses/types/${courseType.id}/`);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה במחיקת תחום');
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <>
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

              <div className="pt-2">
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                    disabled={loading || deleting}
                  >
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    {deleting ? 'מוחק...' : 'מחק תחום'}
                  </button>
                ) : (
                  <p className="text-xs text-gray-500">
                    לא ניתן למחוק תחום שיש בו חוגים ({courseType.courses_count})
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading || deleting}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
                  disabled={loading || deleting}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title="מחיקת תחום"
        message={`האם אתה בטוח שברצונך למחוק את התחום "${courseType.name}"?`}
        confirmText="מחק"
        type="warning"
      />
    </>
  );
}
