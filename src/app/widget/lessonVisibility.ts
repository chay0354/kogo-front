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
/**
 * A trial sits in the same room as the paying students, so it is offered only
 * while there is a place for another body — not merely another subscriber.
 */
export function trialSeatsAvailable(lesson?: { trial_is_full?: boolean } | null): boolean {
  return lesson?.trial_is_full !== true;
}

export function trialRegistrationOffered(lesson?: CourseLesson | null, bundle?: CourseBundle | null): boolean {
  if (lesson) return lesson.trial_registration_open !== false && trialSeatsAvailable(lesson);
  if (bundle?.lessons?.length) {
    return bundle.lessons.some((l) => l.trial_registration_open !== false && trialSeatsAvailable(l));
  }
  return true;
}

/** True when a trial is closed only because the room is full for that day. */
export function trialFullOnly(lesson?: CourseLesson | null, bundle?: CourseBundle | null): boolean {
  if (lesson) return lesson.trial_registration_open !== false && lesson.trial_is_full === true;
  if (bundle?.lessons?.length) {
    const open = bundle.lessons.filter((l) => l.trial_registration_open !== false);
    return open.length > 0 && open.every((l) => l.trial_is_full === true);
  }
  return false;
}

/** The bundle lessons a trial may still be booked on. */
export function trialLessonChoices(bundle?: CourseBundle | null) {
  return (bundle?.lessons ?? []).filter((l) => l.trial_registration_open !== false && trialSeatsAvailable(l));
}
