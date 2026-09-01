import { describe, expect, it } from 'vitest';
import { INSTRUCTOR_MOTION_MS, resolveInstructorMotionDelay } from './instructorMotion';
import {
  INSTRUCTOR_BACK_LAYERS,
  instructorBackNeedsGuard,
  resolveInstructorBack,
  type InstructorBackLayer,
} from './instructorBack';

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

describe("the phone's back button on the instructor screen", () => {
  it('closes an open register instead of leaving the site', () => {
    expect(resolveInstructorBack({ tourOpen: false, open: { attendance: true } })).toEqual({
      kind: 'close',
      layer: 'attendance',
    });
  });

  it('closes the walk-in form and leaves the register it sits in open', () => {
    expect(
      resolveInstructorBack({
        tourOpen: false,
        open: { attendance: true, attendanceOverlay: true },
      }),
    ).toEqual({ kind: 'close', layer: 'attendanceOverlay' });
  });

  it('closes the numbers sheet on its own', () => {
    expect(resolveInstructorBack({ tourOpen: false, open: { dashboard: true } })).toEqual({
      kind: 'close',
      layer: 'dashboard',
    });
  });

  it('lets a bare day leave the way it always did', () => {
    expect(resolveInstructorBack({ tourOpen: false, open: {} })).toEqual({ kind: 'leave' });
    expect(instructorBackNeedsGuard({ tourOpen: false, open: {} })).toBe(false);
  });

  it('takes nothing off the guided tour, however much is open behind it', () => {
    expect(resolveInstructorBack({ tourOpen: true, open: {} })).toEqual({ kind: 'hold' });
    expect(
      resolveInstructorBack({
        tourOpen: true,
        open: { attendance: true, attendanceOverlay: true },
      }),
    ).toEqual({ kind: 'hold' });
    expect(instructorBackNeedsGuard({ tourOpen: true, open: {} })).toBe(true);
  });

  it('spends one press per layer and always reaches the way out', () => {
    const open: Partial<Record<InstructorBackLayer, boolean>> = {};
    INSTRUCTOR_BACK_LAYERS.forEach((layer) => {
      open[layer] = true;
    });

    let presses = 0;
    let action = resolveInstructorBack({ tourOpen: false, open });
    while (action.kind === 'close') {
      open[action.layer] = false;
      presses += 1;
      // A press that closed nothing would loop here forever on a real screen.
      expect(presses).toBeLessThanOrEqual(INSTRUCTOR_BACK_LAYERS.length);
      action = resolveInstructorBack({ tourOpen: false, open });
    }

    expect(action).toEqual({ kind: 'leave' });
    expect(presses).toBe(INSTRUCTOR_BACK_LAYERS.length);
  });
});
