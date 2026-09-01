'use client';

import { useState, useEffect } from 'react';
import api, { fetchInstructorsDropdown } from '@/lib/api';
import { LessonFormData, Lesson } from '@/types/course';
import { addMinutesToTime, normalizeTimeValue } from '@/lib/timeUtils';
import { TimeField } from '@/components/ui/time-picker';
import InstructorSelect from '@/components/InstructorSelect';
import StudioBusyWarning, { useStudioBusyConflicts } from '@/components/dialogs/StudioBusyWarning';

interface InstructorOption {
  id: string;
  full_name: string;
}

interface RoomOption {
  id: string;
  name: string;
  branch?: string;
}

interface EditLessonDialogProps {
  lesson: Lesson;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function lessonInstructorId(lesson: Lesson): string {
  if (!lesson.instructor) return '';
  if (typeof lesson.instructor === 'string') return lesson.instructor;
  return lesson.instructor.id || '';
}

function lessonInstructorName(lesson: Lesson): string {
  if (!lesson.instructor || typeof lesson.instructor === 'string') return '';
  return lesson.instructor.full_name || '';
}

function lessonRoomId(lesson: Lesson): string {
  if (!lesson.room) return '';
  if (typeof lesson.room === 'string') return lesson.room;
  return lesson.room.id || '';
}

function lessonRoomName(lesson: Lesson): string {
  if (!lesson.room || typeof lesson.room === 'string') return '';
  return lesson.room.name || '';
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
    room: lessonRoomId(lesson),
    instructor: lessonInstructorId(lesson),
    day_of_week: lesson.day_of_week,
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    notes: lesson.notes || '',
  });

  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
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
    if (lesson) {
      setFormData({
        course: getCourseId(lesson.course),
        room: lessonRoomId(lesson),
        instructor: lessonInstructorId(lesson),
        day_of_week: lesson.day_of_week,
        start_time: normalizeTimeValue(lesson.start_time, '16:00'),
        end_time: normalizeTimeValue(lesson.end_time, '16:45'),
        notes: lesson.notes || '',
      });
    }
  }, [lesson]);

  useEffect(() => {
    if (!open) return;
    setLoadingInstructors(true);
    fetchInstructorsDropdown()
      .then((rows) => setInstructors(Array.isArray(rows) ? rows : []))
      .catch(() => setInstructors([]))
      .finally(() => setLoadingInstructors(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const branchId = lesson.branch?.id;
    if (!branchId) {
      setRooms([]);
      return;
    }
    setLoadingRooms(true);
    api
      .get('/core/rooms/', { params: { dropdown: 'true' } })
      .then((res) => {
        const allRooms: RoomOption[] = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setRooms(allRooms.filter((room) => !room.branch || room.branch === branchId));
      })
      .catch(() => setRooms([]))
      .finally(() => setLoadingRooms(false));
  }, [open, lesson]);

  useEffect(() => {
    if (formData.start_time) {
      setFormData((prev) => ({ ...prev, end_time: addMinutesToTime(prev.start_time, 45) }));
    }
  }, [formData.start_time]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.end_time <= formData.start_time) {
      setError('שעת סיום חייבת להיות אחרי שעת התחלה');
      return;
    }

    setLoading(true);
    try {
      await api.put(`/courses/lessons/${lesson.id}/`, {
        course: formData.course,
        room: formData.room || null,
        instructor: formData.instructor || null,
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        notes: formData.notes || '',
        is_recurring: true,
        status: 'scheduled',
      });
      onSuccess();
    } catch (err: unknown) {
      const errorData = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const fieldError = errorData?.room || errorData?.instructor;
      const message =
        (Array.isArray(fieldError) ? fieldError.join(', ') : fieldError) ||
        errorData?.detail ||
        errorData?.message ||
        'שגיאה בעדכון שיעור';
      setError(String(message));
    } finally {
      setLoading(false);
    }
  };

  const studioConflicts = useStudioBusyConflicts({
    open,
    slots: [
      {
        roomId: formData.room,
        instructorId: formData.instructor,
        dayOfWeek: formData.day_of_week,
        startTime: formData.start_time,
        endTime: formData.end_time,
      },
    ],
    excludeLessonIds: lesson.id ? [lesson.id] : [],
  });

  if (!open) return null;

  const currentInstructorId = lessonInstructorId(lesson);
  const currentInstructorOption =
    currentInstructorId
      ? { id: currentInstructorId, full_name: lessonInstructorName(lesson) || 'מדריך נוכחי' }
      : null;
  const currentRoomId = lessonRoomId(lesson);
  const currentRoomOption =
    currentRoomId
      ? { id: currentRoomId, name: lessonRoomName(lesson) || 'סטודיו נוכחי' }
      : null;

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

          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-500">
              סניף וקיבולת נקבעים ברמת הקבוצה — ערוך ב&quot;עריכת קבוצה&quot;.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="instructor" className="block text-sm font-medium text-gray-700 mb-1">
                מדריך
              </label>
              <InstructorSelect
                id="instructor"
                value={formData.instructor || ''}
                onChange={(instructor) => setFormData({ ...formData, instructor })}
                instructors={instructors}
                extraOptions={currentInstructorOption ? [currentInstructorOption] : []}
                disabled={loadingInstructors}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 text-right"
                placeholder={loadingInstructors ? 'טוען מדריכים...' : 'בחר מדריך'}
              />
            </div>

            <div>
              <label htmlFor="room" className="block text-sm font-medium text-gray-700 mb-1">
                סטודיו
              </label>
              <select
                id="room"
                value={formData.room || ''}
                onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100"
                disabled={loadingRooms}
              >
                <option value="">
                  {loadingRooms ? 'טוען סטודיואים...' : 'בחר סטודיו'}
                </option>
                {currentRoomOption &&
                  !rooms.some((row) => row.id === currentRoomOption.id) && (
                    <option value={currentRoomOption.id}>
                      {currentRoomOption.name}
                    </option>
                  )}
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            </div>

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
