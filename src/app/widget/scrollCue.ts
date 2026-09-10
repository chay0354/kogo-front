/**
 * Whether to point the reader further down the catalogue, and where to draw the
 * arrow when we do.
 *
 * The widget cannot answer this from its own scroll alone. Embedded, the frame
 * is a fixed 760px that is usually taller than the phone screen, so the visitor
 * sees a slice of it and the *host* page is what moves — the widget's own
 * scrollY never leaves 0. What the host does report, on every scroll, is the
 * band of this document that is actually on screen. The bottom of that band is
 * the line the reader perceives as "where the widget ends", and it is the only
 * honest place to hang the arrow.
 *
 * Kept apart from the component so the arithmetic can be tested on its own —
 * there is no DOM in this project's test environment.
 */

/** Less than this left to travel and the reader has arrived — the same slack the
    shortcut inside the terms document allows itself. */
export const SCROLL_CUE_SLACK_PX = 24;

/** How far above the band's bottom edge the arrow floats, so it sits on the
    closing line rather than under it. */
export const SCROLL_CUE_INSET_PX = 34;

export type ScrollCueView = {
  /** Where this document's content ends, in document coordinates. */
  contentHeight: number;
  /** How far this document has scrolled inside its frame. Often 0 when embedded. */
  scrollY: number;
  /** The last line the reader can see, above the room the host keeps for its
      floating buttons. */
  bandBottom: number;
  /** A course card or the registration drawer is up over the catalogue. */
  overlayOpen?: boolean;
  slack?: number;
};

export function showsScrollCue({
  contentHeight,
  scrollY,
  bandBottom,
  overlayOpen = false,
  slack = SCROLL_CUE_SLACK_PX,
}: ScrollCueView): boolean {
  // The reader is looking at a card, not at the list underneath it.
  if (overlayOpen) return false;

  // Before the host has answered with a band there is nothing to measure
  // against, and a guess would plant an arrow over content that fits.
  if (!Number.isFinite(bandBottom) || bandBottom <= 0) return false;
  if (!Number.isFinite(contentHeight)) return false;

  // A rubber-band swipe past the top reports a negative scroll on iOS, which
  // would otherwise manufacture content that is not there.
  const travelled = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;

  return contentHeight - travelled - bandBottom > slack;
}

/** The arrow's `top`, in the same fixed coordinates the band is reported in. */
export function scrollCueTop(bandBottom: number, inset: number = SCROLL_CUE_INSET_PX): number {
  if (!Number.isFinite(bandBottom)) return 0;
  return Math.max(0, bandBottom - inset);
}
