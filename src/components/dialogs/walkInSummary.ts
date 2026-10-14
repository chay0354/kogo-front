import type { WalkInSummary } from '@/types/customer';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

type WalkInLesson = WalkInSummary['lessons'][number];

/** 2026-09-07 → 7.9 */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}`;
}

/** "קפוארה · שני 16:00 · מינץ 24" */
export function walkInLessonLine(lesson: WalkInLesson): string {
  const when = [DAYS[lesson.day_of_week] ?? '', lesson.start_time].filter(Boolean).join(' ');
  return [lesson.course_name, when, lesson.branch_name].filter(Boolean).join(' · ');
}

/** "הגיע ב-7.9" / "הגיע 2 פעמים · 7.9–14.9" */
export function walkInVisitsLine(lesson: WalkInLesson): string {
  if (!lesson.first_seen) return '';
  if (lesson.visits <= 1 || lesson.first_seen === lesson.last_seen) return `הגיע ב-${shortDate(lesson.first_seen)}`;
  return `הגיע ${lesson.visits} פעמים · ${shortDate(lesson.first_seen)}–${shortDate(lesson.last_seen)}`;
}

/**
 * What happens next, in the office's words. `today` is YYYY-MM-DD.
 * A walk-in with no phone is removed after the last lesson the instructor sees it on.
 */
export function walkInNextLine(summary: WalkInSummary, today: string): string {
  const until = summary.lessons
    .map((lesson) => lesson.shown_until)
    .filter((day): day is string => Boolean(day))
    .sort()
    .pop();
  const stillShown = Boolean(until && until >= today);
  if (summary.phone_missing) {
    return stillShown
      ? `אין טלפון — יימחק מהמערכת אחרי ${shortDate(until)}`
      : 'אין טלפון — יימחק מהמערכת';
  }
  return stillShown
    ? `יש טלפון · מופיע למדריך עד ${shortDate(until)}`
    : 'יש טלפון — אפשר לחזור אליו';
}
