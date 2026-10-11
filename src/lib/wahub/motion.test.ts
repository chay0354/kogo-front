import { describe, expect, it } from 'vitest';
import {
  COUNT_UP_MS,
  countUpValue,
  easeOut,
  KEYBOARD_MIN_PX,
  keyboardBox,
  paneDepth,
  paneDirection,
  TAB_ORDER,
  tabDirection,
  wheelPixels,
} from './motion';

describe('which way a tab comes in', () => {
  it('a later tab is forward, an earlier one is back', () => {
    expect(tabDirection('chats', 'today')).toBe('forward');
    expect(tabDirection('today', 'settings')).toBe('forward');
    expect(tabDirection('settings', 'chats')).toBe('back');
    expect(tabDirection('bot', 'leads')).toBe('back');
  });

  it('the same tab is forward: the first draw of the page comes in as a page that opens', () => {
    for (const tab of TAB_ORDER) expect(tabDirection(tab, tab)).toBe('forward');
  });

  it('the order is the order of the tabs on screen', () => {
    expect(TAB_ORDER).toEqual(['chats', 'today', 'leads', 'bot', 'settings']);
  });
});

describe('the three pages of a phone', () => {
  it('the list, a conversation, its details', () => {
    expect(paneDepth(null, false)).toBe(0);
    expect(paneDepth(12, false)).toBe(1);
    expect(paneDepth(12, true)).toBe(2);
  });

  it('details asked for with no conversation open is still the list', () => {
    expect(paneDepth(null, true)).toBe(0);
  });

  it('deeper is forward, the way back is back', () => {
    expect(paneDirection(0, 1, 'back')).toBe('forward');
    expect(paneDirection(1, 2, 'back')).toBe('forward');
    expect(paneDirection(2, 1, 'forward')).toBe('back');
    expect(paneDirection(1, 0, 'forward')).toBe('back');
  });

  it('another conversation at the same depth keeps the direction — nothing is played again', () => {
    expect(paneDirection(1, 1, 'forward')).toBe('forward');
    expect(paneDirection(1, 1, 'back')).toBe('back');
  });
});

describe('a number that counts up', () => {
  it('starts at the start and lands exactly on the figure', () => {
    expect(countUpValue(0, 137, 0)).toBe(0);
    expect(countUpValue(0, 137, 1)).toBe(137);
    expect(countUpValue(0, 137, 1.4)).toBe(137);
    expect(countUpValue(0, 137, -1)).toBe(0);
  });

  it('never passes the figure and never goes back on the way', () => {
    let last = 0;
    for (let step = 0; step <= 100; step += 1) {
      const shown = countUpValue(0, 37, step / 100);
      expect(shown).toBeGreaterThanOrEqual(last);
      expect(shown).toBeLessThanOrEqual(37);
      last = shown;
    }
  });

  it('is quick at first and settles at the end', () => {
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  it('takes about half a second — inside the section\'s rule of short moves', () => {
    expect(COUNT_UP_MS).toBeGreaterThanOrEqual(300);
    expect(COUNT_UP_MS).toBeLessThanOrEqual(600);
  });
});

describe('the room a phone has left above its keyboard', () => {
  const screen = { innerHeight: 812, height: 812, offsetTop: 0, scale: 1 };

  it('no keyboard: nothing to do', () => {
    expect(keyboardBox(screen)).toBeNull();
  });

  it('the browser\'s own bars moving is not a keyboard', () => {
    expect(keyboardBox({ ...screen, height: 812 - (KEYBOARD_MIN_PX - 1) })).toBeNull();
  });

  it('a keyboard: the height that is left, and where it starts', () => {
    expect(keyboardBox({ ...screen, height: 476.4, offsetTop: 0 })).toEqual({ height: 476, offsetTop: 0 });
    expect(keyboardBox({ ...screen, height: 476, offsetTop: 120.6 })).toEqual({ height: 476, offsetTop: 121 });
  });

  it('pinched in: the visible part is small for that reason, and the screen is left alone', () => {
    expect(keyboardBox({ ...screen, height: 400, scale: 2 })).toBeNull();
  });

  it('a reading that makes no sense is no keyboard', () => {
    expect(keyboardBox({ ...screen, height: 0 })).toBeNull();
    expect(keyboardBox({ ...screen, innerHeight: 0 })).toBeNull();
    expect(keyboardBox({ ...screen, height: 400, offsetTop: -30 })).toEqual({ height: 400, offsetTop: 0 });
  });
});

describe('a wheel, in pixels', () => {
  it('pixels stay pixels; lines and pages are turned into them', () => {
    expect(wheelPixels(120, 0, 600)).toBe(120);
    expect(wheelPixels(3, 1, 600)).toBe(48);
    expect(wheelPixels(1, 2, 600)).toBe(600);
    expect(wheelPixels(-3, 1, 600)).toBe(-48);
  });
});
