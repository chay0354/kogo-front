/**
 * "Read to the end": a text in a scroll box that has to be scrolled to its end
 * before the box's checkbox or button unlocks. The widget's registration terms
 * and the tenant's rental contract share the rule, so it lives here once, pure,
 * and readToEnd.test.ts pins the arithmetic down.
 */

/** How close to the end counts as the end: a phone's scroll rarely lands on the last pixel. */
export const READ_TO_END_SLACK_PX = 24;

/** What a scroll box reports about itself — an HTMLElement fits as it is. */
export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export interface ReadToEndState {
  /** The text is taller than its box, so there is something to scroll. */
  scrollable: boolean;
  /** At the end, within the slack — or nothing to scroll, so read as it stands. */
  atEnd: boolean;
}

export function readToEndState({ scrollHeight, scrollTop, clientHeight }: ScrollMetrics): ReadToEndState {
  return {
    scrollable: scrollHeight > clientHeight + 1,
    atEnd: scrollHeight - scrollTop - clientHeight < READ_TO_END_SLACK_PX,
  };
}
