/**
 * How many students a lesson has — one answer for every screen.
 *
 * Owner, 13.10.2026: the office's calendar and the instructors' screens showed
 * different numbers for the same lesson. The calendar drew the seats taken, the
 * instructor's day drew the register without its trials, and the lesson window
 * drew the length of the register.
 *
 * The server now says what each row on a register is (`register_kind`:
 * student / trial / other — kogo-back enrollment_counts.register_kind) and
 * counts the schedule by it. `student` is who is registered, in the owner's
 * words of the same day: a regular place, "גם כאלה שהתשלום שלהם לא עבר" (פעיל,
 * בעיה באשראי, בתהליך רישום), a child who cancelled and still comes to the end
 * of the month they paid for, and the municipality's children. These helpers
 * are the only readers, so no screen picks a field of its own.
 */

type CountedLesson = {
  enrollment_count: number;
  student_count?: number;
  active_student_count?: number;
  trial_student_count?: number;
  other_student_count?: number;
};

/** The registered of the lesson on that date. Falls back for a server that does not send it yet. */
export function lessonStudents(lesson: CountedLesson): number {
  return lesson.active_student_count ?? lesson.enrollment_count;
}

export function lessonTrials(lesson: CountedLesson): number {
  return lesson.trial_student_count ?? 0;
}

/** On the register that day but not registered: a walk-in the instructor added. A child who left is not on it at all. */
export function lessonOthers(lesson: CountedLesson): number {
  return lesson.other_student_count ?? 0;
}

/** "12/20", or "12" for a lesson nobody capped. */
export function lessonCountLabel(lesson: CountedLesson, capacity: number | null | undefined): string {
  const students = lessonStudents(lesson);
  return capacity ? `${students}/${capacity}` : `${students}`;
}

/** The label with what else is on the register that day, for a tooltip: "12/20 · 2 ניסיון". */
export function lessonCountDetail(lesson: CountedLesson, capacity: number | null | undefined): string {
  const parts = [lessonCountLabel(lesson, capacity)];
  const trials = lessonTrials(lesson);
  const others = lessonOthers(lesson);
  if (trials > 0) parts.push(`${trials} ניסיון`);
  if (others > 0) parts.push(`${others} מזדמנים`);
  return parts.join(' · ');
}

type RegisterRow = {
  register_kind?: 'student' | 'trial' | 'other';
  is_trial?: boolean;
  child_status?: string;
};

const STUDENT_STATUSES = new Set(['active', 'payment_problem', 'pending', 'external']);

/**
 * The same split from a register's own rows — what the lesson window shows, so
 * its figure is the calendar's. Reads the server's word; for a server that does
 * not send it yet, the same rule from the row's fields.
 */
export function registerCounts(rows: RegisterRow[]): { students: number; trials: number; others: number; total: number } {
  let students = 0;
  let trials = 0;
  let others = 0;
  for (const row of rows) {
    const kind =
      row.register_kind ??
      (row.is_trial ? 'trial' : STUDENT_STATUSES.has(row.child_status ?? '') ? 'student' : 'other');
    if (kind === 'trial') trials += 1;
    else if (kind === 'student') students += 1;
    else others += 1;
  }
  return { students, trials, others, total: rows.length };
}
