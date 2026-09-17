/**
 * What is the glass sitting on — bright content or dark?
 *
 * CSS cannot read the pixels behind an element, so the answer comes from the
 * DOM: at a few points under the surface, find the first thing beneath it that
 * actually paints a background and take its luminance. It is a read of computed
 * styles, not of pixels — cheap enough to run when scrolling settles, and right
 * for what matters here: a bar drifting from white cards onto a dark panel.
 */

export type Tone = 'light' | 'dark';

/** "rgb(15, 23, 42)" / "rgba(15 23 42 / 0.5)" → [r, g, b, a], or null. */
export function parseColor(value: string): [number, number, number, number] | null {
  const m = value.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  const alpha = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
  return [parts[0], parts[1], parts[2], alpha];
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Light glass until the content underneath is clearly dark, and back only once
 * it is clearly bright: two thresholds, so a bar resting on the boundary does
 * not flicker between inks.
 */
export function toneFor(samples: number[], current: Tone): Tone {
  if (!samples.length) return current;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (current === 'light') return mean < 0.22 ? 'dark' : 'light';
  return mean > 0.36 ? 'light' : 'dark';
}

/** Luminance of whatever paints behind `el` at a viewport point, or null if nothing does. */
export function luminanceBehind(el: Element, x: number, y: number): number | null {
  if (typeof document === 'undefined') return null;
  // Topmost first. The glass and what is inside it are skipped; the first thing
  // after that which paints — a card under the bar, or an ancestor's own
  // background — is what the glass is sitting on.
  for (const node of document.elementsFromPoint(x, y)) {
    if (node === el || el.contains(node)) continue;
    const colour = paints(node);
    if (colour) return luminance(colour[0], colour[1], colour[2]);
  }
  return null;
}

function paints(node: Element): [number, number, number, number] | null {
  const style = getComputedStyle(node);
  const colour = parseColor(style.backgroundColor);
  if (colour && colour[3] > 0.5) return colour;
  // A gradient or image says "something is painted here" without a colour to
  // read; take the text colour's opposite as the hint — dark panels carry light ink.
  if (style.backgroundImage && style.backgroundImage !== 'none') {
    const ink = parseColor(style.color);
    if (ink) {
      const l = luminance(ink[0], ink[1], ink[2]);
      return l > 0.5 ? [20, 24, 38, 1] : [250, 250, 250, 1];
    }
  }
  return null;
}
