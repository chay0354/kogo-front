import { describe, expect, it } from 'vitest';
import { INSTRUCTOR_MOTION_MS, resolveInstructorMotionDelay } from './instructorMotion';

describe('instructor motion timing', () => {
  it('keeps the visual delay on the mobile instructor flow', () => {
    expect(resolveInstructorMotionDelay({
      duration: INSTRUCTOR_MOTION_MS.openLesson,
      reduceMotion: false,
      mobileOnly: true,
      isMobile: true,
    })).toBe(220);
  });

  it('does not delay navigation when reduced motion is requested', () => {
    expect(resolveInstructorMotionDelay({
      duration: INSTRUCTOR_MOTION_MS.logout,
      reduceMotion: true,
    })).toBe(0);
  });

  it('does not delay a mobile-only transition on desktop', () => {
    expect(resolveInstructorMotionDelay({
      duration: INSTRUCTOR_MOTION_MS.openLesson,
      reduceMotion: false,
      mobileOnly: true,
      isMobile: false,
    })).toBe(0);
  });
});
