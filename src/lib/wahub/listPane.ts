/**
 * The conversations list beside a conversation on a desktop: its width can be pulled with the mouse (the owner,
 * 15.10.2026), as the contact's card's can (lib/wahub/cardPane.ts). Everything the screen decides about it is
 * here, and nothing here touches the browser: the limits, what a pull or a key gives, and how the width is kept
 * between visits. A tablet and a phone read none of it.
 */
import { THREAD_MIN_WIDTH } from './cardPane';

/** The list is never narrower or wider than this, however it is pulled. */
export const LIST_MIN_WIDTH = 260;
export const LIST_MAX_WIDTH = 520;
/** One press of an arrow key on the handle. */
export const LIST_KEY_STEP = 16;

/** Where the width is kept in the browser. */
export const LIST_WIDTH_STORAGE_KEY = 'kogo.wahub.listWidth';

export function clampListWidth(width: number, max: number = LIST_MAX_WIDTH): number {
  const top = Math.max(LIST_MIN_WIDTH, Math.min(LIST_MAX_WIDTH, max));
  if (!Number.isFinite(width)) return LIST_MIN_WIDTH;
  return Math.round(Math.max(LIST_MIN_WIDTH, Math.min(top, width)));
}

/**
 * How wide the list may be in a frame of this width, beside a card of this width (0 when the card is not open):
 * up to 520, but never so wide that the conversation drops under its own minimum — and never under the list's own.
 */
export function listMaxWidth(frameWidth: number | null, cardWidth: number): number {
  if (frameWidth === null) return LIST_MAX_WIDTH;
  return Math.max(LIST_MIN_WIDTH, Math.min(LIST_MAX_WIDTH, Math.floor(frameWidth - cardWidth - THREAD_MIN_WIDTH)));
}

/** The width the list is drawn at: the one it was pulled to, or the screen's own, inside what this frame allows. */
export function listWidth(pulled: number | null, defaultWidth: number, max: number = LIST_MAX_WIDTH): number {
  return clampListWidth(pulled ?? defaultWidth, max);
}

/**
 * The width a pull gives: the width the list had when the handle was taken, changed by as far as the pointer has
 * moved since — so taking the handle moves nothing by itself. The handle stands on the list's edge that faces the
 * conversation. On this page (right to left) the list is on the right, so a pull to the left makes it wider.
 */
export function listWidthFromPull(
  startWidth: number,
  startX: number,
  pointerX: number,
  listOnRight = true,
  max: number = LIST_MAX_WIDTH,
): number {
  const moved = pointerX - startX;
  return clampListWidth(startWidth + (listOnRight ? -moved : moved), max);
}

/**
 * The width a key on the handle gives, or null for a key that is not the handle's. The arrows move the handle the
 * way they point: with the list on the right, the left arrow pulls it wider. Home and End go to the two limits;
 * Enter is the keyboard's double click — back to the screen's own width.
 */
export function listWidthFromKey(
  key: string,
  current: number,
  listOnRight = true,
  max: number = LIST_MAX_WIDTH,
): number | 'default' | null {
  const wider = listOnRight ? 'ArrowLeft' : 'ArrowRight';
  const narrower = listOnRight ? 'ArrowRight' : 'ArrowLeft';
  if (key === wider) return clampListWidth(current + LIST_KEY_STEP, max);
  if (key === narrower) return clampListWidth(current - LIST_KEY_STEP, max);
  if (key === 'Home') return LIST_MIN_WIDTH;
  if (key === 'End') return clampListWidth(LIST_MAX_WIDTH, max);
  if (key === 'Enter') return 'default';
  return null;
}

/** What the browser kept, read leniently: anything that is not a width is "as the screen gives". */
export function readListWidth(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? clampListWidth(value) : null;
}

export function writeListWidth(width: number | null): string | null {
  return width === null ? null : String(clampListWidth(width));
}
