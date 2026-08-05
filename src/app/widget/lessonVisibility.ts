import type { CourseLesson } from './types';

/** Widget registration catalog — include upcoming lessons (parents enroll before season starts). */
export function isLessonVisibleInCatalog(_lesson: CourseLesson): boolean {
  return true;
}

/** Course is listed when it has visible lessons and/or a combined bundle row. */
export function isCourseVisibleInWidgetCatalog(course: {
  lessons?: CourseLesson[];
  bundles?: unknown[];
}): boolean {
  if ((course.bundles?.length ?? 0) > 0) return true;
  return (course.lessons ?? []).some(isLessonVisibleInCatalog);
}
