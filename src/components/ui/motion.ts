'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The timing the office screens' overlays share, and the two ways of holding
 * one on screen long enough for its exit to play.
 *
 * An overlay that drops out of the DOM on the click it was dismissed with can
 * only ever blink out; the animation needs something still mounted to run on.
 * The widget worked this out first — mark the thing as closing, wait out the
 * animation, then let it go — and these are the same two moves for the office,
 * one for a dialog its caller unmounts and one for a dialog its caller keeps
 * mounted behind a flag.
 */

/** Keep in step with the closing animations in motion.module.css. */
export const DIALOG_EXIT_MS = 200;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * For a dialog whose caller renders it conditionally.
 *
 * Nothing below the caller can outlive `onClose`, so the exit has to play
 * before that call rather than after it. Reduced motion has no animation to
 * wait for and closes on the spot.
 */
export function useDialogExit(onClose: () => void, exitMs: number = DIALOG_EXIT_MS) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    // A second dismissal while the first is playing would queue a second
    // close, and the screen behind may well have moved on by then.
    if (timerRef.current) return;
    if (prefersReducedMotion()) {
      closeRef.current();
      return;
    }
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setClosing(false);
      closeRef.current();
    }, exitMs);
  }, [exitMs]);

  return { closing, requestClose };
}

/**
 * For a dialog its caller leaves mounted and drives with a flag.
 *
 * Holds the last rendered state on screen for the length of the exit, so the
 * flag going false starts the animation instead of ending the dialog.
 */
export function useExitTransition(open: boolean, exitMs: number = DIALOG_EXIT_MS) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    if (prefersReducedMotion()) {
      setClosing(false);
      setRendered(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      setClosing(false);
      setRendered(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [open, rendered, exitMs]);

  return { rendered, closing };
}
