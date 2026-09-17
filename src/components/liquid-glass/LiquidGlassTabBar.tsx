'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/components/ui/motion';
import LiquidGlass, { type LiquidGlassTone, type LiquidGlassVariant } from './LiquidGlass';
import styles from './LiquidGlassTabBar.module.css';

export interface LiquidGlassTab {
  href: string;
  label: string;
}

export interface LiquidGlassTabBarProps {
  tabs: readonly LiquidGlassTab[];
  /** href of the selected tab, if any. */
  activeHref?: string;
  ariaLabel: string;
  variant?: LiquidGlassVariant;
  tone?: LiquidGlassTone;
  /** Below this viewport width the bar becomes one capsule that opens into the list. */
  compactBelow?: number;
  className?: string;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function useCompact(breakpoint: number): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 0.02}px)`);
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [breakpoint]);
  return compact;
}

/**
 * A row of route tabs on one glass surface, with a lens that travels to the
 * selected one.
 *
 * The lens is measured, not guessed: its x and width come from the selected
 * link's box, so it fits any label in any language and direction. It moves with
 * a transform and a width transition — no layout work per frame, no JS loop.
 */
function Bar({ tabs, activeHref, ariaLabel, variant, tone, className }: LiquidGlassTabBarProps) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const lensRef = useRef<HTMLSpanElement | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [fits, setFits] = useState(true);
  const previous = useRef<string | undefined>(undefined);

  const place = useCallback(() => {
    const track = trackRef.current;
    const lens = lensRef.current;
    const link = activeHref ? links.current.get(activeHref) : undefined;
    if (!track || !lens) return;
    setFits(track.scrollWidth <= track.clientWidth + 1);
    if (!link) {
      lens.style.setProperty('--lens-w', '0px');
      return;
    }
    // Measured box to box, then taken back into the track's own scroll space:
    // the same sum holds in LTR and RTL, scrolled or not (in RTL the overflow
    // runs to negative x and scrollLeft goes negative with it).
    const trackBox = track.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    lens.style.setProperty('--lens-x', `${linkBox.left - trackBox.left - track.clientLeft + track.scrollLeft}px`);
    lens.style.setProperty('--lens-w', `${linkBox.width}px`);
  }, [activeHref]);

  useIsomorphicLayoutEffect(() => {
    place();
    if (!ready) {
      // First paint lands without travelling in from the corner.
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [place, ready]);

  useEffect(() => {
    if (previous.current !== undefined && previous.current !== activeHref && !prefersReducedMotion()) {
      setMoving(true);
      const id = window.setTimeout(() => setMoving(false), 540);
      // Keep the selected tab in view on a bar that scrolls.
      links.current.get(activeHref ?? '')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      previous.current = activeHref;
      return () => window.clearTimeout(id);
    }
    previous.current = activeHref;
    return undefined;
  }, [activeHref]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => place());
    observer.observe(track);
    // Webfonts change label widths after first paint.
    document.fonts?.ready.then(place).catch(() => undefined);
    return () => observer.disconnect();
  }, [place]);

  return (
    <LiquidGlass
      as="nav"
      aria-label={ariaLabel}
      size="lg"
      variant={variant}
      tone={tone}
      interactive
      className={`${styles.bar} ${className ?? ''}`}
      // The bar reacts to the pointer but is not itself a button.
      style={{ cursor: 'default' }}
      data-pressed="false"
    >
      <ul ref={trackRef} className={styles.track} role="tablist" data-fits={fits}>
        <span ref={lensRef} className={styles.lens} data-ready={ready} data-moving={moving} aria-hidden="true" />
        {tabs.map((tab) => {
          const selected = tab.href === activeHref;
          return (
            <li key={tab.href} role="presentation" className={styles.item}>
              <Link
                href={tab.href}
                role="tab"
                aria-selected={selected}
                className={styles.link}
                ref={(node) => {
                  if (node) links.current.set(tab.href, node);
                  else links.current.delete(tab.href);
                }}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </LiquidGlass>
  );
}

/**
 * The same navigation on a narrow screen: one capsule naming where you are.
 * Pressed, that very surface grows into the list — the menu visibly comes out
 * of the control that opened it, rather than a separate panel fading in.
 */
function Compact({ tabs, activeHref, ariaLabel, variant, tone, className }: LiquidGlassTabBarProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();
  const active = tabs.find((t) => t.href === activeHref);

  useEffect(() => {
    setOpen(false);
  }, [activeHref]);

  // The closed list is folded away visually; `inert` folds it away for the
  // keyboard and assistive tech too. Set as a property: React 18 does not know
  // the attribute.
  useEffect(() => {
    if (listRef.current) listRef.current.inert = !open;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`${styles.compact} ${className ?? ''}`}>
      <LiquidGlass
        as="nav"
        aria-label={ariaLabel}
        size="lg"
        variant={variant}
        tone={tone}
        interactive
        radius={24}
        className={styles.compactSurface}
        style={{ cursor: 'default' }}
        data-open={open}
        data-pressed="false"
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.compactTrigger}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{active?.label ?? ariaLabel}</span>
          <svg className={styles.chevron} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={styles.compactBody}>
          <ul id={listId} ref={listRef} className={styles.compactList}>
            {tabs.map((tab, index) => (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={styles.compactLink}
                  aria-current={tab.href === activeHref ? 'page' : undefined}
                  style={{ ['--i' as string]: index }}
                  tabIndex={open ? 0 : -1}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </LiquidGlass>
    </div>
  );
}

export default function LiquidGlassTabBar({ tone = 'auto', ...rest }: LiquidGlassTabBarProps) {
  const props = { ...rest, tone };
  const compact = useCompact(props.compactBelow ?? 640);
  return compact ? <Compact {...props} /> : <Bar {...props} />;
}
