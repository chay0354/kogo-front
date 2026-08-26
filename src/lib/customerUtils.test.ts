import { describe, expect, test } from 'vitest';

import { formatEnrollmentSlot, groupEnrollmentsForTable } from '@/lib/customerUtils';
import type { EnrollmentDetail } from '@/types/customer';

function enrollment(overrides: Partial<EnrollmentDetail>): EnrollmentDetail {
  return {
    lesson_id: 'l1',
    enrollment_id: 'e1',
    course_name: 'קפוארה',
    course_id: 'c1',
    course_display_id: 1,
    day_of_week: 1,
    start_time: '16:45:00',
    end_time: '17:30:00',
    branch_name: 'סניף',
    instructor_name: 'מאסטר',
    status: 'active',
    trial_lesson_date: null,
    ...overrides,
  };
}

describe('groupEnrollmentsForTable', () => {
  test('merges the same course twice a week into one chip', () => {
    const groups = groupEnrollmentsForTable([
      enrollment({ enrollment_id: 'e1', lesson_id: 'mon', day_of_week: 1, start_time: '16:45:00' }),
      enrollment({ enrollment_id: 'e2', lesson_id: 'thu', day_of_week: 4, start_time: '17:30:00' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].slots).toHaveLength(2);
    expect(groups[0].slots.map((slot) => formatEnrollmentSlot(slot))).toEqual([
      'שני 16:45',
      'חמישי 17:30',
    ]);
  });

  test('keeps a trial day on its own chip', () => {
    const groups = groupEnrollmentsForTable([
      enrollment({ enrollment_id: 'e1', trial_lesson_date: '2026-08-27' }),
      enrollment({ enrollment_id: 'e2', lesson_id: 'l2', day_of_week: 4 }),
    ]);
    expect(groups).toHaveLength(2);
  });
});
