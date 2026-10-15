'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { LIST_MIN_WIDTH, listWidthFromKey, listWidthFromPull } from '@/lib/wahub/listPane';
import { cx } from '../shared/tones';
import g from '../listPane.module.css';
import s from '../wahub.module.css';

interface ListGripProps {
  /** The list's column: its width is what the handle changes. */
  target: RefObject<HTMLElement>;
  /** The width the list is drawn at now. */
  width: number;
  /** The widest it may be in this frame. */
  max: number;
  /** The handle was let go, or a key was pressed: keep this width. */
  onResize: (width: number) => void;
  /** A double click, or Enter: back to the width the screen gives by itself. */
  onReset: () => void;
}

/**
 * The handle between the conversations list and the conversation (the owner, 15.10.2026), the twin of the card's
 * (CardGrip.tsx): it lies on the thin line between them, takes no room of its own, and is pulled to make the list
 * wider or narrower. While it is pulled the column is sized directly, so the conversation beside it follows the
 * pointer without being drawn again; the width is kept when it is let go. The keyboard has it too: it is a
 * separator that takes the arrows, Home and End; a double click (or Enter) is back to the screen's own width.
 */
export default function ListGrip({ target, width, max, onResize, onReset }: ListGripProps) {
  const [pulling, setPulling] = useState(false);
  const pull = useRef<{ startX: number; startWidth: number; onRight: boolean; width: number } | null>(null);

  /** The list's side of the screen. This page runs right to left, so the list — the first column — is on the right. */
  function listOnRight(): boolean {
    const element = target.current;
    return element ? getComputedStyle(element).direction === 'rtl' : true;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !target.current) return;
    // Nothing is selected and no picture is dragged while the handle is pulled.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pull.current = { startX: event.clientX, startWidth: width, onRight: listOnRight(), width };
    setPulling(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const held = pull.current;
    const element = target.current;
    if (!held || !element) return;
    held.width = listWidthFromPull(held.startWidth, held.startX, event.clientX, held.onRight, max);
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
    const next = listWidthFromKey(event.key, width, listOnRight(), max);
    if (next === null) return;
    event.preventDefault();
    if (next === 'default') onReset();
    else if (next !== width) onResize(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="רוחב רשימת השיחות"
      aria-valuemin={LIST_MIN_WIDTH}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width} פיקסלים`}
      tabIndex={0}
      title="גררו כדי לשנות את רוחב רשימת השיחות. לחיצה כפולה מחזירה לרוחב הרגיל."
      data-pulling={pulling ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cx(s.cardGrip, g.listGrip, pulling && s.cardGripOn)}
    />
  );
}
