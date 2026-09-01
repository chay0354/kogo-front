import {
  getDayName,
  formatTimeRange,
  isInstructorsCourse,
  INSTRUCTORS_TRACK_TITLE,
  stripWidgetApprovalPhrase,
} from '@/lib/courseUtils';
import type { Course, CourseLesson, CourseBundle, CourseLessonPriceOption } from './types';
import { isLessonVisibleInCatalog } from './lessonVisibility';

export interface CatalogRow {
  course: Course;
  lesson: CourseLesson | null;
  bundle: CourseBundle | null;
  priceOption: CourseLessonPriceOption | null;
  displayTitle: string;
  displayPrice: number | null;
}

export interface EnrollmentSelection {
  courseId: string;
  courseName: string;
  bundleId?: string;
  lessonId?: string;
  priceOptionId?: string;
  displayTitle: string;
  displaySchedule: string;
  displayPrice: number | null;
}

const GENERIC_BUNDLE_NAMES = new Set([
  '',
  'מסלול משולב',
  'פעמיים בשבוע',
  'שלוש פעמים בשבוע',
  INSTRUCTORS_TRACK_TITLE,
]);

function bundleDedupeKey(bundle: CourseBundle): string {
  const lessonIds = [...bundle.lessons.map((lesson) => lesson.id)].sort().join(',');
  return `${lessonIds}:${bundle.combined_price}`;
}

export function formatListPrice(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Required multi-day tracks show the course monthly price from EditCourseDialog. */
export function widgetBundlePrice(course: Course, bundle: CourseBundle): number | null {
  if (course.must_attend_all_lessons) {
    return formatListPrice(course.price);
  }
  return formatListPrice(bundle.combined_price);
}

export function formatPriceLabel(value: number): string {
  return `₪${Math.round(value)}`;
}

function bundleDisplayTitle(course: Course, bundle: CourseBundle): string {
  const name = (bundle.name || '').trim();
  const title = name && !GENERIC_BUNDLE_NAMES.has(name) ? name : course.name;
  return stripWidgetApprovalPhrase(title);
}

function rowSortKey(row: CatalogRow): { day: number; time: string; type: string; name: string; price: number } {
  const lesson = row.lesson ?? row.bundle?.lessons[0];
  return {
    day: lesson?.day_of_week ?? 99,
    time: lesson?.start_time ?? '',
    type: row.course.course_type_name || '',
    name: row.displayTitle,
    price: row.displayPrice ?? 0,
  };
}

function selectedAgeMatches(
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  selectedAge: number | null | undefined,
): boolean {
  if (selectedAge == null || Number.isNaN(selectedAge)) return true;
  return selectedAge >= (minAge ?? 0) && selectedAge <= (maxAge ?? 99);
}

function priceOptionMatchesAge(
  option: CourseLessonPriceOption,
  course: Course,
  selectedAge: number | null | undefined,
): boolean {
  if (option.min_age != null || option.max_age != null) {
    return selectedAgeMatches(option.min_age, option.max_age, selectedAge);
  }
  return selectedAgeMatches(course.min_age, course.max_age, selectedAge);
}

function bundleMatchesAge(
  bundle: CourseBundle,
  course: Course,
  selectedAge: number | null | undefined,
): boolean {
  if (bundle.min_age != null || bundle.max_age != null) {
    return selectedAgeMatches(bundle.min_age, bundle.max_age, selectedAge);
  }
  return selectedAgeMatches(course.min_age, course.max_age, selectedAge);
}

export function buildCatalogRows(courses: Course[], selectedAge?: number | null): CatalogRow[] {
  const rows: CatalogRow[] = [];

  for (const course of courses) {
    const bundles = course.bundles ?? [];
    const courseAgeMatches = selectedAgeMatches(course.min_age, course.max_age, selectedAge);

    const hideOnceAWeek = isInstructorsCourse(course);

    if (course.lessons && course.lessons.length > 0) {
      for (const lesson of course.lessons) {
        if (!isLessonVisibleInCatalog(lesson)) continue;
        if (courseAgeMatches && !hideOnceAWeek) {
          rows.push({
            course,
            lesson,
            bundle: null,
            priceOption: null,
            displayTitle: stripWidgetApprovalPhrase(course.name),
            displayPrice: formatListPrice(lesson.price ?? course.price),
          });
        }
        if (!hideOnceAWeek) {
          for (const priceOption of lesson.price_options ?? []) {
            if (!priceOptionMatchesAge(priceOption, course, selectedAge)) continue;
            rows.push({
              course,
              lesson,
              bundle: null,
              priceOption,
              displayTitle: stripWidgetApprovalPhrase(priceOption.display_title),
              displayPrice: formatListPrice(priceOption.monthly_price),
            });
          }
        }
      }
    } else if (!hideOnceAWeek && bundles.length === 0 && courseAgeMatches) {
      rows.push({
        course,
        lesson: null,
        bundle: null,
        priceOption: null,
        displayTitle: stripWidgetApprovalPhrase(course.name),
        displayPrice: formatListPrice(course.price),
      });
    }

    const seenBundles = new Set<string>();
    for (const bundle of bundles) {
      if (hideOnceAWeek && (bundle.lessons?.length ?? 0) < 2) continue;
      if (!bundleMatchesAge(bundle, course, selectedAge)) continue;
      const key = bundleDedupeKey(bundle);
      if (seenBundles.has(key)) continue;
      seenBundles.add(key);
      rows.push({
        course,
        lesson: null,
        bundle,
        priceOption: null,
        displayTitle: bundleDisplayTitle(course, bundle),
        displayPrice: widgetBundlePrice(course, bundle),
      });
    }
  }

  rows.sort((a, b) => {
    const keyA = rowSortKey(a);
    const keyB = rowSortKey(b);
    if (keyA.day !== keyB.day) return keyA.day - keyB.day;
    const timeCmp = keyA.time.localeCompare(keyB.time);
    if (timeCmp !== 0) return timeCmp;
    const typeCmp = keyA.type.localeCompare(keyB.type, 'he');
    if (typeCmp !== 0) return typeCmp;
    const nameCmp = keyA.name.localeCompare(keyB.name, 'he');
    if (nameCmp !== 0) return nameCmp;
    return keyA.price - keyB.price;
  });

  return rows;
}

export function catalogRowKey(row: CatalogRow, index = 0): string {
  return `${row.course.id}:${row.bundle?.id ?? row.lesson?.id ?? index}:${row.priceOption?.id ?? 'default'}`;
}

export function enrollmentSelectionKey(selection: {
  courseId: string;
  bundleId?: string;
  lessonId?: string;
  priceOptionId?: string;
}): string {
  return `${selection.courseId}:${selection.bundleId ?? ''}:${selection.lessonId ?? ''}:${selection.priceOptionId ?? ''}`;
}

export function scheduleLabel(lesson: CourseLesson | null, bundle: CourseBundle | null): string {
  if (bundle?.lessons?.length) {
    const dayParts = bundle.lessons.map((bl) => getDayName(bl.day_of_week));
    const timeParts = bundle.lessons.map((bl) => formatTimeRange(bl.start_time, bl.end_time));
    const uniqueTimes = [...new Set(timeParts)];
    const times = uniqueTimes.length === 1 ? uniqueTimes[0] : timeParts.join(' / ');
    return `${dayParts.join(' / ')} · ${times}`;
  }
  if (lesson) {
    return `${getDayName(lesson.day_of_week)} · ${formatTimeRange(lesson.start_time, lesson.end_time)}`;
  }
  return '';
}

export function catalogRowToSelection(row: CatalogRow): EnrollmentSelection {
  return {
    courseId: row.course.id,
    courseName: row.course.name,
    bundleId: row.bundle?.id,
    lessonId: row.lesson?.id,
    priceOptionId: row.priceOption?.id,
    displayTitle: row.displayTitle,
    displaySchedule: scheduleLabel(row.lesson, row.bundle),
    displayPrice: row.displayPrice,
  };
}

export function selectionFromCatalogPick(
  course: Course,
  bundle?: CourseBundle | null,
  lesson?: CourseLesson | null,
  priceOption?: CourseLessonPriceOption | null,
): EnrollmentSelection {
  const rows = buildCatalogRows([course], null);
  const targetKey = enrollmentSelectionKey({
    courseId: course.id,
    bundleId: bundle?.id,
    lessonId: lesson?.id,
    priceOptionId: priceOption?.id,
  });
  const match = rows.find(
    (row) =>
      enrollmentSelectionKey({
        courseId: row.course.id,
        bundleId: row.bundle?.id,
        lessonId: row.lesson?.id,
        priceOptionId: row.priceOption?.id,
      }) === targetKey,
  );
  if (match) return catalogRowToSelection(match);
  return {
    courseId: course.id,
    courseName: course.name,
    bundleId: bundle?.id,
    lessonId: lesson?.id,
    priceOptionId: priceOption?.id,
    displayTitle: stripWidgetApprovalPhrase(course.name),
    displaySchedule: scheduleLabel(lesson ?? null, bundle ?? null),
    displayPrice: formatListPrice(lesson?.price ?? course.price),
  };
}
