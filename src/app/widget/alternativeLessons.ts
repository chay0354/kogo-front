import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import { isCourseVisibleInWidgetCatalog } from './lessonVisibility';
import type { Course, CourseBundle, CourseLesson } from './types';

export interface WidgetAlternative {
  course: Course;
  lesson?: CourseLesson;
  bundle?: CourseBundle;
  label: string;
}

function courseMatchesAge(course: Course, age: number | null): boolean {
  if (age == null) return true;
  const minAge = course.min_age ?? 0;
  const maxAge = course.max_age ?? 99;
  return age >= minAge && age <= maxAge;
}

function isSameSelection(
  course: Course,
  lesson: CourseLesson | undefined,
  bundle: CourseBundle | undefined,
  current: { courseId: string; lessonId?: string; bundleId?: string },
): boolean {
  if (course.id !== current.courseId) return false;
  if (current.bundleId) return bundle?.id === current.bundleId;
  if (current.lessonId) return lesson?.id === current.lessonId;
  return false;
}

export function findWidgetAlternatives(
  branchCourses: Course[],
  options: {
    courseTypeId: string;
    selectedAge: number | null;
    currentCourseId: string;
    currentLessonId?: string;
    currentBundleId?: string;
  },
): WidgetAlternative[] {
  const alternatives: WidgetAlternative[] = [];

  for (const course of branchCourses) {
    if (!isCourseVisibleInWidgetCatalog(course)) continue;
    if (String(course.course_type) !== options.courseTypeId) continue;
    if (!courseMatchesAge(course, options.selectedAge)) continue;

    for (const lesson of course.lessons ?? []) {
      if (lesson.is_full) continue;
      if (
        isSameSelection(course, lesson, undefined, {
          courseId: options.currentCourseId,
          lessonId: options.currentLessonId,
          bundleId: options.currentBundleId,
        })
      ) {
        continue;
      }
      alternatives.push({
        course,
        lesson,
        label: `${course.name} — ${getDayName(lesson.day_of_week)} ${formatTimeRange(lesson.start_time, lesson.end_time)}`,
      });
    }

    for (const bundle of course.bundles ?? []) {
      if (bundle.is_full) continue;
      if (
        isSameSelection(course, undefined, bundle, {
          courseId: options.currentCourseId,
          lessonId: options.currentLessonId,
          bundleId: options.currentBundleId,
        })
      ) {
        continue;
      }
      const schedule = bundle.lessons
        .map((bl) => `${getDayName(bl.day_of_week)} ${formatTimeRange(bl.start_time, bl.end_time)}`)
        .join(' + ');
      alternatives.push({
        course,
        bundle,
        label: `${course.name} (${bundle.name || 'פעמיים בשבוע'}) — ${schedule}`,
      });
    }
  }

  return alternatives.sort((a, b) => a.label.localeCompare(b.label, 'he'));
}

export function isWidgetSelectionFull(
  course: Course,
  lesson?: CourseLesson | null,
  bundle?: CourseBundle | null,
): boolean {
  if (bundle) return Boolean(bundle.is_full);
  if (lesson) return Boolean(lesson.is_full);
  return false;
}
