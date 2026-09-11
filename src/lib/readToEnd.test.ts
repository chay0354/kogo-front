/**
 * The "scroll to the end before you can accept" rule the widget's terms and
 * the tenant's contract share.
 */
import { describe, expect, it } from 'vitest';
import { READ_TO_END_SLACK_PX, readToEndState } from './readToEnd';

describe('readToEndState', () => {
  it('is not at the end at the top of a long text', () => {
    expect(readToEndState({ scrollHeight: 2000, scrollTop: 0, clientHeight: 300 })).toEqual({
      scrollable: true,
      atEnd: false,
    });
  });

  it('counts the last few pixels as the end, since a phone rarely lands on the last one', () => {
    const almost = 2000 - 300 - (READ_TO_END_SLACK_PX - 1);
    expect(readToEndState({ scrollHeight: 2000, scrollTop: almost, clientHeight: 300 }).atEnd).toBe(true);
    expect(readToEndState({ scrollHeight: 2000, scrollTop: almost - 1, clientHeight: 300 }).atEnd).toBe(false);
    expect(readToEndState({ scrollHeight: 2000, scrollTop: 1700, clientHeight: 300 }).atEnd).toBe(true);
  });

  it('reads a text that fits its box as read', () => {
    expect(readToEndState({ scrollHeight: 300, scrollTop: 0, clientHeight: 300 })).toEqual({
      scrollable: false,
      atEnd: true,
    });
    // A pixel of rounding is not something to scroll.
    expect(readToEndState({ scrollHeight: 301, scrollTop: 0, clientHeight: 300 }).scrollable).toBe(false);
  });
});
