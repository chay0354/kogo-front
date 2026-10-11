'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Crosshair } from 'lucide-react';
import { selectionLabel } from '@/lib/wahub/refine';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import r from './refine.module.css';

/** How long a finger rests on a bubble before "דיוק" comes up. */
const LONG_PRESS_MS = 450;

interface RefineRowProps {
  id: number;
  /** "דיוק" was pressed: the row is a mark to set, not a message to use. */
  selecting: boolean;
  selected: boolean;
  /** The server knows the message. One still on its way cannot be marked. */
  selectable: boolean;
  /** The small chat is open on this message. */
  marked: boolean;
  onPress: (id: number, shift: boolean) => void;
  children: ReactNode;
}

/**
 * One message of the conversation (its bubble, and the shadow reply under it).
 * Ordinarily it is drawn as it always was. While marking, the whole row is a
 * checkbox: a press marks it, Shift marks the stretch up to it. The body keeps
 * its place in the tree either way, so a recording that is playing goes on.
 */
export function RefineRow({ id, selecting, selected, selectable, marked, onPress, children }: RefineRowProps) {
  const pickable = selecting && selectable;
  return (
    <div
      role={pickable ? 'checkbox' : undefined}
      aria-checked={pickable ? selected : undefined}
      aria-disabled={selecting && !selectable ? true : undefined}
      aria-label={pickable ? 'סימון ההודעה לדיוק' : undefined}
      tabIndex={pickable ? 0 : undefined}
      onClick={pickable ? (event) => onPress(id, event.shiftKey) : undefined}
      onKeyDown={
        pickable
          ? (event) => {
              if (event.key !== ' ' && event.key !== 'Enter') return;
              event.preventDefault();
              onPress(id, event.shiftKey);
            }
          : undefined
      }
      className={
        selecting
          ? cx(r.pick, selected && r.pickOn, !selectable && r.pickOff)
          : marked
            ? r.marked
            : undefined
      }
    >
      {selecting && (
        <span className={cx(r.check, selected && r.checkOn)} aria-hidden="true">
          {selectable && <Check />}
        </span>
      )}
      <div className={cx('flex flex-col gap-1', selecting && r.pickBody)}>{children}</div>
    </div>
  );
}

/** The bar at the bottom while marking: how many, "המשך", "ביטול". */
export function RefineSelectBar({
  count,
  onContinue,
  onCancel,
}: {
  count: number;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="toolbar" aria-label="בחירת הודעות לדיוק" className={r.selectBar}>
      <span className={r.selectCount} aria-live="polite">
        {selectionLabel(count)}
      </span>
      <span className={r.selectHint}>סמנו את ההודעות שלא היו טובות. Shift + לחיצה מסמן טווח.</span>
      <button type="button" onClick={onContinue} disabled={count === 0} className={cx(s.btn, s.btnP)}>
        המשך
      </button>
      <button type="button" onClick={onCancel} className={s.btn}>
        ביטול
      </button>
    </div>
  );
}

/**
 * "דיוק" on one bubble: beside it when the mouse is over the message, and on a
 * phone after a long press. Hands the bubble what it needs — two class names,
 * the touch handlers and the button — and nothing at all when there is nowhere
 * to open it or the message is not the server's yet.
 */
export function useBubbleRefine(id: number, mine: boolean, onRefine?: (id: number) => void) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const chip = useRef<HTMLButtonElement | null>(null);
  const enabled = Boolean(onRefine) && id > 0;

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clear, []);

  useEffect(() => {
    if (!enabled) setArmed(false);
  }, [enabled]);

  // Up after a long press: a touch anywhere else puts it away.
  useEffect(() => {
    if (!armed) return;
    const away = (event: PointerEvent) => {
      if (!chip.current?.contains(event.target as Node)) setArmed(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [armed]);

  if (!enabled || !onRefine) return { rowClass: undefined, colClass: undefined, rowProps: undefined, button: null };

  return {
    rowClass: r.hoverRow,
    colClass: r.chipHost,
    rowProps: {
      onTouchStart: () => {
        clear();
        timer.current = window.setTimeout(() => setArmed(true), LONG_PRESS_MS);
      },
      onTouchEnd: clear,
      onTouchMove: clear,
      onTouchCancel: clear,
    },
    button: (
      <button
        ref={chip}
        type="button"
        // A shortcut for the mouse and the finger; the keyboard has the button at the top of the conversation.
        tabIndex={-1}
        onClick={() => {
          setArmed(false);
          onRefine(id);
        }}
        aria-label="דיוק על ההודעה הזו"
        title="דיוק: מה לא היה טוב בהודעה הזו?"
        className={cx(r.chip, mine ? r.chipOut : r.chipIn, armed && r.chipArmed)}
      >
        <Crosshair aria-hidden="true" />
        <span>דיוק</span>
      </button>
    ),
  };
}
