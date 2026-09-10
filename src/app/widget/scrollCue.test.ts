import { describe, expect, test } from 'vitest';
import {
  SCROLL_CUE_HEIGHT_PX,
  SCROLL_CUE_ROW_GAP_PX,
  SCROLL_CUE_SLACK_PX,
  scrollCueTop,
} from './scrollCue';

/*
 * The numbers are the ones measured on a 375x812 phone against the live site:
 * a 900px frame, a catalogue ending at 1059, and lesson rows at 572 and 644.
 * The band's bottom travels 427 → 687 → 804 as the page scrolls past the frame.
 */
const CATALOGUE = { contentBottom: 1059, rowBottoms: [572, 644] };

describe('scrollCueTop', () => {
  test('stays away at the top of the page, where no lesson is on screen yet', () => {
    expect(scrollCueTop({ ...CATALOGUE, bandBottom: 427 })).toBeNull();
  });

  test('hangs under the last lesson once the list is being read', () => {
    expect(scrollCueTop({ ...CATALOGUE, bandBottom: 687 })).toBe(644 + SCROLL_CUE_ROW_GAP_PX);
  });

  test('keeps hold of that lesson instead of drifting after the closing line', () => {
    // The line travels on to 804 while the rows stay put; following it would
    // leave the arrow 126px under the list, pointing at empty space.
    expect(scrollCueTop({ ...CATALOGUE, bandBottom: 804 })).toBe(644 + SCROLL_CUE_ROW_GAP_PX);
  });

  test('lets go once the last row is on screen', () => {
    expect(scrollCueTop({ contentBottom: 700, rowBottoms: [572, 644], bandBottom: 690 })).toBeNull();
  });

  test('lets the last few pixels go rather than flickering at the end', () => {
    const settled = { contentBottom: 1000, rowBottoms: [900], bandBottom: 1000 - SCROLL_CUE_SLACK_PX };
    expect(scrollCueTop(settled)).toBeNull();
    expect(scrollCueTop({ ...settled, bandBottom: settled.bandBottom - 1 })).not.toBeNull();
  });

  test('stays away while a course card is open over the list', () => {
    expect(scrollCueTop({ ...CATALOGUE, bandBottom: 687, overlayOpen: true })).toBeNull();
  });

  test('says nothing before the host has reported a band', () => {
    expect(scrollCueTop({ ...CATALOGUE, bandBottom: 0 })).toBeNull();
    expect(scrollCueTop({ ...CATALOGUE, bandBottom: Number.NaN })).toBeNull();
  });

  test('says nothing when the content has not been measured', () => {
    expect(scrollCueTop({ ...CATALOGUE, contentBottom: Number.NaN, bandBottom: 687 })).toBeNull();
  });

  test('counts only the rows a reader can finish, not the ones cut off below', () => {
    // 644 runs past a band of 620, so 572 is the last one actually readable.
    expect(scrollCueTop({ ...CATALOGUE, bandBottom: 620 })).toBe(572 + SCROLL_CUE_ROW_GAP_PX);
  });

  test('holds the glyph clear of the closing line when the list runs up to it', () => {
    expect(scrollCueTop({ contentBottom: 1400, rowBottoms: [680], bandBottom: 687 })).toBe(
      687 - SCROLL_CUE_HEIGHT_PX,
    );
  });

  test('never places the arrow above the top of the frame', () => {
    expect(scrollCueTop({ contentBottom: 900, rowBottoms: [1], bandBottom: 10 })).toBe(0);
  });
});
