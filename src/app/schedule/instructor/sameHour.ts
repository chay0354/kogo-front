import type { Lesson } from '@/types/schedule';
import { activeCount } from './instructorUtils';

/**
 * Groups that train together (owner, 15.10.2026). A competitive track is its
 * own group in the system, with its own lessons — but at the hour it shares
 * with an age group the instructor teaches one room, and should see one card
 * and every child of that hour on one screen.
 *
 * Together means: the same instructor, the same branch, the same day and the
 * same start time. A cancelled lesson stands alone.
 */

function hhmm(time: string | null | undefined): string {
  return String(time || '').slice(0, 5);
}

export function sameHourKey(lesson: Lesson): string {
  return [lesson.instructor_id || '', lesson.branch_id || '', lesson.lesson_date || '', hhmm(lesson.start_time)].join('|');
}

function together(a: Lesson, b: Lesson): boolean {
  return a.status !== 'cancelled' && b.status !== 'cancelled' && sameHourKey(a) === sameHourKey(b);
}

export type SameHourSlot = { primary: Lesson; partners: Lesson[] };

/**
 * One slot per hour the instructor teaches, in the order the lessons came. The
 * group with the most children leads the card; the others ride along.
 */
export function groupSameHour(lessons: Lesson[]): SameHourSlot[] {
  const slots: Lesson[][] = [];
  for (const lesson of lessons) {
    const slot = slots.find((group) => together(group[0], lesson));
    if (slot) slot.push(lesson);
    else slots.push([lesson]);
  }
  return slots.map((group) => {
    const ranked = [...group].sort(
      (a, b) => activeCount(b, b.trial_student_count ?? 0) - activeCount(a, a.trial_student_count ?? 0),
    );
    return { primary: ranked[0], partners: ranked.slice(1) };
  });
}

/** The other lessons of the hour this lesson is taught in. */
export function partnersOf(lesson: Lesson | null, lessons: Lesson[]): Lesson[] {
  if (!lesson) return [];
  return lessons.filter((other) => !(other.id === lesson.id && other.lesson_date === lesson.lesson_date) && together(lesson, other));
}
