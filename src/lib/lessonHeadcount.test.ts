import { describe, expect, it } from 'vitest';
import {
  lessonCountDetail,
  lessonCountLabel,
  lessonOthers,
  lessonStudents,
  lessonTrials,
  registerCounts,
} from './lessonHeadcount';

// Owner, 13.10.2026: "כמות התלמידים שמופיעים ביומן במערכת של ה-admin לא תואמים למשתמשים של המורים."
describe('one number of students for a lesson', () => {
  const lesson = {
    enrollment_count: 6,          // seats taken — what registration checks
    student_count: 8,             // everyone on the register that day
    active_student_count: 4,      // students
    trial_student_count: 1,
    other_student_count: 3,
  };

  it('the calendar shows the students — the figure the instructor sees — not the seats', () => {
    expect(lessonStudents(lesson)).toBe(4);
    expect(lessonCountLabel(lesson, 20)).toBe('4/20');
    expect(lessonCountLabel(lesson, null)).toBe('4');
  });

  it('says what else is on the register that day', () => {
    expect(lessonTrials(lesson)).toBe(1);
    expect(lessonOthers(lesson)).toBe(3);
    expect(lessonCountDetail(lesson, 20)).toBe('4/20 · 1 ניסיון · 3 מזדמנים');
    expect(lessonCountDetail({ enrollment_count: 5, active_student_count: 5 }, 20)).toBe('5/20');
  });

  it('a server that does not send the split yet still gets a number', () => {
    expect(lessonStudents({ enrollment_count: 6 })).toBe(6);
    expect(lessonOthers({ enrollment_count: 6 })).toBe(0);
  });
});

describe('the same split from the register itself', () => {
  it('reads the server\'s word for each row', () => {
    const rows = [
      { register_kind: 'student' as const },
      { register_kind: 'student' as const },
      { register_kind: 'trial' as const },
      { register_kind: 'other' as const },
    ];
    expect(registerCounts(rows)).toEqual({ students: 2, trials: 1, others: 1, total: 4 });
  });

  it('without it, the same rule from the row: פעיל, בעיה באשראי, בתהליך רישום and the municipality\'s children are registered', () => {
    const rows = [
      { child_status: 'active' },
      { child_status: 'payment_problem' },
      { child_status: 'external' },
      { child_status: 'pending' },
      { child_status: 'inactive' },
      { child_status: 'trial_completed' },
      { child_status: 'ghost' },
      { child_status: 'active', is_trial: true },
    ];
    expect(registerCounts(rows)).toEqual({ students: 4, trials: 1, others: 3, total: 8 });
  });

  it('an empty register', () => {
    expect(registerCounts([])).toEqual({ students: 0, trials: 0, others: 0, total: 0 });
  });
});
