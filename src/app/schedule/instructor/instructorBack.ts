import { useCallback, useEffect, useRef } from 'react';

/**
 * What the phone's own back button does on the instructor screen.
 *
 * The screen is a single route that swaps its views in React state, so opening
 * a register leaves the browser with no entry of its own to go back to and a
 * back press walks out of the site entirely. While anything is open the screen
 * parks one spare history entry in front of the route and spends it here: a
 * press closes the layer nearest the instructor, and only a screen with nothing
 * open lets the press through to the browser.
 */

/**
 * Every layer a back press can close, nearest the instructor first — a sheet
 * standing over the register has to go before the register underneath it.
 */
export const INSTRUCTOR_BACK_LAYERS = [
  'logoutConfirm',
  'attendanceOverlay',
  'dashboard',
  'teacherPicker',
  'attendance',
] as const;

export type InstructorBackLayer = (typeof INSTRUCTOR_BACK_LAYERS)[number];

export type InstructorBackState = {
  /**
   * The tour is mandatory on a first sign-in, and it drives this screen itself
   * — it opens and closes a register between its own steps. So back neither
   * ends it nor reaches past it to the screen behind: it is held, not listed as
   * a layer, and the tour is left to its own controls.
   */
  tourOpen: boolean;
  open: Partial<Record<InstructorBackLayer, boolean>>;
};

export type InstructorBackAction =
  | { kind: 'hold' }
  | { kind: 'close'; layer: InstructorBackLayer }
  | { kind: 'leave' };

/** What one back press should do against the screen as it stands. */
export function resolveInstructorBack({
  tourOpen,
  open,
}: InstructorBackState): InstructorBackAction {
  if (tourOpen) return { kind: 'hold' };
  const layer = INSTRUCTOR_BACK_LAYERS.find((name) => open[name]);
  return layer ? { kind: 'close', layer } : { kind: 'leave' };
}

/** Whether the screen still has to keep its spare entry parked. */
export function instructorBackNeedsGuard(state: InstructorBackState): boolean {
  return resolveInstructorBack(state).kind !== 'leave';
}

/**
 * Park a history entry while any of `state`'s layers is open, and spend it on
 * closing the innermost one.
 *
 * `onClose` is handed the layer to close and is expected to close it through
 * that layer's own control, animation and all — the button on screen and the
 * button on the phone have to end up in the same place.
 */
export function useInstructorBack(
  state: InstructorBackState,
  onClose: (layer: InstructorBackLayer) => void,
): void {
  const latest = useRef({ state, onClose });
  // After every render, so a press is answered against the screen as it is at
  // that moment rather than as it was when the handler was subscribed.
  useEffect(() => {
    latest.current = { state, onClose };
  });

  const parkedRef = useRef(false);
  // Entries this screen handed back itself. Their popstate is not somebody
  // pressing anything, so it is swallowed rather than answered.
  const selfPopRef = useRef(0);

  const park = useCallback(() => {
    if (parkedRef.current) return;
    parkedRef.current = true;
    // Carrying the router's own state through: Next reloads the whole page when
    // it arrives at an entry whose state does not hold its internals, and the
    // parked entry stands in for this very route.
    window.history.pushState(window.history.state, '');
  }, []);

  const release = useCallback(() => {
    if (!parkedRef.current) return;
    parkedRef.current = false;
    selfPopRef.current += 1;
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (selfPopRef.current > 0) {
        selfPopRef.current -= 1;
        return;
      }
      // Nothing of this screen's stood in front of the route, so the press
      // belongs to the browser and it is already on its way out.
      if (!parkedRef.current) return;
      parkedRef.current = false;

      const action = resolveInstructorBack(latest.current.state);
      if (action.kind === 'leave') return;
      if (action.kind === 'close') latest.current.onClose(action.layer);

      // Park another for whatever is still open — including a layer that
      // declined to close because a transition was already running, which is
      // why this does not ask what is left first. The effect below hands the
      // entry back once the screen really is bare.
      park();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [park]);

  const needsGuard = instructorBackNeedsGuard(state);

  // Nothing is handed back on unmount: the screen only leaves by signing out,
  // which replaces whatever entry it is standing on anyway, and giving one back
  // mid-navigation would race the route it is leaving for.
  useEffect(() => {
    if (needsGuard) park();
    else release();
  }, [needsGuard, park, release]);
}
