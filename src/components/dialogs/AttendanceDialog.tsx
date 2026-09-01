import { useState, useEffect } from 'react';
import { Lesson, AttendanceRecord, AttendanceMark, AttendanceStatus } from '@/types/schedule';
import { fetchLessonAttendance, markAttendance } from '@/lib/scheduleUtils';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import { Skeleton } from '@/components/ui/skeleton';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

type AttendanceDialogProps = {
  lesson: Lesson | null;
  onClose: () => void;
  onSuccess: () => void;
};

export default function AttendanceDialog({
  lesson,
  onClose: dismiss,
  onSuccess,
}: AttendanceDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [enrollments, setEnrollments] = useState<Array<{ child_id: string; child_name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (lesson) {
      loadAttendance();
    }
  }, [lesson]);

  const loadAttendance = async () => {
    if (!lesson) return;
    if (!lesson.lesson_date) return;

    setIsLoading(true);
    try {
      const records = await fetchLessonAttendance(lesson.id, lesson.lesson_date);
      
      // Build attendance map
      const attendanceMap: Record<string, AttendanceStatus> = {};
      records.forEach((record) => {
        attendanceMap[record.child_id] = record.status;
      });
      
      setAttendance(attendanceMap);
      
      // For now, use the attendance records to get child info
      // In production, you'd fetch enrollments separately
      const children = records.map((r) => ({
        child_id: r.child_id,
        child_name: r.child_name,
      }));
      setEnrollments(children);
    } catch (err) {
      setError('שגיאה בטעינת נתוני נוכחות');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = (childId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({
      ...prev,
      [childId]: status,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    if (!lesson.lesson_date) return;

    setIsSubmitting(true);
    setError('');

    try {
      const marks: AttendanceMark[] = Object.entries(attendance).map(([child_id, status]) => ({
        child_id,
        status,
      }));

      await markAttendance(lesson.id, lesson.lesson_date, marks);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בשמירת נוכחות');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!lesson) return null;

  const isCancelled = lesson.status === 'cancelled';

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`}>
      <div className={`bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}>
        <h2 className="text-xl font-bold mb-4">סימון נוכחות<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #9</span></h2>

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <div className="font-semibold">
            {lesson.course_type_name} - {lesson.course_name}
            <GroupIdBadge displayId={lesson.course_display_id} />
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {lesson.day_of_week_display} - {lesson.start_time}
          </div>
          <div className="text-sm text-gray-600">
            מדריך: {lesson.instructor_name}
          </div>
        </div>

        {isCancelled && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            לא ניתן לסמן נוכחות בשיעור מבוטל
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="mb-4 space-y-2" aria-busy="true" aria-label="טוען נוכחות">
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="flex items-center justify-between p-3 border rounded-lg">
                <Skeleton className="h-4 w-32" />
                <div className="flex gap-2">
                  <Skeleton className="h-[26px] w-14 rounded" />
                  <Skeleton className="h-[26px] w-14 rounded" />
                  <Skeleton className="h-[26px] w-16 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <div className="space-y-2">
                {enrollments.map((enrollment) => (
                  <div
                    key={enrollment.child_id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="font-medium">{enrollment.child_name}</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(enrollment.child_id, 'present')}
                        disabled={isCancelled}
                        className={`px-3 py-1 rounded text-sm ${
                          attendance[enrollment.child_id] === 'present'
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 hover:bg-gray-300'
                        } disabled:opacity-50`}
                      >
                        נוכח
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(enrollment.child_id, 'absent')}
                        disabled={isCancelled}
                        className={`px-3 py-1 rounded text-sm ${
                          attendance[enrollment.child_id] === 'absent'
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-200 hover:bg-gray-300'
                        } disabled:opacity-50`}
                      >
                        נעדר
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(enrollment.child_id, 'not_marked')}
                        disabled={isCancelled}
                        className={`px-3 py-1 rounded text-sm ${
                          attendance[enrollment.child_id] === 'not_marked' || !attendance[enrollment.child_id]
                            ? 'bg-gray-500 text-white'
                            : 'bg-gray-200 hover:bg-gray-300'
                        } disabled:opacity-50`}
                      >
                        לא סומן
                      </button>
                    </div>
                  </div>
                ))}

                {enrollments.length === 0 && (
                  <div className="text-center text-gray-500 py-4">
                    אין תלמידים רשומים לשיעור זה
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isCancelled || enrollments.length === 0}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {isSubmitting ? 'שומר...' : 'שמור נוכחות'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

