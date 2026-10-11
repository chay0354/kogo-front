'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { CARD_MIN_WIDTH, widthFromKey, widthFromPull } from '@/lib/wahub/cardPane';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface CardGripProps {
  /** The card's column: its width is what the handle changes. */
  target: RefObject<HTMLElement>;
  /** The width the card is drawn at now. */
  width: number;
  /** The widest it may be in this frame. */
  max: number;
  /** The handle was let go, or a key was pressed: keep this width. */
  onResize: (width: number) => void;
  /** A double click, or Enter: back to the width the screen gives by itself. */
  onReset: () => void;
}

/**
 * The handle between the conversation and the contact's card: it lies on the
 * thin line between them, takes no room of its own, and is pulled to make the
 * card wider or narrower (docs/WAHUB-CONTRACT-POLISH-1.md, א). While it is
 * pulled the column is sized directly, so the conversation beside it follows
 * the pointer without being drawn again; the width is kept when it is let go.
 * The keyboard has it too: it is a separator that takes the arrows, Home and End.
 */
export default function CardGrip({ target, width, max, onResize, onReset }: CardGripProps) {
  const [pulling, setPulling] = useState(false);
  const pull = useRef<{ startX: number; startWidth: number; onLeft: boolean; width: number } | null>(null);

  /** The card's side of the screen. This page runs right to left, so the card — the last column — is on the left. */
  function cardOnLeft(): boolean {
    const element = target.current;
    return element ? getComputedStyle(element).direction === 'rtl' : true;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !target.current) return;
    // Nothing is selected and no picture is dragged while the handle is pulled.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pull.current = { startX: event.clientX, startWidth: width, onLeft: cardOnLeft(), width };
    setPulling(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const held = pull.current;
    const element = target.current;
    if (!held || !element) return;
    held.width = widthFromPull(held.startWidth, held.startX, event.clientX, held.onLeft, max);
    element.style.width = `${held.width}px`;
  }

  function finish(event: PointerEvent<HTMLDivElement>, keep: boolean) {
    const held = pull.current;
    if (!held) return;
    pull.current = null;
    setPulling(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (keep && held.width !== width) onResize(held.width);
    // Not kept (the pull was interrupted): the column goes back to the width it is drawn at.
    else if (target.current) target.current.style.width = `${width}px`;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = widthFromKey(event.key, width, cardOnLeft(), max);
    if (next === null) return;
    event.preventDefault();
    if (next === 'default') onReset();
    else if (next !== width) onResize(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="רוחב כרטיס איש הקשר"
      aria-valuemin={CARD_MIN_WIDTH}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width} פיקסלים`}
      tabIndex={0}
      title="גררו כדי לשנות את רוחב הכרטיס. לחיצה כפולה מחזירה לרוחב הרגיל."
      data-pulling={pulling ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cx(s.cardGrip, pulling && s.cardGripOn)}
    />
  );
}
