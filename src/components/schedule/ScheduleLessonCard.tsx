'use client';

import { Lesson } from '@/types/schedule';
import { formatTime } from '@/lib/scheduleUtils';

type ScheduleLessonCardProps = {
  lesson: Lesson;
  onClick?: () => void;
  className?: string;
  showEnrollment?: boolean;
  showTime?: boolean;
};

export default function ScheduleLessonCard({
  lesson,
  onClick,
  className = '',
  showEnrollment = true,
  showTime = true,
}: ScheduleLessonCardProps) {
  const isCancelled = lesson.status === 'cancelled';
  const capacity = lesson.room_capacity || 20;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`px-2 py-2 rounded-md border border-primary/30 bg-primary/10 transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } ${isCancelled ? 'opacity-50 line-through' : ''} ${className}`}
    >
      <div className="font-semibold text-xs truncate text-gray-900 leading-snug">
        {lesson.city_name || '—'}
      </div>
      <div className="text-[11px] text-gray-600 truncate leading-snug mt-0.5">
        {lesson.branch_name || '—'}
      </div>
      <div className="text-[11px] text-gray-700 truncate leading-snug">
        {lesson.course_type_name || '—'}
      </div>
      <div className="text-xs font-medium text-gray-900 truncate leading-snug">
        {lesson.course_name || '—'}
      </div>
      {showTime && (
        <div className="text-[10px] text-gray-500 mt-1">
          {formatTime(lesson.start_time)}–{formatTime(lesson.end_time)}
        </div>
      )}
      {showEnrollment && (
        <div className="mt-1">
          <span className="inline-block px-1.5 py-0.5 bg-gray-200 rounded text-[10px]">
            {lesson.enrollment_count}/{capacity}
          </span>
        </div>
      )}
      {isCancelled && (
        <div className="mt-1 text-[10px] font-medium text-red-600">שיעור מבוטל</div>
      )}
    </div>
  );
}
