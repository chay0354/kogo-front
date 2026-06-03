import { useState } from 'react';
import { Lesson } from '@/types/schedule';
import { cancelLesson } from '@/lib/scheduleUtils';

type CancelLessonDialogProps = {
  lesson: Lesson | null;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CancelLessonDialog({
  lesson,
  onClose,
  onSuccess,
}: CancelLessonDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!lesson) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (!lesson.lesson_date) {
        setError('חסר תאריך שיעור');
        return;
      }
      await cancelLesson(lesson.id, lesson.lesson_date, reason);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בביטול השיעור');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">ביטול שיעור<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #10</span></h2>

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <div className="font-semibold">
            {lesson.course_type_name} - {lesson.course_name}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {lesson.day_of_week_display} - {lesson.start_time}
          </div>
          <div className="text-sm text-gray-600">
            מדריך: {lesson.instructor_name}
          </div>
          <div className="text-sm text-gray-600">
            {lesson.branch_name}
          </div>
        </div>

        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            <strong>שים לב:</strong> ביטול שיעור ישפיע על חישוב שכר המדריך בחודש הנוכחי.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              סיבת ביטול (אופציונלי)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="הזן סיבת ביטול..."
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

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
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {isSubmitting ? 'מבטל...' : 'בטל שיעור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

