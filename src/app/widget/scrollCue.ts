/**
 * Whether to point the reader further down the catalogue, and where to draw the
 * arrow when we do.
 *
 * The widget cannot answer this from its own scroll alone. Embedded, the frame
 * is a fixed 900px that is taller than a phone screen, so the visitor sees a
 * slice of it and the *host* page is what moves — the widget's own scroll never
 * leaves 0. What the host does report, on every scroll, is the band of this
 * document that is on screen, in this document's own fixed coordinates. Every
 * number here lives in those coordinates, which is why the page's own scroll
 * position never appears: an element's viewport rect has already accounted for
 * it, and so has the band.
 *
 * Kept apart from the component so the arithmetic can be tested on its own —
 * there is no DOM in this project's test environment.
 */

/** Less than this left to travel and the reader has arrived — the same slack the
    shortcut inside the terms document allows itself. */
export const SCROLL_CUE_SLACK_PX = 24;

/** The glyph's own height. The arrow is held back by this much so it never
    reaches past the closing line and off the reader's screen. */
export const SCROLL_CUE_HEIGHT_PX = 22;

/** How far under the last readable lesson the arrow hangs. */
export const SCROLL_CUE_ROW_GAP_PX = 10;

export type ScrollCueView = {
  /** Where the widget's content ends, in this document's viewport coordinates. */
  contentBottom: number;
  /**
   * The bottom edge of every lesson row on show, same coordinates. Rows inside a
   * shut track are not on show and do not belong here.
   */
  rowBottoms: readonly number[];
  /** The last line the reader can see, above the room the host keeps for its
      floating buttons. */
  bandBottom: number;
  /** A course card or the registration drawer is up over the catalogue. */
  overlayOpen?: boolean;
  slack?: number;
};

/**
 * The arrow's `top`, or `null` when it has nothing to say.
 *
 * It hangs off the last lesson the reader can actually finish reading rather
 * than off the closing line itself. The two are the same thing while the list
 * runs right up to the edge, but they come apart once the frame's own bottom
 * comes into view: the line keeps travelling down and the lessons do not, and an
 * arrow that followed the line would drift into the empty space under the list
 * — pointing at nothing, in the one place a reader most needs it to mean
 * something.
 */
export function scrollCueTop({
  contentBottom,
  rowBottoms,
  bandBottom,
  overlayOpen = false,
  slack = SCROLL_CUE_SLACK_PX,
}: ScrollCueView): number | null {
  // The reader is looking at a card, not at the list underneath it.
  if (overlayOpen) return null;

  // Before the host has answered with a band there is nothing to measure
  // against, and a guess would plant an arrow over content that fits.
  if (!Number.isFinite(bandBottom) || bandBottom <= 0) return null;
  if (!Number.isFinite(contentBottom)) return null;

  // Everything left to read is already on screen.
  if (contentBottom - bandBottom <= slack) return null;

  // Nothing to point past yet. At the top of a long page the filter strip fills
  // the band on its own and the first lesson is still below it — saying "there
  // is more" there tells the reader something they cannot act on.
  const readable = rowBottoms.filter((bottom) => Number.isFinite(bottom) && bottom <= bandBottom);
  if (readable.length === 0) return null;

  const lastReadable = Math.max(...readable);
  // The row is the anchor; the band only stops the glyph from running off the
  // bottom of what the reader can see.
  return Math.max(
    0,
    Math.min(lastReadable + SCROLL_CUE_ROW_GAP_PX, bandBottom - SCROLL_CUE_HEIGHT_PX),
  );
}
