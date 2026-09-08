import { describe, expect, it } from 'vitest';
import type { CourseBundle, CourseLesson } from './types';
import { trialLessonChoices, trialRegistrationOffered } from './lessonVisibility';

const lesson = (open?: boolean): CourseLesson => ({
  id: 'l', day_of_week: 0, start_time: '17:00', end_time: '18:00', instructor_name: null,
  ...(open === undefined ? {} : { trial_registration_open: open }),
});
const bundle = (...opens: (boolean | undefined)[]): CourseBundle => ({
  id: 'b', name: 'פעמיים בשבוע', combined_price: 500,
  lessons: opens.map((open, i) => ({
    id: `bl${i}`, day_of_week: i, start_time: '17:00', end_time: '18:00',
    ...(open === undefined ? {} : { trial_registration_open: open }),
  })),
});

describe('offering a trial on the card', () => {
  it('follows the lesson the parent picked', () => {
    expect(trialRegistrationOffered(lesson(true))).toBe(true);
    expect(trialRegistrationOffered(lesson(false))).toBe(false);
  });

  it('keeps the button when the payload does not say', () => {
    expect(trialRegistrationOffered(lesson())).toBe(true);
    expect(trialRegistrationOffered(null, null)).toBe(true);
  });

  it('offers a bundle trial while any of its lessons is open, and lists only those', () => {
    expect(trialRegistrationOffered(null, bundle(false, true))).toBe(true);
    expect(trialRegistrationOffered(null, bundle(false, false))).toBe(false);
    expect(trialLessonChoices(bundle(false, true, undefined)).map((l) => l.id)).toEqual(['bl1', 'bl2']);
  });
});
