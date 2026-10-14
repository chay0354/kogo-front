import { describe, expect, it } from 'vitest';
import type { WalkInSummary } from '@/types/customer';
import { shortDate, walkInLessonLine, walkInNextLine, walkInVisitsLine } from './walkInSummary';

const lesson = (over: Partial<WalkInSummary['lessons'][number]> = {}) => ({
  lesson_id: 'l1',
  course_name: 'קפוארה',
  branch_name: 'מינץ 24',
  instructor_name: 'שוקיו נריה',
  day_of_week: 1,
  start_time: '16:00',
  first_seen: '2026-09-07',
  last_seen: '2026-09-07',
  visits: 1,
  shown_until: '2026-09-14',
  ...over,
});

describe('walk-in summary lines', () => {
  it('names the lesson', () => {
    expect(walkInLessonLine(lesson())).toBe('קפוארה · שני 16:00 · מינץ 24');
  });

  it('says when it came', () => {
    expect(walkInVisitsLine(lesson())).toBe('הגיע ב-7.9');
    expect(walkInVisitsLine(lesson({ visits: 2, last_seen: '2026-09-14' }))).toBe('הגיע 2 פעמים · 7.9–14.9');
  });

  it('says what happens next', () => {
    expect(walkInNextLine({ lessons: [lesson()], phone_missing: true }, '2026-09-10')).toBe('אין טלפון — יימחק מהמערכת אחרי 14.9');
    expect(walkInNextLine({ lessons: [lesson()], phone_missing: false }, '2026-09-10')).toBe('יש טלפון · מופיע למדריך עד 14.9');
    expect(walkInNextLine({ lessons: [lesson()], phone_missing: false }, '2026-09-20')).toBe('יש טלפון — אפשר לחזור אליו');
  });

  it('writes a short date', () => {
    expect(shortDate('2026-10-04')).toBe('4.10');
    expect(shortDate(null)).toBe('');
  });
});
