import type { WahubTab } from '@/types/wahub';

/**
 * The small decisions behind the section's motion and its scrolling, kept apart
 * from the screen so they can be checked without a browser. The moves
 * themselves are in src/components/wahub/motion.module.css.
 */

/** Which way a screen comes in. "forward" is deeper, or a later tab; "back" is the way home. */
export type NavDirection = 'forward' | 'back';

/** The section's tabs, in the order they stand on screen. */
export const TAB_ORDER: ReadonlyArray<WahubTab> = ['chats', 'today', 'leads', 'bot', 'settings'];

/** From one tab to another: a later tab comes in "forward", an earlier one "back". */
export function tabDirection(from: WahubTab, to: WahubTab): NavDirection {
  return TAB_ORDER.indexOf(to) >= TAB_ORDER.indexOf(from) ? 'forward' : 'back';
}

/**
 * How deep a phone is in the conversations: the list (0), a conversation (1),
 * its details (2). A phone shows one of the three, and goes between them like pages.
 */
export function paneDepth(contactId: number | null, detailsOpen: boolean): 0 | 1 | 2 {
  if (contactId == null) return 0;
  return detailsOpen ? 2 : 1;
}

/** Deeper is "forward"; the way back is "back"; staying at the same depth keeps the direction it had. */
export function paneDirection(from: number, to: number, current: NavDirection): NavDirection {
  if (to > from) return 'forward';
  if (to < from) return 'back';
  return current;
}

/** How long a number takes to count up to itself, in milliseconds. */
export const COUNT_UP_MS = 520;

/** Quick at first, settling at the end — the curve the section's entrances share. */
export function easeOut(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - (1 - t) ** 3;
}

/**
 * The whole number shown part of the way from one figure to another. It never
 * overshoots, and it lands exactly on the target.
 */
export function countUpValue(from: number, to: number, progress: number): number {
  if (progress >= 1) return to;
  if (progress <= 0) return from;
  return Math.round(from + (to - from) * easeOut(progress));
}

/** A keyboard takes at least this much of a phone's screen; less is the browser's own bars moving. */
export const KEYBOARD_MIN_PX = 120;

export interface ViewportReading {
  /** The window's height (the layout viewport): what `100dvh` measures. */
  innerHeight: number;
  /** What is actually visible above the keyboard (the visual viewport). */
  height: number;
  /** How far the visible part was moved down the page to show a field. */
  offsetTop: number;
  /** Above 1 the user pinched in: the visible part is smaller for that reason, not for a keyboard. */
  scale: number;
}

export interface KeyboardBox {
  height: number;
  offsetTop: number;
}

/**
 * The room a phone's screen has left while its keyboard is open — or null when
 * no keyboard is. A conversation is then drawn into exactly that room, so the
 * writing box stands on the keyboard and the title row stays in view.
 */
export function keyboardBox(reading: ViewportReading): KeyboardBox | null {
  if (!(reading.height > 0) || !(reading.innerHeight > 0)) return null;
  if (reading.scale > 1.01) return null;
  if (reading.innerHeight - reading.height < KEYBOARD_MIN_PX) return null;
  return { height: Math.round(reading.height), offsetTop: Math.max(0, Math.round(reading.offsetTop)) };
}

/** A wheel's turn, in pixels, whatever unit the device reported it in. */
export function wheelPixels(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * pageHeight;
  return deltaY;
}

/** A finger has to travel this far before a press on a floating button counts as a scroll instead. */
export const DRAG_SLOP_PX = 6;
