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
  /*
   * Two entrances that need no timer: the track fold in
   * `CourseList.module.css` and the widget's own arrival on `.filterStrip`.
   * Both are pure CSS, and nothing reads these numbers — but writing them here
   * is what puts them under the same test as everything else, so the rule that
   * a thing leaves faster than it arrives stays enforced rather than
   * remembered.
   */
  accordion: 300,
  accordionExit: 240,
  stripIn: 440,
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

/**
 * Whether the band the host reported must be held still while an overlay is
 * open.
 *
 * The host slides the frame on a phone so the slice the reader was looking
 * at stays put, and the band it sent a moment earlier stays true through the
 * stretch — so it is frozen. On a desktop the host does not slide: the frame
 * jumps to the top of the screen, and only the band it sends *after* that
 * says where the screen is. Holding the old one there framed the panel in
 * the top half and cut the drawer off at the same line. Same breakpoint as
 * the host's own rule.
 */
export function holdsBandWhileOpen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(min-width: 768px)').matches;
}
