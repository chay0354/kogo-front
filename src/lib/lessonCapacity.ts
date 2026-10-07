/**
 * A lesson's own limit — how many children this one day takes — as the office
 * types it. Empty means the lesson has no limit of its own and the group's and
 * the room's apply (kogo-back enrollment_counts.tightest_capacity).
 *
 * The same field stands in three windows (edit group, edit lesson, add
 * lesson); they read and check it here so they cannot disagree.
 */

export const LESSON_CAPACITY_LABEL = 'קיבולת לשיעור הזה';
export const LESSON_CAPACITY_HINT = 'ריק = לפי הקבוצה והחדר. מספר סוגר רק את היום הזה, ושאר ימי הקבוצה לא מושפעים.';
/** In the schedule a lesson is opened on one date, so the hint says the limit is the weekly lesson's. */
export const LESSON_CAPACITY_WEEKLY_HINT = 'חל על השיעור הזה בכל שבוע. ריק = לפי הקבוצה והחדר.';
export const LESSON_CAPACITY_ERROR = 'קיבולת לשיעור: מספר שלם מ־1 ומעלה, או להשאיר ריק';

/** The limit as the field shows it: a number, or empty for "none". */
export function lessonCapacityText(lesson: { capacity?: number | null } | null | undefined): string {
  const capacity = lesson?.capacity;
  return typeof capacity === 'number' && capacity > 0 ? String(capacity) : '';
}

export type LessonCapacityRead = { ok: true; capacity: number | null } | { ok: false };

/** What was typed, as what is sent: a whole number from 1, null for an empty field, or not ok. */
export function readLessonCapacity(text: string | null | undefined): LessonCapacityRead {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return { ok: true, capacity: null };
  const capacity = Number(trimmed);
  if (!Number.isInteger(capacity) || capacity < 1) return { ok: false };
  return { ok: true, capacity };
}
