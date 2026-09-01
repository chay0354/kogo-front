/**
 * Exit durations for the widget's overlays, in step with the closing animations
 * in `page.module.css` and `CourseExpandedDetail/CourseExpandedDetail.module.css`.
 * An overlay leaves the DOM when its timer fires, so a value shorter than the CSS
 * cuts the animation off and a longer one leaves the overlay sitting there.
 *
 * Each one is shorter than its own entrance: a parent enrolling three children
 * passes through here many times, and something that leaves as slowly as it
 * arrived reads as the screen holding them up.
 */
export const WIDGET_MOTION_MS = {
  detailExit: 260,
  drawerExit: 240,
  noticeExit: 200,
} as const;

/**
 * Whether this reader asked the system for less motion. The CSS already gives
 * them the immediate swap, so the timers have nothing to wait for and the state
 * is dropped on the click instead.
 *
 * Guarded for the server render, where there is no window to ask.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
