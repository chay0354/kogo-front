import { describe, expect, test } from 'vitest';
import { ADULTS_AGE_GROUP, INSTRUCTORS_AGE_GROUP } from '@/lib/courseUtils';
import { buildCatalogRows } from './catalogRows';
import type { Course, CourseBundle, CourseLesson } from './types';

function lesson(partial: Partial<CourseLesson> & Pick<CourseLesson, 'id'>): CourseLesson {
  return {
    day_of_week: 1,
    start_time: '20:15',
    end_time: '21:45',
    instructor_name: null,
    ...partial,
  };
}

function instructorsCourse(overrides: Partial<Course> = {}): Course {
  const mon = lesson({ id: 'lesson-mon', day_of_week: 1 });
  const thu = lesson({
    id: 'lesson-thu',
    day_of_week: 4,
    price_options: [
      { id: 'adults-thu', display_title: 'קבוצת בוגרים', monthly_price: '230', min_age: 15, max_age: 15 },
    ],
  });
  mon.price_options = [
    { id: 'adults-mon', display_title: 'קבוצת בוגרים', monthly_price: '230', min_age: 15, max_age: 15 },
  ];
  const instructorsBundle: CourseBundle = {
    id: 'bundle-150',
    name: '',
    combined_price: 150,
    min_age: INSTRUCTORS_AGE_GROUP,
    max_age: INSTRUCTORS_AGE_GROUP,
    lessons: [mon, thu],
  };
  const adultsBundle: CourseBundle = {
    id: 'bundle-330',
    name: 'קבוצת בוגרים',
    combined_price: 330,
    min_age: ADULTS_AGE_GROUP,
    max_age: ADULTS_AGE_GROUP,
    lessons: [mon, thu],
  };
  return {
    id: 'course-229',
    name: 'קפוארה ואקרובטיקה מדריכים',
    display_id: 229,
    course_type: 'capoeira',
    course_type_name: 'קפוארה',
    course_type_description: null,
    branch_name: 'מינץ',
    min_age: INSTRUCTORS_AGE_GROUP,
    max_age: INSTRUCTORS_AGE_GROUP,
    price: 150,
    is_adult: true,
    must_attend_all_lessons: false,
    trial_lesson_is_paid: false,
    trial_lesson_price: null,
    external_link: '',
    lessons_count: 2,
    lessons: [mon, thu],
    bundles: [instructorsBundle, { ...instructorsBundle, id: 'bundle-150-dup' }, adultsBundle],
    ...overrides,
  };
}

describe('buildCatalogRows instructors track', () => {
  test('מדריכים sees one 150 package for both lessons, not once-a-week rows', () => {
    const rows = buildCatalogRows([instructorsCourse()], INSTRUCTORS_AGE_GROUP);
    expect(rows).toHaveLength(1);
    expect(rows[0].bundle?.id).toBe('bundle-150');
    expect(rows[0].displayPrice).toBe(150);
    expect(rows[0].lesson).toBeNull();
  });

  test('בוגרים see twice-weekly 330 plus single-day 230 options', () => {
    const rows = buildCatalogRows([instructorsCourse()], ADULTS_AGE_GROUP);
    expect(rows.filter((row) => row.bundle).map((row) => [row.displayTitle, row.displayPrice])).toEqual([
      ['קבוצת בוגרים', 330],
    ]);
    expect(rows.filter((row) => row.lesson).map((row) => [row.displayTitle, row.displayPrice])).toEqual([
      ['קבוצת בוגרים', 230],
      ['קבוצת בוגרים', 230],
    ]);
  });
});
