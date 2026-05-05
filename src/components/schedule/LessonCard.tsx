import { Lesson } from '@/types/schedule';
import { formatTime } from '@/lib/scheduleUtils';
import { CurrentUser } from '@/lib/auth';

type LessonCardProps = {
  lesson: Lesson;
  currentUser: CurrentUser | null;
  onViewDetails?: (lesson: Lesson) => void;
};

export default function LessonCard({
  lesson,
  currentUser,
  onViewDetails,
}: LessonCardProps) {
  const isCancelled = lesson.status === 'cancelled';

  return (
    <div
      className={`
        p-3 rounded-lg border transition-all cursor-pointer
        ${isCancelled 
          ? 'bg-red-50 border-red-200 opacity-70' 
          : 'bg-white border-gray-200 hover:shadow-lg hover:scale-[1.02]'
        }
      `}
      onClick={() => onViewDetails?.(lesson)}
    >
      {/* Course Name */}
      <div className="font-semibold text-sm mb-1">
        {lesson.course_type_name} - {lesson.course_name}
      </div>

      {/* Time */}
      <div className="text-xs text-gray-600 mb-1">
        {formatTime(lesson.start_time)} - {formatTime(lesson.end_time)}
      </div>

      {/* Instructor */}
      <div className="text-xs text-gray-500 mb-1">
        👤 {lesson.instructor_name}
      </div>

      {/* Branch & Room */}
      <div className="text-xs text-gray-500 mb-2">
        📍 {lesson.branch_name}
        {lesson.room_name && ` - ${lesson.room_name}`}
      </div>

      {/* Enrollment Count */}
      <div className="text-xs flex items-center gap-1 mb-2">
        <span>👥</span>
        <span className="font-medium">{lesson.enrollment_count}/{lesson.room_capacity || 20} תלמידים</span>
      </div>

      {/* Status Badge */}
      {isCancelled && (
        <div className="inline-block px-2 py-1 text-xs bg-red-100 text-red-700 rounded font-medium">
          ⚠️ שיעור מבוטל
        </div>
      )}
    </div>
  );
}

