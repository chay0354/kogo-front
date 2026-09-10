import { describe, expect, test } from 'vitest';
import {
  SCROLL_CUE_INSET_PX,
  SCROLL_CUE_SLACK_PX,
  scrollCueTop,
  showsScrollCue,
} from './scrollCue';

/** A tall catalogue seen through a short band — the case the arrow exists for. */
const RUNS_PAST_THE_EDGE = { contentHeight: 1400, scrollY: 0, bandBottom: 520 };

describe('showsScrollCue', () => {
  test('points down while the catalogue runs past the visible band', () => {
    expect(showsScrollCue(RUNS_PAST_THE_EDGE)).toBe(true);
  });

  test('lets go once the last row is on screen', () => {
    expect(showsScrollCue({ ...RUNS_PAST_THE_EDGE, scrollY: 900 })).toBe(false);
  });

  test('stays away when the whole widget already fits the band', () => {
    expect(showsScrollCue({ contentHeight: 700, scrollY: 0, bandBottom: 760 })).toBe(false);
  });

  test('stays away while a course card is open over the list', () => {
    expect(showsScrollCue({ ...RUNS_PAST_THE_EDGE, overlayOpen: true })).toBe(false);
  });

  test('says nothing before the host has reported a band', () => {
    expect(showsScrollCue({ ...RUNS_PAST_THE_EDGE, bandBottom: 0 })).toBe(false);
    expect(showsScrollCue({ ...RUNS_PAST_THE_EDGE, bandBottom: Number.NaN })).toBe(false);
  });

  test('says nothing when the content has not been measured', () => {
    expect(showsScrollCue({ ...RUNS_PAST_THE_EDGE, contentHeight: Number.NaN })).toBe(false);
  });

  test('is not fooled by a rubber-band swipe past the top', () => {
    expect(showsScrollCue({ ...RUNS_PAST_THE_EDGE, scrollY: -80 })).toBe(
      showsScrollCue({ ...RUNS_PAST_THE_EDGE, scrollY: 0 }),
    );
  });

  test('lets the last few pixels go rather than flickering at the end', () => {
    const settled = { contentHeight: 1000, scrollY: 0, bandBottom: 1000 - SCROLL_CUE_SLACK_PX };
    expect(showsScrollCue(settled)).toBe(false);
    expect(showsScrollCue({ ...settled, bandBottom: settled.bandBottom - 1 })).toBe(true);
  });
});

describe('scrollCueTop', () => {
  test('floats the arrow clear of the band’s bottom edge', () => {
    expect(scrollCueTop(520)).toBe(520 - SCROLL_CUE_INSET_PX);
  });

  test('never places the arrow above the top of the frame', () => {
    expect(scrollCueTop(10)).toBe(0);
    expect(scrollCueTop(Number.NaN)).toBe(0);
  });
});
