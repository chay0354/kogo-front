import type { CourseLesson } from './types';

/** Match schedule page: hide recurring lessons before their lesson_date start. */
export function isLessonVisibleInCatalog(lesson: CourseLesson): boolean {
  if (lesson.is_recurring === false) return true;
  if (!lesson.lesson_date) return true;
  const start = new Date(lesson.lesson_date);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return start.getTime() <= today.getTime();
}
