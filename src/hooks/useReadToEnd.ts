'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readToEndState } from '@/lib/readToEnd';

/**
 * Watches a scroll box until its text has been scrolled to the end — the
 * widget's terms rule (readToEnd.ts). Once reached it stays reached, as the
 * widget's does, until `resetKey` changes: a new version of the text has to be
 * read again, from its top.
 *
 * The box is measured through a callback ref the moment it mounts, and watched
 * afterwards, because its real height lands only once the fonts have settled.
 */
export function useReadToEnd(resetKey: unknown) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [canJump, setCanJump] = useState(false);

  const measure = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const { scrollable, atEnd } = readToEndState(el);
    if (atEnd) setReachedEnd(true);
    setCanJump(scrollable && !atEnd);
  }, []);

  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      boxRef.current = el;
      if (!el) return;
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => measure());
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
      observerRef.current = observer;
    },
    [measure],
  );

  useEffect(() => {
    setReachedEnd(false);
    // A new text starts from its top; a short one is read the moment it is measured.
    if (boxRef.current) boxRef.current.scrollTop = 0;
    measure();
  }, [resetKey, measure]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  /** A long text on a phone is a lot of thumb work — the shortcut the widget offers too. */
  const jumpToEnd = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  return { attach, onScroll: measure, reachedEnd, canJump, jumpToEnd };
}
