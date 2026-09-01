/**
 * The two questions the office shell asks about its menu: how wide it should be
 * right now, and what the reader last asked for.
 *
 * Both are kept out of the component so they can be checked without a DOM —
 * the shape the rest of the office's tests are written in.
 */

const SIDEBAR_STORAGE_KEY = 'kogo-sidebar-open';

/**
 * `expanded` is the full menu holding a column of the desk to itself, `rail` the
 * same menu narrowed to its icons, `drawer` the full menu lying over a phone,
 * and `hidden` that drawer parked off the edge.
 *
 * A phone has no room for a rail, so the narrow state only exists on a desktop;
 * a desktop never parks the menu off screen, so there is always a way back.
 * Which of the two open states it is decides what the button offers to do next
 * — narrow the menu, or get it out of the way.
 */
export type SidebarMode = 'expanded' | 'rail' | 'drawer' | 'hidden';

export const SIDEBAR_WIDTH = { full: 'w-64', rail: 'w-16' } as const;

export function resolveSidebarMode(isDesktop: boolean, open: boolean): SidebarMode {
  if (open) return isDesktop ? 'expanded' : 'drawer';
  return isDesktop ? 'rail' : 'hidden';
}

/**
 * The margin that keeps a page clear of the menu, in the same logical direction
 * the menu is pinned to — the right of a Hebrew screen, the left of a
 * left-to-right one. A phone's drawer floats over the page and claims none.
 */
export function resolveContentOffset(mode: SidebarMode): string {
  if (mode === 'expanded') return 'lg:ms-64';
  if (mode === 'rail') return 'lg:ms-16';
  return '';
}

/**
 * A browser is allowed to refuse storage, and a locked-down one throws on the
 * property access itself rather than handing back null. Read bare, that would
 * take down the whole office shell on a screen that only wanted to remember a
 * menu width, so both directions swallow the refusal: the reader still gets a
 * working menu, only the memory of the choice is lost.
 */
export function readSidebarPreference(fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

export function writeSidebarPreference(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch {
    // Nothing to recover: the menu is already in the state that was asked for.
  }
}
