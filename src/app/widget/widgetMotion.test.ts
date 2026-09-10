import { afterEach, describe, expect, it } from 'vitest';
import { WIDGET_MOTION_MS, holdsBandWhileOpen, prefersReducedMotion } from './widgetMotion';

const globalWithWindow = globalThis as { window?: unknown };

function stubWindow(matches: boolean | null) {
  globalWithWindow.window = matches === null
    ? {}
    : { matchMedia: () => ({ matches }) };
}

afterEach(() => {
  delete globalWithWindow.window;
});

describe('widget motion timing', () => {
  it('lets every overlay leave faster than it arrived', () => {
    expect(WIDGET_MOTION_MS.detailExit).toBeLessThan(380);
    expect(WIDGET_MOTION_MS.drawerExit).toBeLessThan(340);
    expect(WIDGET_MOTION_MS.noticeExit).toBeLessThan(380);
  });

  it('keeps the small notice quicker than the card it sits over', () => {
    expect(WIDGET_MOTION_MS.noticeExit).toBeLessThan(WIDGET_MOTION_MS.detailExit);
  });

  it('folds the extra tracks away faster than it unfolds them', () => {
    expect(WIDGET_MOTION_MS.accordionExit).toBeLessThan(WIDGET_MOTION_MS.accordion);
  });

  it('unfolds a track slowly enough to follow, without making anyone wait', () => {
    // Deliberately unhurried: a parent watches the lessons arrive and reads them
    // as they come. Half a second is where a transition stops reading as motion
    // and starts reading as a delay.
    expect(WIDGET_MOTION_MS.accordion).toBeGreaterThan(WIDGET_MOTION_MS.drawerExit);
    expect(WIDGET_MOTION_MS.accordion).toBeLessThanOrEqual(500);
  });

  it('lets the widget arrive more slowly than anything here leaves', () => {
    const exits = [
      WIDGET_MOTION_MS.detailExit,
      WIDGET_MOTION_MS.drawerExit,
      WIDGET_MOTION_MS.noticeExit,
      WIDGET_MOTION_MS.accordionExit,
    ];
    exits.forEach((exit) => expect(exit).toBeLessThan(WIDGET_MOTION_MS.stripIn));
  });

  describe('prefersReducedMotion', () => {
    it('says no on the server, where there is no window to ask', () => {
      expect(prefersReducedMotion()).toBe(false);
    });

    it('says yes for a reader who asked for less motion', () => {
      stubWindow(true);
      expect(prefersReducedMotion()).toBe(true);
    });

    it('says no for a reader who did not', () => {
      stubWindow(false);
      expect(prefersReducedMotion()).toBe(false);
    });

    it('says no where matchMedia is missing', () => {
      stubWindow(null);
      expect(prefersReducedMotion()).toBe(false);
    });
  });
});

describe('holding the host band while an overlay is open', () => {
  it('holds it on a phone, where the host slides the frame to keep the slice still', () => {
    stubWindow(false);
    expect(holdsBandWhileOpen()).toBe(true);
  });

  it('lets go on a desktop, where the frame jumps to the top and the fresh band is the truth', () => {
    stubWindow(true);
    expect(holdsBandWhileOpen()).toBe(false);
  });

  it('holds it when the viewport cannot be asked', () => {
    stubWindow(null);
    expect(holdsBandWhileOpen()).toBe(true);
  });
});
