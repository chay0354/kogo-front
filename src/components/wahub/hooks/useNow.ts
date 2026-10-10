'use client';

import { useEffect, useState } from 'react';

/**
 * The time, re-read every so often, so "מחכה 4 דק׳" keeps counting without a
 * reload. Stands still while the browser tab is hidden and catches up on return.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);

  return now;
}
