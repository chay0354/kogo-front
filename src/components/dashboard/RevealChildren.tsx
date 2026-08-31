'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Reveal.module.css';

interface Props {
  children: ReactNode;
  /** Re-run when this changes (e.g. the active tab). */
  resetKey?: string;
}

/**
 * Gives every card in a section its own entrance as it scrolls into view.
 *
 * Works by adding a class to elements that are already there rather than
 * wrapping them, so the five pre-existing section components keep their exact
 * DOM and their grid layouts are untouched — nothing about their markup had to
 * change for this.
 *
 * Elements are revealed in document order with a small stagger, capped so a
 * long list never ends up waiting seconds for the last row.
 */
export default function RevealChildren({ children, resetKey }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Section children, plus one level into grid/flex wrappers so individual
    // cards animate rather than the whole row at once.
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(':scope > * > *, :scope > * > * > *'),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      // skip inline bits and zero-size nodes; only animate real blocks
      return r.height > 24 && el.offsetParent !== null;
    });

    if (!targets.length) return;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add(styles.shown));
      return;
    }

    targets.forEach((el) => {
      el.classList.add(styles.reveal);
    });

    let revealed = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          // stagger within a burst, but never more than ~240ms of waiting
          el.style.transitionDelay = `${Math.min(revealed, 4) * 60}ms`;
          revealed += 1;
          el.classList.add(styles.shown);
          observer.unobserve(el);
        });
        // reset the burst counter once this batch is done
        revealed = 0;
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.04 },
    );

    targets.forEach((el) => observer.observe(el));

    // Safety net: if anything is still hidden shortly after mount (an observer
    // that never fired, a hidden-then-shown container), show it. Content must
    // never be left invisible.
    const failsafe = setTimeout(() => {
      targets.forEach((el) => el.classList.add(styles.shown));
    }, 2500);

    return () => {
      observer.disconnect();
      clearTimeout(failsafe);
      targets.forEach((el) => {
        el.classList.remove(styles.reveal);
        el.style.transitionDelay = '';
      });
    };
  }, [resetKey]);

  return <div ref={ref}>{children}</div>;
}
