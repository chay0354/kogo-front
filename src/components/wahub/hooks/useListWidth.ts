'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LIST_WIDTH_STORAGE_KEY, clampListWidth, readListWidth, writeListWidth } from '@/lib/wahub/listPane';

/** Read before the browser paints, so a list that was pulled wider does not jump; nothing to read on the server. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readStored(): number | null {
  try {
    return readListWidth(window.localStorage.getItem(LIST_WIDTH_STORAGE_KEY));
  } catch {
    // Storage is closed to the page (a private window, a policy): the handle works, it is only not remembered.
    return null;
  }
}

function store(width: number | null) {
  try {
    const raw = writeListWidth(width);
    if (raw === null) window.localStorage.removeItem(LIST_WIDTH_STORAGE_KEY);
    else window.localStorage.setItem(LIST_WIDTH_STORAGE_KEY, raw);
  } catch {
    /* not remembered — nothing else is lost */
  }
}

/**
 * How wide the conversations list was pulled — kept in the browser, so it stays between conversations and visits
 * (the owner, 15.10.2026). Null while it is as wide as the screen gives by itself, which is also the first draw
 * and what the server draws.
 */
export function useListWidth() {
  const [width, setWidth] = useState<number | null>(null);
  const widthRef = useRef(width);

  useBeforePaint(() => {
    const stored = readStored();
    widthRef.current = stored;
    setWidth(stored);
  }, []);

  const put = useCallback((next: number | null) => {
    if (next === widthRef.current) return;
    widthRef.current = next;
    setWidth(next);
    store(next);
  }, []);

  const resize = useCallback((next: number) => put(clampListWidth(next)), [put]);
  const reset = useCallback(() => put(null), [put]);

  return { width, resize, reset };
}
