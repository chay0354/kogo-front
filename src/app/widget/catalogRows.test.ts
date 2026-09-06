import { describe, expect, test } from 'vitest';
import { ADULTS_AGE_GROUP, INSTRUCTORS_AGE_GROUP } from '@/lib/courseUtils';
import { buildCatalogRows, catalogRowToSelection } from './catalogRows';
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

  test('בוגרים see only the twice-weekly 330 track, not once-a-week 230 rows', () => {
    const rows = buildCatalogRows([instructorsCourse()], ADULTS_AGE_GROUP);
    expect(rows.map((row) => [row.displayTitle, row.displayPrice, row.lesson?.id ?? null])).toEqual([
      ['קבוצת בוגרים', 330, null],
    ]);
  });

  test('required multi-day track uses the course monthly price, not a stale bundle', () => {
    const rows = buildCatalogRows([
      instructorsCourse({
        must_attend_all_lessons: true,
        price: 455,
        min_age: 15,
        max_age: 18,
        bundles: [{
          id: 'bundle-stale',
          name: 'שלוש פעמים בשבוע',
          combined_price: 415,
          min_age: 15,
          max_age: 18,
          lessons: [lesson({ id: 'sun' }), lesson({ id: 'wed', day_of_week: 3 }), lesson({ id: 'thu', day_of_week: 4 })],
        }],
        lessons: [lesson({ id: 'sun' }), lesson({ id: 'wed', day_of_week: 3 }), lesson({ id: 'thu', day_of_week: 4 })],
      }),
    ]);
    const bundleRow = rows.find((row) => row.bundle?.id === 'bundle-stale');
    expect(bundleRow?.displayPrice).toBe(455);
  });

  test('a misspelled frequency track still shows the course name', () => {
    const rows = buildCatalogRows([
      instructorsCourse({
        name: 'קפוארה ואקרובטיקה',
        min_age: 5,
        max_age: 7,
        lessons: [],
        bundles: [{
          id: 'bundle-220',
          name: 'פעמייפ בשבוע',
          combined_price: 300,
          min_age: null,
          max_age: null,
          lessons: [lesson({ id: 'mon' }), lesson({ id: 'thu', day_of_week: 4 })],
        }],
      }),
    ]);
    expect(rows.map((row) => row.displayTitle)).toEqual(['קפוארה ואקרובטיקה']);
  });

  test('a track named for its group keeps its own name', () => {
    const rows = buildCatalogRows([
      instructorsCourse({
        name: 'קפוארה ואקרובטיקה',
        min_age: 5,
        max_age: 7,
        lessons: [],
        bundles: [{
          id: 'bundle-229',
          name: 'קבוצת בוגרים',
          combined_price: 330,
          min_age: null,
          max_age: null,
          lessons: [lesson({ id: 'mon' }), lesson({ id: 'thu', day_of_week: 4 })],
        }],
      }),
    ]);
    expect(rows.map((row) => row.displayTitle)).toEqual(['קבוצת בוגרים']);
  });

  test('catalog pick carries isFull from the selected lesson', () => {
    const source = instructorsCourse({
      min_age: 6,
      max_age: 10,
      lessons: [lesson({ id: 'full-mon', is_full: true })],
      bundles: [],
    });
    const rows = buildCatalogRows([source], 8);
    expect(rows[0]?.lesson?.is_full).toBe(true);
    expect(catalogRowToSelection(rows[0]).isFull).toBe(true);
  });

  test('מדריכים once-a-week course is hidden from the widget', () => {
    const rows = buildCatalogRows(
      [instructorsCourse({ lessons: [lesson({ id: 'only-mon' })], bundles: [] })],
      INSTRUCTORS_AGE_GROUP,
    );
    expect(rows).toHaveLength(0);
  });
});
