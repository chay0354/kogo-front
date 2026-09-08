import type { CourseBundle, CourseLesson } from './types';

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

/**
 * Whether the card may offer a trial for what the parent is looking at.
 *
 * A lesson answers for itself. A bundle offers a trial while any of its
 * lessons still does — the form then lists only those. A card with neither
 * (an older payload) keeps the button, so a missing field never hides it.
 */
export function trialRegistrationOffered(lesson?: CourseLesson | null, bundle?: CourseBundle | null): boolean {
  if (lesson) return lesson.trial_registration_open !== false;
  if (bundle?.lessons?.length) return bundle.lessons.some((l) => l.trial_registration_open !== false);
  return true;
}

/** The bundle lessons a trial may still be booked on. */
export function trialLessonChoices(bundle?: CourseBundle | null) {
  return (bundle?.lessons ?? []).filter((l) => l.trial_registration_open !== false);
}
