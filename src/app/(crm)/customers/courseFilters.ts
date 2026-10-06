import type { FilterBarOption } from '@/components/FilterBar';
import { formatAgeRange } from '@/lib/courseUtils';
import type { Course, CustomerFilters } from '@/types/customer';

/**
 * The customers list narrows as a funnel: תחום → קבוצת גיל → חוג. Each list
 * offers only what the choices before it leave, and a choice that no longer
 * fits what was chosen before it is let go.
 */

const ALL = 'all';

/**
 * A course's age group as the filter value the server reads (`age_group`):
 * its min–max on the 1–16 age-group scale, '3-4'. Written exactly as the
 * server's age_key() writes it, a bound of 0 like a missing one. '' when the
 * course has no ages.
 */
export function courseAgeGroupKey(course: Pick<Course, 'min_age' | 'max_age'>): string {
  const low = course.min_age || '';
  const high = course.max_age || '';
  return low || high ? `${low}-${high}` : '';
}

function inCourseType(course: Course, courseType: string): boolean {
  return courseType === ALL || String(course.course_type) === courseType;
}

/** The age groups of the chosen תחום (of every course when none is chosen), youngest first. */
export function ageGroupOptions(courses: readonly Course[], courseType: string): FilterBarOption[] {
  const groups = new Map<string, { low: number; high: number; label: string }>();
  for (const course of courses) {
    if (!inCourseType(course, courseType)) continue;
    const key = courseAgeGroupKey(course);
    if (!key || groups.has(key)) continue;
    groups.set(key, {
      low: course.min_age || 0,
      high: course.max_age || 0,
      label: formatAgeRange(course.min_age, course.max_age) || key,
    });
  }
  return Array.from(groups.entries())
    .sort(([, a], [, b]) => a.low - b.low || a.high - b.high)
    .map(([value, group]) => ({ value, label: group.label }));
}

/** The courses of the chosen תחום and age group. */
export function coursesForFilters(
  courses: readonly Course[],
  filters: Pick<CustomerFilters, 'course_type' | 'age_group'>,
): Course[] {
  return courses.filter(
    (course) =>
      inCourseType(course, filters.course_type)
      && (filters.age_group === ALL || courseAgeGroupKey(course) === filters.age_group),
  );
}

/**
 * The filters after one of them changed. An age group the new תחום does not
 * have, a course outside the new תחום or age group, and the lesson of a course
 * that is no longer chosen are each set back to "all".
 */
export function settleCustomerFilters(
  next: CustomerFilters,
  changed: keyof CustomerFilters,
  courses: readonly Course[],
): CustomerFilters {
  const settled = { ...next };
  if (changed === 'course_type' && settled.age_group !== ALL) {
    const offered = ageGroupOptions(courses, settled.course_type);
    if (!offered.some((option) => option.value === settled.age_group)) settled.age_group = ALL;
  }
  if ((changed === 'course_type' || changed === 'age_group') && settled.course !== ALL) {
    const chosen = courses.find((course) => course.id === settled.course);
    if (chosen && !coursesForFilters([chosen], settled).length) settled.course = ALL;
  }
  if (changed === 'course' || settled.course === ALL) settled.lesson = ALL;
  return settled;
}
