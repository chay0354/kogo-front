'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { selectionLabel } from '@/lib/wahub/refine';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import r from './refine.module.css';

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
