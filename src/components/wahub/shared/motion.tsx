'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Check } from 'lucide-react';
import { COUNT_UP_MS, countUpValue, DRAG_SLOP_PX, keyboardBox, wheelPixels } from '@/lib/wahub/motion';
import m from '../motion.module.css';
import { cx } from './tones';

/**
 * The pieces of the section's motion that need more than a class name
 * (src/components/wahub/motion.module.css holds the moves themselves): the
 * three dots of "thinking", a section that opens and closes, a number that
 * counts up, a tick — and two small helpers for scrolling: a floating button
 * that lets a scroll through, and a conversation that keeps clear of a phone's keyboard.
 */

/** Settled before the browser paints; where there is no browser there is nothing to settle. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The device asks for less motion: nothing counts, slides or pops. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * "חושב…" — three dots that breathe, as in WhatsApp. Everywhere the section
 * waits for the bot: a demo conversation, "ענה עכשיו", "נסה שאלה", the small
 * chat of "דיוק" and its summary. The dots take the colour of the text around them.
 */
export function ThinkingDots({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cx(m.thinking, className)} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** How long a closed section stays in the page, so its closing can be seen (a little over the move itself). */
const FOLD_CLOSE_MS = 260;

/**
 * A section that opens and closes by growing — nothing under it jumps. What is
 * inside is in the page only while it is open (and for the moment it takes to
 * close), exactly as before: a folded section costs nothing and says nothing.
 */
export function Fold({
  open,
  id,
  className,
  innerClassName,
  children,
}: {
  open: boolean;
  /** The id the button that opens it names (aria-controls). */
  id?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  // In the page at all; grown to its height; done growing.
  const [present, setPresent] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const [settled, setSettled] = useState(open);
  const box = useRef<HTMLDivElement | null>(null);

  // Opened: into the page in this very draw, still at no height.
  if (open && !present) setPresent(true);

  useBeforePaint(() => {
    if (open) {
      // The browser has to have seen it closed for the opening to be a move.
      void box.current?.offsetHeight;
      setExpanded(true);
      // Should the move's own end never be told (it was cut short), the content is freed anyway.
      const free = window.setTimeout(() => setSettled(true), FOLD_CLOSE_MS + 80);
      return () => window.clearTimeout(free);
    }
    setExpanded(false);
    setSettled(false);
    const leave = window.setTimeout(() => setPresent(false), prefersReducedMotion() ? 0 : FOLD_CLOSE_MS);
    return () => window.clearTimeout(leave);
  }, [open]);

  if (!present) return null;
  return (
    <div
      ref={box}
      id={id}
      className={cx(m.fold, className)}
      data-open={expanded ? '' : undefined}
      data-settled={expanded && settled ? '' : undefined}
      onTransitionEnd={(event) => {
        if (event.target === box.current && expanded) setSettled(true);
      }}
    >
      <div className={cx(m.foldInner, innerClassName)}>{children}</div>
    </div>
  );
}

/** The figures that have already counted up on this visit to the page, by the name they were given. */
const COUNTED = new Set<string>();

/**
 * A figure that counts up to itself the first time it is shown ("היום"): from
 * nought, in about half a second. A later change simply shows the new figure —
 * and with a name (`once`), so does coming back to the screen: the count is for
 * the first sight of the day's numbers, not for every return to them.
 * Drawn at its real value where nothing can move it — on the server, and where
 * the device asks for less motion.
 */
export function CountUp({ value, once, className }: { value: number; once?: string; className?: string }) {
  const [shown, setShown] = useState(value);
  const counted = useRef(false);

  useBeforePaint(() => {
    const seen = counted.current || (once !== undefined && COUNTED.has(once));
    if (seen || value <= 0 || prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      counted.current = true;
      setShown(value);
      return;
    }
    setShown(0);
    let frame = 0;
    let done = false;
    const started = performance.now();
    const step = (now: number) => {
      const progress = (now - started) / COUNT_UP_MS;
      setShown(countUpValue(0, value, progress));
      if (progress < 1) frame = requestAnimationFrame(step);
      else {
        done = true;
        counted.current = true;
        if (once !== undefined) COUNTED.add(once);
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      // Cut short (the figure changed under it): the next one lands at once.
      if (!done) setShown(value);
    };
  }, [value, once]);

  return <span className={className}>{shown.toLocaleString('he-IL')}</span>;
}

/** How long a list keeps the class that brings its rows in: the eight steps and the move itself, and a little over. */
const STAGGER_MS = 700;

/**
 * The class that brings a list in a row at a time (motion.module.css,
 * .stagger) — held only for the list's first moment on screen. A list that is
 * live is put back in order as messages arrive, and a row that is moved would
 * otherwise play its entrance again each time.
 *
 * `ready` is whether the list itself is drawn (not its loading shape): the
 * moment it turns true is the moment the rows come in.
 */
export function useStagger(ready = true): string | undefined {
  const [state, setState] = useState({ ready, on: ready });
  // In the same draw the list appears in — a draw later the rows would already be on screen.
  if (state.ready !== ready) setState({ ready, on: ready });

  useEffect(() => {
    if (!state.on) return;
    const timer = window.setTimeout(() => setState((current) => ({ ...current, on: false })), STAGGER_MS);
    return () => window.clearTimeout(timer);
  }, [state.on, state.ready]);

  return state.on ? m.stagger : undefined;
}

/**
 * Which way a row of tabs was moved along: to a later one ("forward") or an
 * earlier one ("back"). Decided in the same draw the tab changes in, so the
 * part that comes in already knows its side. Returns the class of the move —
 * held only for the move itself, so that showing the whole tab again later
 * (which starts every animation inside it) does not slide this part twice.
 */
export function useSlideClass(index: number): string | undefined {
  const [state, setState] = useState<{ index: number; forward: boolean; on: boolean }>({ index, forward: true, on: false });
  if (state.index !== index) setState({ index, forward: index > state.index, on: true });

  useEffect(() => {
    if (!state.on) return;
    const timer = window.setTimeout(() => setState((current) => ({ ...current, on: false })), 400);
    return () => window.clearTimeout(timer);
  }, [state.on, state.index]);

  if (!state.on) return undefined;
  return state.forward ? m.forward : m.back;
}

/** ✓ — it pops in where an icon stood: a copy that worked, something that was saved. */
export function Tick({ className }: { className?: string }) {
  return <Check className={cx(m.tick, className)} aria-hidden="true" />;
}

/**
 * Something that lies over the page for as long as `open` is true, and for a
 * moment after — long enough for its leaving to be seen. `closing` is true
 * during that moment.
 */
export function useLeaving(open: boolean, ms = 180): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [open, ms]);

  return { mounted: open || mounted, closing: !open && mounted };
}

/** The first thing under a point that can scroll up and down by itself — never the page, which scrolls anyway. */
function scrollerUnder(skip: HTMLElement, x: number, y: number): HTMLElement | null {
  for (const node of document.elementsFromPoint(x, y)) {
    if (skip.contains(node)) continue;
    for (let element: Element | null = node; element && element !== document.body; element = element.parentElement) {
      if (!(element instanceof HTMLElement)) continue;
      const overflow = getComputedStyle(element).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight + 1) return element;
    }
    return null;
  }
  return null;
}

/**
 * A button that floats over the page takes the wheel and the finger that land
 * on it — and a list under it then does not move. This hands them on: a wheel
 * over the button, or a finger that starts on it and drags, scrolls the list
 * underneath; a plain press still presses.
 */
export function useScrollThrough<T extends HTMLElement>(): (element: T | null) => void {
  const detach = useRef<(() => void) | null>(null);

  // A callback ref: the button comes and goes (it is only there while something waits), and each time it
  // comes its listeners are put on it.
  return useCallback((element: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const target = scrollerUnder(element, event.clientX, event.clientY);
      if (!target) return;
      target.scrollTop += wheelPixels(event.deltaY, event.deltaMode, target.clientHeight);
      // The list took it; the page, where it scrolls as well, does not take it too.
      if (event.cancelable) event.preventDefault();
    };

    let target: HTMLElement | null = null;
    let lastY = 0;
    let dragged = false;
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      dragged = false;
      target = touch ? scrollerUnder(element, touch.clientX, touch.clientY) : null;
      lastY = touch ? touch.clientY : 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!target || !touch) return;
      const moved = lastY - touch.clientY;
      if (!dragged && Math.abs(moved) < DRAG_SLOP_PX) return;
      dragged = true;
      target.scrollTop += moved;
      lastY = touch.clientY;
      if (event.cancelable) event.preventDefault();
    };
    // A drag is not a press: the click that follows it is dropped.
    const onClick = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('click', onClick, true);
    detach.current = () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('click', onClick, true);
    };
  }, []);
}

/**
 * A phone's keyboard covers the bottom of the window, and the window does not
 * get shorter for it — so a conversation as tall as the window would have its
 * writing box under the keyboard, or its title row pushed off the top. While
 * the keyboard is open this tells the element exactly what room is left
 * (`--kbd-height`, `--kbd-top`, and the mark `data-keyboard`); the stylesheet
 * draws the conversation into that room.
 */
export function useKeyboardRoom(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = ref.current;
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!element || !viewport || !active) return;

    const clear = () => {
      element.removeAttribute('data-keyboard');
      element.style.removeProperty('--kbd-height');
      element.style.removeProperty('--kbd-top');
    };
    const apply = () => {
      const room = keyboardBox({
        innerHeight: window.innerHeight,
        height: viewport.height,
        // Where the visible part starts, measured from the top of the page — the element starts there too.
        offsetTop: viewport.pageTop,
        scale: viewport.scale,
      });
      if (!room) {
        clear();
        return;
      }
      element.style.setProperty('--kbd-height', `${room.height}px`);
      element.style.setProperty('--kbd-top', `${room.offsetTop}px`);
      element.setAttribute('data-keyboard', '');
    };

    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      clear();
    };
  }, [ref, active]);
}

/**
 * Keeps a scroller on its last line while its own height changes — the writing
 * box under it grew, a bar came up, a phone's keyboard opened. `atEnd` says
 * whether the reader is on the last line at all; one who scrolled up is left alone.
 */
export function useStayAtEnd(ref: RefObject<HTMLElement | null>, atEnd: RefObject<boolean>, present = true) {
  useEffect(() => {
    if (!present) return;
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const next = element.clientHeight;
      // Out of view it measures nothing; that is not a change to answer.
      if (next === height || next === 0) return;
      height = next;
      if (atEnd.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, atEnd, present]);
}
