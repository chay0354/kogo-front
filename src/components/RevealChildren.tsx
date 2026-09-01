'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Reveal.module.css';

interface Props {
  children: ReactNode;
  /** Re-arm when this changes (e.g. the active tab). */
  resetKey?: string;
  /**
   * How far below the wrapper the elements that each get their own entrance
   * sit. A dashboard section puts its cards two and three levels down, because
   * the section component brings a container of its own; a page's blocks sit
   * one level down, with the cards of a grid one below that.
   */
  depths?: number[];
}

/**
 * Gives every card in a section its own entrance as it scrolls into view.
 *
 * Adds a class to elements that are already there rather than wrapping them,
 * so each section keeps its own DOM and grid layout untouched.
 *
 * A section renders a loading card first and swaps in its real content once the
 * query resolves, so a single pass at mount would only ever see the placeholder.
 * A MutationObserver therefore keeps arming cards as they appear, and stops once
 * the subtree settles.
 */
export default function RevealChildren({ children, resetKey, depths = [2, 3] }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const depthKey = depths.join(',');

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const supported = typeof IntersectionObserver !== 'undefined';

    const selector = depthKey
      .split(',')
      .map((depth) => `:scope${' > *'.repeat(Number(depth))}`)
      .join(', ');

    const collect = () =>
      Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
        if (el.dataset.revealArmed === '1') return false;
        // A page may hold a reveal of its own — the dashboard keys one on the
        // open tab so switching replays the motion. Leave that subtree to it,
        // or the two would arm the same cards and fight over the stagger.
        if (el.closest('[data-reveal-root]') !== root) return false;
        const r = el.getBoundingClientRect();
        if (r.height <= 24 || el.offsetParent === null) return false;
        // A lifted element establishes a containing block, which drags a
        // sticky bar out of its scroll parent and pins a fixed one to the
        // wrapper instead of the viewport.
        const position = getComputedStyle(el).position;
        return position !== 'fixed' && position !== 'sticky';
      });

    const showNow = (el: HTMLElement) => {
      el.dataset.revealArmed = '1';
      el.classList.add(styles.shown);
    };

    if (reduced || !supported) {
      collect().forEach(showNow);
      return;
    }

    let burst = 0;
    let burstTimer: ReturnType<typeof setTimeout> | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          el.style.transitionDelay = `${Math.min(burst, 4) * 60}ms`;
          burst += 1;
          el.classList.add(styles.shown);
          io.unobserve(el);
        });
        // Reset the stagger between bursts so a long scroll never accumulates delay.
        if (burstTimer) clearTimeout(burstTimer);
        burstTimer = setTimeout(() => {
          burst = 0;
        }, 220);
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.04 },
    );

    // The failsafe is re-armed on every batch. A single timer set at mount
    // would already have fired by the time late content is armed, leaving it
    // invisible — which is the one outcome that must never happen.
    let failsafe: ReturnType<typeof setTimeout> | null = null;
    const armFailsafe = () => {
      if (failsafe) clearTimeout(failsafe);
      failsafe = setTimeout(() => {
        root
          .querySelectorAll<HTMLElement>(`.${styles.reveal}`)
          .forEach((el) => el.classList.add(styles.shown));
      }, 2500);
    };

    const arm = () => {
      const found = collect();
      if (!found.length) return;
      found.forEach((el) => {
        el.dataset.revealArmed = '1';
        el.classList.add(styles.reveal);
        io.observe(el);
      });
      armFailsafe();
    };

    arm();

    // Content arrives after the query resolves, so keep arming what appears.
    const mo = new MutationObserver(() => arm());
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      if (burstTimer) clearTimeout(burstTimer);
      if (failsafe) clearTimeout(failsafe);
      root.querySelectorAll<HTMLElement>(`.${styles.reveal}`).forEach((el) => {
        el.classList.remove(styles.reveal);
        el.style.transitionDelay = '';
        delete el.dataset.revealArmed;
      });
    };
  }, [resetKey, depthKey]);

  return (
    <div ref={ref} data-reveal-root>
      {children}
    </div>
  );
}
