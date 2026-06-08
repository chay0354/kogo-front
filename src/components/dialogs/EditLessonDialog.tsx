'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { LessonFormData, Lesson } from '@/types/course';

interface EditLessonDialogProps {
  lesson: Lesson;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
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

export default function EditLessonDialog({
  lesson,
  open,
  onClose,
  onSuccess,
}: EditLessonDialogProps) {
  const getCourseId = (course: unknown): string => {
    if (!course) return '';
    if (typeof course === 'string') return course;
    if (typeof course === 'object' && course !== null && 'id' in course) {
      return String((course as { id: string }).id);
    }
    return '';
  };

  const [formData, setFormData] = useState<LessonFormData>({
    course: getCourseId(lesson.course),
    branch: lesson.branch?.id || '',
    room: lesson.room?.id || '',
    day_of_week: lesson.day_of_week,
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    max_students:
      lesson.max_students !== null && lesson.max_students !== undefined
        ? Number(lesson.max_students)
        : undefined,
    notes: lesson.notes || '',
  });

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
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

  useEffect(() => {
    if (lesson) {
      setFormData({
        course: getCourseId(lesson.course),
        branch: lesson.branch?.id || '',
        room: lesson.room?.id || '',
        day_of_week: lesson.day_of_week,
        start_time: lesson.start_time,
        end_time: lesson.end_time,
        max_students:
          lesson.max_students !== null && lesson.max_students !== undefined
            ? Number(lesson.max_students)
            : undefined,
        notes: lesson.notes || '',
      });
    }
  }, [lesson]);

  useEffect(() => {
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
      const [branchesRes, roomsRes] = await Promise.all([
        api.get('/core/branches/?simple=true'),
        api.get('/core/rooms/'),
      ]);

      setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data?.results || []);
      setRooms(Array.isArray(roomsRes.data) ? roomsRes.data : roomsRes.data?.results || []);
    } catch {
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
    if (formData.end_time <= formData.start_time) {
      setError('שעת סיום חייבת להיות אחרי שעת התחלה');
      return;
    }

    setLoading(true);
    try {
      await api.put(`/courses/lessons/${lesson.id}/`, {
        course: formData.course,
        room: formData.room,
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        max_students: formData.max_students || null,
        notes: formData.notes || '',
        is_recurring: true,
        status: 'scheduled',
      });
      onSuccess();
    } catch (err: unknown) {
      const errorData = (err as { response?: { data?: Record<string, string> } })?.response?.data;
      setError(
        errorData?.room ||
          errorData?.instructor ||
          errorData?.detail ||
          errorData?.message ||
          'שגיאה בעדכון שיעור'
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredRooms = formData.branch
    ? rooms.filter((room) => {
        const branchId =
          typeof (room as Room & { branch?: string | { id: string } }).branch === 'string'
            ? (room as Room).branch
            : (room as Room & { branch?: { id: string } }).branch?.id;
        return branchId === formData.branch;
      })
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">עריכת שיעור</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loadingData ? (
            <div className="py-8 text-center text-gray-600">טוען נתונים...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-500">
                מדריך הקבוצה נקבע ברמת הקבוצה — ערוך ב&quot;עריכת קבוצה&quot;.
              </p>

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
              </div>

              <div>
                <label htmlFor="max_students" className="block text-sm font-medium text-gray-700 mb-1">
                  מקסימום תלמידים
                </label>
                <input
                  type="number"
                  id="max_students"
                  value={formData.max_students || ''}
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
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  הערות
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
          )}
        </div>
      </div>
    </div>
  );
}
