'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Reveal.module.css';

interface Props {
  children: ReactNode;
  /** Stagger in ms, so a row of cards arrives one after the other. */
  delay?: number;
  /** Render as a grid/flex child without adding a wrapper box. */
  className?: string;
}

/**
 * Fades and lifts its children into place the first time they scroll into
 * view, and immediately on first paint for whatever is already on screen.
 *
 * Uses IntersectionObserver rather than a scroll listener so the work happens
 * off the main thread — the dashboard renders long lists on phones.
 *
 * Honours prefers-reduced-motion by showing the content with no animation at
 * all, and falls back to visible if IntersectionObserver is unavailable, so
 * content is never trapped invisible.
 */
export default function Reveal({ children, delay = 0, className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        });
      },
      // Start a little before the element reaches the viewport so the motion
      // finishes as it arrives rather than after.
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${shown ? styles.shown : ''} ${className ?? ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
