/**
 * An instructor's groups in the order they are taught: Sunday first, and within
 * a day from the earliest start to the latest.
 *
 * The office goes down this list writing down how many active students each
 * group has, so it has to read like the week does — not in whatever order the
 * lessons were created.
 */

export interface ScheduledLesson {
  day_of_week: number;
  start_time: string;
  student_count?: number | string | null;
}

export interface LessonDay<T extends ScheduledLesson> {
  day: number;
  lessons: T[];
  /** Active students across the day's groups. */
  students: number;
}

/** "9:00" and "09:00" both sort as nine o'clock. */
function minutes(time: string): number {
  const [h, m] = String(time || '').split(':').map((part) => Number(part));
  if (!Number.isFinite(h)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

export function sortBySchedule<T extends ScheduledLesson>(lessons: T[]): T[] {
  return [...lessons].sort(
    (a, b) => (a.day_of_week - b.day_of_week) || (minutes(a.start_time) - minutes(b.start_time)),
  );
}

export function groupByDay<T extends ScheduledLesson>(lessons: T[]): LessonDay<T>[] {
  const days: LessonDay<T>[] = [];
  for (const lesson of sortBySchedule(lessons)) {
    let day = days[days.length - 1];
    if (!day || day.day !== lesson.day_of_week) {
      day = { day: lesson.day_of_week, lessons: [], students: 0 };
      days.push(day);
    }
    day.lessons.push(lesson);
    day.students += Number(lesson.student_count) || 0;
  }
  return days;
}
