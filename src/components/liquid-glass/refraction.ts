/**
 * The optics of the glass, kept free of the DOM so they can be tested.
 *
 * Liquid Glass is not a blurred panel: the background bends where the material
 * curves — at the rim — and passes almost straight through the flat middle. The
 * browser tool for that is an SVG feDisplacementMap, which needs an image
 * saying, per pixel, how far to pull the backdrop and in which direction. This
 * file computes that image for a rounded rectangle of any size.
 *
 * Encoding (what feDisplacementMap reads): R carries the horizontal pull and G
 * the vertical one, 128 meaning "leave it where it is". A pixel is pulled along
 * the inward normal of the nearest edge, so content near the rim is sampled
 * from further inside — the compression a convex bezel produces.
 */

/** Signed distance to a rounded rectangle centred in a w×h box. Negative inside. */
export function roundedRectSdf(px: number, py: number, w: number, h: number, r: number): number {
  const radius = Math.min(r, w / 2, h / 2);
  const qx = Math.abs(px - w / 2) - (w / 2 - radius);
  const qy = Math.abs(py - h / 2) - (h / 2 - radius);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * How hard the rim bends light at depth `d` px inside the edge, 0..1.
 * Strongest at the edge itself and gone by the end of the bezel: the profile of
 * a rounded lip, not a linear ramp — a ramp reads as a smear, this reads as a
 * curve.
 */
export function bezelProfile(d: number, bezel: number): number {
  if (bezel <= 0 || d >= bezel) return 0;
  const t = 1 - Math.max(d, 0) / bezel;
  return Math.pow(t, 2.2);
}

export type Displacement = { dx: number; dy: number };

/** The pull at one pixel, each axis in -1..1 (before the filter's `scale`). */
export function displacementAt(
  px: number,
  py: number,
  w: number,
  h: number,
  r: number,
  bezel: number,
): Displacement {
  const sdf = roundedRectSdf(px, py, w, h, r);
  if (sdf > 0) return { dx: 0, dy: 0 };
  const strength = bezelProfile(-sdf, bezel);
  if (strength === 0) return { dx: 0, dy: 0 };
  // Outward normal by central differences; the pull is its opposite.
  const e = 0.75;
  const nx = roundedRectSdf(px + e, py, w, h, r) - roundedRectSdf(px - e, py, w, h, r);
  const ny = roundedRectSdf(px, py + e, w, h, r) - roundedRectSdf(px, py - e, w, h, r);
  const len = Math.hypot(nx, ny) || 1;
  return { dx: (-nx / len) * strength, dy: (-ny / len) * strength };
}

/** RGBA bytes of the displacement map, row-major, for a w×h canvas. */
export function buildDisplacementPixels(w: number, h: number, r: number, bezel: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const { dx, dy } = displacementAt(x + 0.5, y + 0.5, w, h, r, bezel);
      const i = (y * w + x) * 4;
      out[i] = Math.round(128 + dx * 127);
      out[i + 1] = Math.round(128 + dy * 127);
      out[i + 2] = 128;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Thickness of the material. A larger surface is a thicker slab: a wider bezel,
 * a stronger bend, a little more scatter and a deeper shadow. A small control
 * stays thin and clear.
 */
export type GlassSize = 'sm' | 'md' | 'lg';

export const GLASS_OPTICS: Record<GlassSize, { bezel: number; scale: number; blur: number; dispersion: number }> = {
  sm: { bezel: 9, scale: 11, blur: 1.6, dispersion: 0 },
  md: { bezel: 14, scale: 20, blur: 2.4, dispersion: 0.018 },
  lg: { bezel: 20, scale: 30, blur: 3.2, dispersion: 0.025 },
};

/** `clear` keeps this fraction of the scatter: over imagery the picture is the point. */
export const CLEAR_BLUR_FACTOR = 0.3;

/** A map larger than this is more pixels than the effect is worth; the caller falls back to plain backdrop processing. */
export const MAX_MAP_PIXELS = 900_000;
