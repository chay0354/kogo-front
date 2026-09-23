'use client';

import { useEffect, useRef } from 'react';

/**
 * A wait that cannot outlive its deadline — even on a phone that went to sleep.
 *
 * Every request the form makes has a timeout, and it did not stop a parent from
 * watching a spinner for twenty minutes. A timeout is a timer, and a timer does
 * not run while the page is frozen: lock the screen, or switch to WhatsApp to
 * find an ID number, and the request can vanish with no event and the timer
 * never fire. Back on the page, nothing is left that could ever move it on.
 *
 * So the deadline is measured on the wall clock and checked twice over: every
 * second while the page runs, and the moment it is shown again. Whichever
 * notices first ends the wait.
 */

/** A registration request, allowing for the 30s client timeout and a slow server. */
export const REGISTER_CALL_BUDGET_MS = 35_000;
/** Added once per wait, for the round trips around the calls themselves. */
export const WAIT_SLACK_MS = 10_000;

/** How long registering `calls` lessons may take before the parent is told. */
export function registerDeadlineMs(calls: number): number {
  return Math.max(1, calls) * REGISTER_CALL_BUDGET_MS + WAIT_SLACK_MS;
}

export function isOverdue(startedAt: number, now: number, limitMs: number): boolean {
  return now - startedAt > limitMs;
}

/**
 * Calls `onExpire` once when `active` has been true for longer than `limitMs`.
 * A new wait — `active` going false and true again — starts a new clock.
 */
export function useWaitDeadline(active: boolean, limitMs: number, onExpire: () => void): void {
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!active) return undefined;
    const startedAt = Date.now();
    let fired = false;

    const check = () => {
      if (fired || !isOverdue(startedAt, Date.now(), limitMs)) return;
      fired = true;
      expireRef.current();
    };
    // Any change of visibility is a reason to look — including the page being
    // hidden, which is often the last moment it runs before the phone sleeps.
    // A spare check costs nothing; a missed one costs the parent the wait.
    const timer = window.setInterval(check, 1_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('focus', check);
    };
  }, [active, limitMs]);
}
