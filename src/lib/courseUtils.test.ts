import { describe, expect, test } from 'vitest';

import {
  calculateCourseFinancials,
  calculateInstructorSalary,
  calculateLessonFinancials,
  filterCourses,
  LESSONS_PER_MONTH,
} from '@/lib/courseUtils';

// Minimal runtime objects (API may return decimals as strings)
function makeInstructor(overrides?: Partial<any>) {
  return {
    id: 'i1',
    full_name: 'מדריך',
    salary_model_type: 'fixed_per_lesson',
    fixed_salary_per_lesson: '200.00',
    salary_tiers: [],
    ...overrides,
  };
}

function makeLesson(overrides?: Partial<any>) {
  return {
    id: 'l1',
    day_of_week: 1,
    day_name: 'שני',
    start_time: '16:00',
    end_time: '16:45',
    branch: { id: 'b1', name: 'סניף' },
    room: null,
    instructor: makeInstructor(),
    enrolled_count: 1,
    lesson_price_override: null,
    instructor_salary_override: null,
    status: 'scheduled',
    is_recurring: true,
    notes: '',
    ...overrides,
  };
}

function makeCourse(overrides?: Partial<any>) {
  return {
    id: 'c1',
    name: 'חוג',
    description: '',
    price: '400.00',
    capacity: 20,
    min_age: 6,
    max_age: 8,
    lessons: [makeLesson()],
    is_active: true,
    ...overrides,
  };
}

describe('courseUtils - salary + financials', () => {
  test('calculateInstructorSalary: uses per-lesson override when set', () => {
    const lesson = makeLesson({ instructor_salary_override: '333.00' });
    const salary = calculateInstructorSalary(lesson as any, lesson.instructor as any, 1);
    expect(salary).toBe(333);
  });

  test('calculateInstructorSalary: returns 0 when lesson has no instructor (deleted/unassigned)', () => {
    const lesson = makeLesson({ instructor: null });
    const salary = calculateInstructorSalary(lesson as any, lesson.instructor as any, 3);
    expect(salary).toBe(0);
  });

  test('calculateInstructorSalary: tiered model selects matching tier', () => {
    const instructor = makeInstructor({
      salary_model_type: 'tiered_by_students',
      salary_tiers: [
        { min_students: 0, max_students: 5, salary_per_lesson: '150.00' },
        { min_students: 6, max_students: 10, salary_per_lesson: '200.00' },
        { min_students: 11, max_students: null, salary_per_lesson: '250.00' },
      ],
    });
    const lesson = makeLesson({ instructor });

    expect(calculateInstructorSalary(lesson as any, instructor as any, 2)).toBe(150);
    expect(calculateInstructorSalary(lesson as any, instructor as any, 7)).toBe(200);
    expect(calculateInstructorSalary(lesson as any, instructor as any, 99)).toBe(250);
  });

  test('calculateLessonFinancials: revenue is (price/4)*enrolled and profit = revenue - salary', () => {
    const lesson = makeLesson({ enrolled_count: 3 });
    const out = calculateLessonFinancials(lesson as any, 400);
    // revenue per lesson = (400 / 4) * 3 = 300
    expect(out.revenue).toBe(300);
    // salary fixed per lesson = 200
    expect(out.salary).toBe(200);
    expect(out.profit).toBe(100);
  });

  test('calculateCourseFinancials: multiplies per-lesson values by 4 for monthly totals', () => {
    const course = makeCourse({
      price: 400,
      lessons: [
        makeLesson({ id: 'l1', enrolled_count: 3 }), // profit per lesson 100
        makeLesson({ id: 'l2', enrolled_count: 1 }), // profit per lesson -100
      ],
    });
    const fin = calculateCourseFinancials(course as any);
    // revenue per lesson: 300 + 100 = 400; monthly = 400 * 4 = 1600
    expect(fin.monthlyRevenue).toBe(1600);
    // salary per lesson: 200 + 200 = 400; monthly = 400 * 4 = 1600
    expect(fin.monthlySalary).toBe(1600);
    expect(fin.monthlyProfit).toBe(0);
  });

  test('LESSONS_PER_MONTH is 4', () => {
    expect(LESSONS_PER_MONTH).toBe(4);
  });
});

describe('courseUtils - filtering, profitability, and enrollment changes', () => {
  test('filterCourses: profitability reacts to enrolled_count changes', () => {
    // Course profitable when enrolled_count >= 3 (price=400, salary=200):
    // monthlyProfit = price*enrolled - salary*4
    // enrolled=2 => 800 - 800 = 0 (not >0)
    // enrolled=3 => 1200 - 800 = 400 (>0)
    const baseCourse = makeCourse({
      price: 400,
      lessons: [makeLesson({ enrolled_count: 2 })],
    });

    const profitable1 = filterCourses([baseCourse as any], { profitability: 'profitable' });
    expect(profitable1).toHaveLength(0);

    const courseAfterJoin = {
      ...baseCourse,
      lessons: [makeLesson({ enrolled_count: 3 })],
    };
    const profitable2 = filterCourses([courseAfterJoin as any], { profitability: 'profitable' });
    expect(profitable2).toHaveLength(1);

    const unprofitable = filterCourses([courseAfterJoin as any], { profitability: 'unprofitable' });
    expect(unprofitable).toHaveLength(0);
  });

  test('filterCourses: age filter includes overlapping ranges', () => {
    const c1 = makeCourse({ id: 'c1', min_age: 6, max_age: 8 });
    const c2 = makeCourse({ id: 'c2', min_age: 9, max_age: 11 });

    const out = filterCourses([c1 as any, c2 as any], { age: { minAge: 6, maxAge: 8 } });
    expect(out.map((c: any) => c.id)).toEqual(['c1']);
  });

  test('filterCourses: time filter keeps courses with at least one lesson matching the time window', () => {
    const course = makeCourse({
      lessons: [
        makeLesson({ id: 'l1', start_time: '10:00', end_time: '10:45' }),
        makeLesson({ id: 'l2', start_time: '18:00', end_time: '18:45' }),
      ],
    });
    const outMorning = filterCourses([course as any], { time: { startHour: 0, endHour: 12 } });
    expect(outMorning).toHaveLength(1);

    const outAfternoon = filterCourses([course as any], { time: { startHour: 12, endHour: 16 } });
    expect(outAfternoon).toHaveLength(0);
  });
});


