import { describe, expect, it } from 'vitest';
import type { Course, CustomerFilters } from '@/types/customer';
import {
  ageGroupOptions,
  courseAgeGroupKey,
  coursesForFilters,
  settleCustomerFilters,
} from './courseFilters';

const course = (id: string, course_type: string, min_age: number | null, max_age: number | null): Course => ({
  id,
  name: id,
  branch_name: 'Main',
  course_type,
  min_age,
  max_age,
});

// The age-group scale: 1 = 3-4.5, 2 = 4.5-6, 3 = כיתה א … 8 = כיתה ו.
const COURSES: Course[] = [
  course('capoeira-small', 'capoeira', 1, 1),
  course('capoeira-small-2', 'capoeira', 1, 1),
  course('capoeira-grades', 'capoeira', 5, 8),
  course('capoeira-first', 'capoeira', 3, 4),
  course('aerial-first', 'aerial', 3, 4),
  course('aerial-third', 'aerial', 5, 6),
  course('open', 'aerial', null, null),
];

const FILTERS: CustomerFilters = {
  search: '',
  city: 'all',
  branch: 'all',
  course_type: 'all',
  age_group: 'all',
  course: 'all',
  lesson: 'all',
  day_of_week: 'all',
  instructor: 'all',
  status: 'all',
  absent_irregularly: 'all',
  has_problems: 'all',
};

describe('courseAgeGroupKey', () => {
  it('writes the range as the server reads it', () => {
    expect(courseAgeGroupKey({ min_age: 3, max_age: 4 })).toBe('3-4');
    expect(courseAgeGroupKey({ min_age: 1, max_age: 1 })).toBe('1-1');
  });

  it('writes a missing bound, and a bound of 0, as nothing', () => {
    expect(courseAgeGroupKey({ min_age: 6, max_age: null })).toBe('6-');
    expect(courseAgeGroupKey({ min_age: 0, max_age: 9 })).toBe('-9');
    expect(courseAgeGroupKey({ min_age: null, max_age: null })).toBe('');
    expect(courseAgeGroupKey({})).toBe('');
  });
});

describe('ageGroupOptions', () => {
  it('offers only the age groups of the chosen course type, once each, youngest first', () => {
    expect(ageGroupOptions(COURSES, 'capoeira')).toEqual([
      { value: '1-1', label: '3-4.5' },
      { value: '3-4', label: 'כיתה א - כיתה ב' },
      { value: '5-8', label: 'כיתה ג - כיתה ו' },
    ]);
    expect(ageGroupOptions(COURSES, 'aerial').map((o) => o.value)).toEqual(['3-4', '5-6']);
  });

  it('offers every age group when no course type is chosen', () => {
    expect(ageGroupOptions(COURSES, 'all').map((o) => o.value)).toEqual(['1-1', '3-4', '5-6', '5-8']);
  });

  it('offers nothing for a course type without courses', () => {
    expect(ageGroupOptions(COURSES, 'dance')).toEqual([]);
  });
});

describe('coursesForFilters', () => {
  const ids = (filters: Partial<CustomerFilters>) =>
    coursesForFilters(COURSES, { ...FILTERS, ...filters }).map((c) => c.id);

  it('lists every course when nothing is chosen', () => {
    expect(ids({})).toHaveLength(COURSES.length);
  });

  it('lists only the courses of the chosen course type', () => {
    expect(ids({ course_type: 'aerial' })).toEqual(['aerial-first', 'aerial-third', 'open']);
  });

  it('lists only the courses of the chosen age group, inside the course type', () => {
    expect(ids({ age_group: '3-4' })).toEqual(['capoeira-first', 'aerial-first']);
    expect(ids({ course_type: 'capoeira', age_group: '3-4' })).toEqual(['capoeira-first']);
  });
});

describe('settleCustomerFilters', () => {
  const settle = (prev: Partial<CustomerFilters>, key: keyof CustomerFilters, value: string) =>
    settleCustomerFilters({ ...FILTERS, ...prev, [key]: value }, key, COURSES);

  it('lets go of a course that is not of the new course type', () => {
    const next = settle({ course_type: 'capoeira', course: 'capoeira-small', lesson: 'l1' }, 'course_type', 'aerial');
    expect(next.course).toBe('all');
    expect(next.lesson).toBe('all');
  });

  it('keeps a course that is of the new course type, and its lesson', () => {
    const next = settle({ course: 'aerial-first', lesson: 'l1' }, 'course_type', 'aerial');
    expect(next.course).toBe('aerial-first');
    expect(next.lesson).toBe('l1');
  });

  it('lets go of an age group the new course type does not have', () => {
    expect(settle({ course_type: 'capoeira', age_group: '1-1' }, 'course_type', 'aerial').age_group).toBe('all');
  });

  it('keeps an age group the new course type has too', () => {
    expect(settle({ course_type: 'capoeira', age_group: '3-4' }, 'course_type', 'aerial').age_group).toBe('3-4');
  });

  it('lets go of a course outside the new age group', () => {
    const next = settle({ course_type: 'capoeira', course: 'capoeira-small', lesson: 'l1' }, 'age_group', '3-4');
    expect(next.course).toBe('all');
    expect(next.lesson).toBe('all');
  });

  it('keeps a course inside the new age group', () => {
    expect(settle({ course: 'capoeira-first' }, 'age_group', '3-4').course).toBe('capoeira-first');
  });

  it('clears the lesson when another course is chosen', () => {
    expect(settle({ course: 'capoeira-small', lesson: 'l1' }, 'course', 'capoeira-first').lesson).toBe('all');
  });

  it('leaves the funnel alone when an unrelated filter changes', () => {
    const next = settle({ course_type: 'capoeira', age_group: '1-1', course: 'capoeira-small', lesson: 'l1' }, 'status', 'active');
    expect(next).toMatchObject({ course_type: 'capoeira', age_group: '1-1', course: 'capoeira-small', lesson: 'l1', status: 'active' });
  });

  it('does not let go of a course it cannot find in the list', () => {
    expect(settle({ course: 'not-loaded' }, 'course_type', 'aerial').course).toBe('not-loaded');
  });
});
