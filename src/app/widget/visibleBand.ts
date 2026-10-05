/**
 * The slice of this frame the host says is on screen, in the frame's own
 * coordinates: `top`–`bottom` is what is clear of the host's header and its
 * floating buttons, `ceiling` and `edge` are where the screen itself begins and
 * ends, and `under` is how far below the edge the frame is still shown — the
 * strip behind a phone browser's floating bar.
 */
export type VisibleBand = { top: number; bottom: number; edge?: number; ceiling?: number; under?: number };

/** Less than this between the top of the screen and its end is not a screen a sheet can stand in. */
const LEAST_SCREEN = 160;

/**
 * The band with its lower edge moved to where the host says the screen ends
 * now, or null when there is nothing to change: no band, no number, the same
 * edge, or an edge that would leave no room at all. The room kept above the
 * edge for the host's floating buttons moves with it.
 *
 * This is the one thing taken while a band is held (page.tsx, bandFrozen). A
 * sheet is laid out for the screen it opened on, and a phone browser's bars
 * come back after that — with the keyboard, mostly — so the screen ends higher
 * than it did, and the foot of the sheet stood behind the bar.
 */
export function movedEdge(band: VisibleBand | null, edge: number): VisibleBand | null {
  if (!band || !Number.isFinite(edge)) return null;
  const was = band.edge ?? band.bottom;
  if (Math.abs(edge - was) < 1) return null;
  if (edge - (band.ceiling ?? band.top) < LEAST_SCREEN) return null;
  return { ...band, edge, bottom: Math.max(band.top, Math.min(edge, band.bottom + (edge - was))) };
}
