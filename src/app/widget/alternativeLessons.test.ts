import { describe, expect, test } from 'vitest';
import { findWidgetAlternatives, isWidgetSelectionFull } from './alternativeLessons';
import type { Course, CourseBundle, CourseLesson } from './types';

function lesson(partial: Partial<CourseLesson> & Pick<CourseLesson, 'id'>): CourseLesson {
  return {
    day_of_week: 1,
    start_time: '18:15',
    end_time: '19:15',
    instructor_name: null,
    is_full: false,
    ...partial,
  };
}

function course(overrides: Partial<Course> = {}): Course {
  const monday = lesson({ id: 'mon' });
  const thursday = lesson({ id: 'thu', day_of_week: 4, start_time: '18:00', end_time: '19:00' });
  const bundle: CourseBundle = {
    id: 'bundle-1',
    name: 'פעמיים בשבוע',
    combined_price: 360,
    lessons: [monday, thursday],
    is_full: false,
  };
  return {
    id: 'course-1',
    name: 'ג-ד ריקוד',
    display_id: 25,
    course_type: 'dance',
    course_type_name: 'ריקוד',
    course_type_description: null,
    branch_name: 'דמרי',
    min_age: 8,
    max_age: 10,
    price: 225,
    is_adult: false,
    must_attend_all_lessons: false,
    trial_lesson_is_paid: false,
    trial_lesson_price: null,
    external_link: '',
    lessons_count: 2,
    lessons: [monday, thursday],
    bundles: [bundle],
    ...overrides,
  };
}

describe('isWidgetSelectionFull', () => {
  test('uses the lesson when no bundle was picked', () => {
    expect(isWidgetSelectionFull(course(), lesson({ id: 'mon', is_full: true }), null)).toBe(true);
    expect(isWidgetSelectionFull(course(), lesson({ id: 'mon', is_full: false }), null)).toBe(false);
  });

  test('marks the picked bundle full', () => {
    const fullBundle: CourseBundle = {
      id: 'bundle-1',
      name: 'פעמיים בשבוע',
      combined_price: 360,
      lessons: [lesson({ id: 'mon' })],
      is_full: true,
    };
    expect(isWidgetSelectionFull(course(), null, fullBundle)).toBe(true);
  });

  test('open lesson stays open even if a sibling day is full', () => {
    const openMonday = lesson({ id: 'mon', is_full: false });
    expect(isWidgetSelectionFull(course(), openMonday, null)).toBe(false);
  });
});

describe('findWidgetAlternatives', () => {
  test('skips full lessons and bundles', () => {
    const monday = lesson({ id: 'mon', is_full: true });
    const thursday = lesson({ id: 'thu', day_of_week: 4, is_full: false });
    const source = course({
      lessons: [monday, thursday],
      bundles: [{
        id: 'bundle-1',
        name: 'פעמיים בשבוע',
        combined_price: 360,
        lessons: [monday, thursday],
        is_full: true,
      }],
    });
    const alts = findWidgetAlternatives([source], {
      courseTypeId: 'dance',
      selectedAge: 9,
      currentCourseId: source.id,
      currentLessonId: monday.id,
    });
    expect(alts.map((alt) => alt.lesson?.id ?? alt.bundle?.id)).toEqual(['thu']);
  });
});
