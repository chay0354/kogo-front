'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The width an element actually has. The conversations screen lays itself out
 * by the room it was given rather than by the window: with the side menu open
 * the same window leaves it 250 pixels less.
 */
export function useElementWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((element: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element) return;
    // A hidden element measures zero. That is not a width to lay out by: the
    // last real one is kept, so a tab that is out of view does not rearrange itself.
    const take = (value: number) => {
      if (value > 0) setWidth(value);
    };
    take(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const next = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) take(entry.contentRect.width);
    });
    next.observe(element);
    observer.current = next;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return { ref, width };
}
