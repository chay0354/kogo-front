import { afterEach, describe, expect, it } from 'vitest';
import { WIDGET_MOTION_MS, prefersReducedMotion } from './widgetMotion';

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
