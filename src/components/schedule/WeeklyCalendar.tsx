import { Lesson, DAY_NAMES, WeekDay } from '@/types/schedule';
import { CurrentUser } from '@/lib/auth';
import { formatDateDisplay, isToday } from '@/lib/scheduleUtils';
import LessonCard from './LessonCard';

type WeeklyCalendarProps = {
  weekDates: Date[];
  lessonsByDay: Record<number, Lesson[]>;
  currentUser: CurrentUser | null;
  onViewDetails?: (lesson: Lesson) => void;
};

export default function WeeklyCalendar({
  weekDates,
  lessonsByDay,
  currentUser,
  onViewDetails,
}: WeeklyCalendarProps) {
  // Only show Sunday-Friday (0-5)
  const workDays = weekDates.slice(0, 6);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        {/* Header Row */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          {workDays.map((date, index) => {
            const dayOfWeek = index as WeekDay;
            const todayClass = isToday(date) ? 'bg-blue-100 border-blue-400' : 'bg-gray-50';
            
            return (
              <div
                key={index}
                className={`p-3 rounded-lg border text-center ${todayClass}`}
              >
                <div className="font-semibold text-sm">{DAY_NAMES[dayOfWeek]}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {formatDateDisplay(date)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lessons Grid */}
        <div className="grid grid-cols-6 gap-2">
          {workDays.map((date, index) => {
            const dayOfWeek = index as WeekDay;
            const lessons = lessonsByDay[dayOfWeek] || [];
            const todayClass = isToday(date) ? 'bg-blue-50' : 'bg-gray-50';

            return (
              <div
                key={index}
                className={`p-2 rounded-lg border min-h-[400px] ${todayClass}`}
              >
                {lessons.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 mt-8">
                    אין שיעורים
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lessons.map((lesson: any) => (
                      <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        currentUser={currentUser}
                        onViewDetails={onViewDetails}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

