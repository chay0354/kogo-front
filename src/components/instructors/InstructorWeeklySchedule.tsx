'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchLessons, formatDateISO, getWeekDates, groupLessonsByDate } from '@/lib/scheduleUtils';
import ScheduleLessonCard from '@/components/schedule/ScheduleLessonCard';
import type { Lesson } from '@/types/schedule';

interface InstructorWeeklyScheduleProps {
  instructorId: string;
}

function shouldShowLessonOnDate(lesson: Lesson, date: Date): boolean {
  if (!lesson.is_recurring) return true;
  if (!lesson.lesson_date) return true;
  const start = new Date(lesson.lesson_date);
  start.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return start.getTime() <= d.getTime();
}

export default function InstructorWeeklySchedule({ instructorId }: InstructorWeeklyScheduleProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { start, end, dates } = getWeekDates(currentDate);
  const workDays = dates.slice(0, 6);

  const dateDisplay = `${start.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} - ${end.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;

  const loadLessons = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchLessons({
        instructor_id: instructorId,
        start_date: formatDateISO(start),
        end_date: formatDateISO(end),
      });
      setLessons(data);
    } catch (err) {
      console.error('Error loading instructor schedule:', err);
      setError('שגיאה בטעינת לוח הזמנים');
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }, [instructorId, start, end]);

  useEffect(() => {
    loadLessons();
  }, [loadLessons]);

  const lessonsByDay = groupLessonsByDate(lessons, dates);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const d = new Date(currentDate);
            d.setDate(d.getDate() - 7);
            setCurrentDate(d);
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="שבוע קודם"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div className="font-medium">{dateDisplay}</div>

        <button
          type="button"
          onClick={() => {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + 7);
            setCurrentDate(d);
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="שבוע הבא"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setCurrentDate(new Date())}
          className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
        >
          <CalendarIcon className="h-4 w-4" />
          היום
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">טוען לוח שבועי...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {workDays.map((date, index) => {
            const dayLessons = (lessonsByDay[index] || []).filter((l) => shouldShowLessonOnDate(l, date));
            const isToday = new Date().toDateString() === date.toDateString();

            return (
              <div key={index} className="flex flex-col min-w-0">
                <div
                  className={`font-bold p-2 rounded-t text-center text-sm h-12 flex items-center justify-center bg-gray-100 ${
                    isToday ? 'bg-teal-100 ring-1 ring-teal-300 ring-inset' : ''
                  }`}
                >
                  {date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })}
                </div>

                <div className="border rounded-b bg-white px-2 pb-2 pt-3 min-h-[220px] flex-1">
                  {dayLessons.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">אין שיעורים</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {dayLessons.map((lesson) => (
                        <ScheduleLessonCard
                          key={`${lesson.id}-${lesson.lesson_date || index}`}
                          lesson={lesson}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
