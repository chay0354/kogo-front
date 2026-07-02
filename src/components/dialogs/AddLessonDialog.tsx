'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { LessonFormData } from '@/types/course';
import { addMinutesToTime } from '@/lib/timeUtils';
import { TimeField } from '@/components/ui/time-picker';

interface Room {
  id: string;
  name: string;
  branch: string;
}

interface AddLessonDialogProps {
  courseId: string;
  branchId?: string;
  teamRoomId?: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddLessonDialog({
  courseId,
  branchId,
  teamRoomId,
  open,
  onClose,
  onSuccess,
}: AddLessonDialogProps) {
  const [formData, setFormData] = useState<LessonFormData>({
    course: courseId,
    room: teamRoomId || '',
    day_of_week: 0,
    start_time: '16:00',
    end_time: '16:45',
    notes: '',
  });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loading, setLoading] = useState(false);
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
      setFormData((prev) => ({
        ...prev,
        course: courseId,
        room: teamRoomId || '',
      }));
      setError('');
    }
  }, [open, courseId, teamRoomId]);

  useEffect(() => {
    if (!open || !branchId) return;
    setLoadingRooms(true);
    api
      .get('/core/rooms/')
      .then((res) => {
        const allRooms: Room[] = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setRooms(allRooms.filter((r) => r.branch === branchId));
      })
      .catch(() => setRooms([]))
      .finally(() => setLoadingRooms(false));
  }, [open, branchId]);

  useEffect(() => {
    if (formData.start_time) {
      setFormData((prev) => ({ ...prev, end_time: addMinutesToTime(prev.start_time, 45) }));
    }
  }, [formData.start_time]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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
      await api.post('/courses/lessons/', {
        course: courseId,
        room: formData.room,
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        notes: formData.notes || '',
        price: null,
        lesson_price_override: null,
        additional_course_prices: [],
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
          'שגיאה ביצירת שיעור'
      );
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
            <h2 className="text-2xl font-semibold text-gray-900">הוספת שיעור חדש</h2>
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
            <p className="text-sm text-gray-500">
              סניף וקיבולת נקבעים ברמת הקבוצה.
            </p>

            <div>
              <label htmlFor="add-lesson-room" className="block text-sm font-medium text-gray-700 mb-1">
                סטודיו / חדר <span className="text-red-500">*</span>
              </label>
              <select
                id="add-lesson-room"
                value={formData.room}
                onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
                disabled={loadingRooms || !branchId}
              >
                <option value="">
                  {loadingRooms ? 'טוען...' : !branchId ? 'סניף לא מוגדר לקבוצה' : 'בחר סטודיו'}
                </option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700 mb-1">
                יום בשבוע <span className="text-red-500">*</span>
              </label>
              <select
                id="day_of_week"
                value={formData.day_of_week}
                onChange={(e) => setFormData({ ...formData, day_of_week: Number(e.target.value) })}
                className="w-full px-2 py-1 border border-gray-300 rounded-[3px] focus:outline-none focus:ring-2 focus:ring-teal-500"
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
              <TimeField
                id="start_time"
                label="שעת התחלה"
                required
                value={formData.start_time}
                onChange={(start_time) => setFormData({ ...formData, start_time })}
                minuteStep={5}
              />
              <TimeField
                id="end_time"
                label="שעת סיום"
                required
                value={formData.end_time}
                onChange={(end_time) => setFormData({ ...formData, end_time })}
                helperText="מתעדכן אוטומטית (+45 דקות)"
                minuteStep={5}
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
                {loading ? 'שומר...' : 'הוסף שיעור'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
