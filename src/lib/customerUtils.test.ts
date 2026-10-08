import { describe, expect, test } from 'vitest';

import {
  chipKindLabel,
  chipsForCustomerRow,
  formatEnrollmentSlot,
  groupEnrollmentsForTable,
} from '@/lib/customerUtils';
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

describe('chipsForCustomerRow — a trial shows only on a child who is on a trial status', () => {
  // Owner, 8.10.2026: "מי שפעיל שלא יראה מתי עשה ניסיון. רק מי שנרשם לניסיון או ביצע ניסיון."
  const NOW = new Date(2026, 9, 8, 12, 0);
  const regular = enrollment({ enrollment_id: 'reg', lesson_id: 'mon', course_id: 'c1', course_name: 'קפוארה' });
  const pastTrial = enrollment({
    enrollment_id: 'old-trial', lesson_id: 'wed', course_id: 'c2', course_name: 'אקרובטיקה', trial_lesson_date: '2026-10-05',
  });
  const heldTrial = {
    enrollment_id: 'held', course_name: 'אקרובטיקה', trial_lesson_date: '2026-10-05', trial_outcome: 'attended' as const,
  };

  test('a student does not show a trial already held', () => {
    const chips = chipsForCustomerRow({ status: 'active', enrollments: [regular, pastTrial], trial_enrollment: heldTrial }, NOW);
    expect(chips.map((chip) => [chip.courseName, chip.trial])).toEqual([['קפוארה', false]]);
  });

  test('a student keeps a trial that is still ahead — a live booking the office edits here', () => {
    const today = enrollment({ enrollment_id: 't-today', lesson_id: 'thu', course_id: 'c2', course_name: 'אקרובטיקה', trial_lesson_date: '2026-10-08' });
    const ahead = enrollment({ enrollment_id: 't-ahead', lesson_id: 'sun', course_id: 'c3', course_name: 'סלינג', trial_lesson_date: '2026-10-11' });
    const chips = chipsForCustomerRow({ status: 'active', enrollments: [regular, today, ahead] }, NOW);
    expect(chips.map((chip) => [chip.courseName, chip.trial])).toEqual([
      ['קפוארה', false], ['אקרובטיקה', true], ['סלינג', true],
    ]);
  });

  test.each(['inactive', 'pending', 'payments_problem', 'ended', undefined])(
    'status %s: a held trial is not shown either',
    (status) => {
      const chips = chipsForCustomerRow({ status, enrollments: [pastTrial], trial_enrollment: heldTrial }, NOW);
      expect(chips).toEqual([]);
    },
  );

  test('ביצע ניסיון: the trial already held is shown, with its date and what became of it', () => {
    const chips = chipsForCustomerRow({ status: 'trial_completed', enrollments: [], trial_enrollment: heldTrial }, NOW);
    expect(chips).toHaveLength(1);
    expect(chips[0].courseName).toBe('אקרובטיקה');
    expect(chips[0].trial).toBe(true);
    expect(chips[0].slots[0].trial_lesson_date).toBe('2026-10-05');
    expect(chipKindLabel(chips[0])).toBe('ניסיון · הגיע');
  });

  test('the held trial cannot be edited from the list, and shows no weekly slot', () => {
    const [chip] = chipsForCustomerRow({ status: 'trial_completed', enrollments: [], trial_enrollment: heldTrial }, NOW);
    expect(chip.slots.some((slot) => slot.lesson_id || slot.enrollment_id)).toBe(false);
    expect(formatEnrollmentSlot(chip.slots[0])).toBe('');
  });

  test('ביצע ניסיון before the outcome is written: the date alone', () => {
    const chips = chipsForCustomerRow({
      status: 'trial_completed',
      enrollments: [],
      trial_enrollment: { ...heldTrial, trial_outcome: null },
    }, NOW);
    expect(chips[0].slots[0].trial_lesson_date).toBe('2026-10-05');
    expect(chipKindLabel(chips[0])).toBe('ניסיון');
  });

  test('a trial that did not come', () => {
    const [chip] = chipsForCustomerRow({
      status: 'trial_completed', enrollments: [], trial_enrollment: { ...heldTrial, trial_outcome: 'no_show' },
    }, NOW);
    expect(chipKindLabel(chip)).toBe('ניסיון · לא הגיע');
  });

  test('נרשם לניסיון: the booked trial is the chip — the server\'s copy of it is not added again', () => {
    const booked = enrollment({ enrollment_id: 'booked', lesson_id: 'sun', course_id: 'c2', course_name: 'אקרובטיקה', trial_lesson_date: '2026-10-11' });
    const chips = chipsForCustomerRow({
      status: 'trial_signed',
      enrollments: [booked],
      trial_enrollment: { enrollment_id: 'booked', course_name: 'אקרובטיקה', trial_lesson_date: '2026-10-11', trial_outcome: null },
    }, NOW);
    expect(chips).toHaveLength(1);
    expect(chips[0].slots[0].enrollment_id).toBe('booked');
  });

  test('a trial child with nothing to show stays empty', () => {
    expect(chipsForCustomerRow({ status: 'trial_completed', enrollments: [], trial_enrollment: null }, NOW)).toEqual([]);
    // An old trial sign-up with no date on it: the class itself is already the chip.
    const undated = chipsForCustomerRow({
      status: 'trial_signed',
      enrollments: [regular],
      trial_enrollment: { enrollment_id: 'reg', course_name: 'קפוארה', trial_lesson_date: null, trial_outcome: null },
    }, NOW);
    expect(undated.map((chip) => [chip.courseName, chip.trial])).toEqual([['קפוארה', false]]);
  });

  test('a regular chip keeps its word', () => {
    const [chip] = chipsForCustomerRow({ status: 'active', enrollments: [regular] }, NOW);
    expect(chipKindLabel(chip)).toBe('רגיל');
  });
});
