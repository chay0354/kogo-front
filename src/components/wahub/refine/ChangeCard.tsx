'use client';

import { Undo2 } from 'lucide-react';
import { plainOfChange } from '@/lib/wahub/plain';
import { CHANGE_STATE_LABEL, changeState, type RefineChangeState } from '@/lib/wahub/refine';
import type { WahubRefineChange } from '@/types/wahubRefine';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import PlainCard from './PlainCard';
import r from './refine.module.css';

const STATE_PILL: Record<RefineChangeState, string> = {
  applied: s.pGood,
  waiting: s.pWarn,
  undone: s.pMute,
};

interface ChangeCardProps {
  change: WahubRefineChange;
  /** This card is being taken back right now. */
  busy: boolean;
  /** Another card is being taken back, or the server is thinking: "בטל" waits. */
  locked: boolean;
  /** Said under a change that has not entered the knowledge. */
  waitingNote?: string;
  onUndo: () => void;
}

/**
 * One change a refinement made to the bot's knowledge, in the small chat: the
 * same readable card the proposals use — what the bot will do from now on,
 * what changed, the examples and the technical details folded — with "בטל"
 * for as long as the change is in the knowledge.
 */
export default function ChangeCard({ change, busy, locked, waitingNote, onUndo }: ChangeCardProps) {
  const stands = changeState(change);
  return (
    <PlainCard
      model={plainOfChange(change)}
      stands={stands}
      className={cx(r.change, stands === 'waiting' && r.changeWaiting, stands === 'undone' && r.changeUndone)}
      pills={<span className={cx(s.pill, STATE_PILL[stands])}>{CHANGE_STATE_LABEL[stands]}</span>}
      note={stands === 'waiting' && waitingNote ? <p className={cx(r.changeNote, 'm-0')}>{waitingNote}</p> : undefined}
      actions={
        // "בטל" for as long as the change is in the knowledge — unless the server says it cannot be taken back.
        stands === 'applied' && change.can_undo !== false ? (
          <button type="button" onClick={onUndo} disabled={busy || locked} className={cx(s.btn, s.btnSm)}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <Undo2 aria-hidden="true" />}
            בטל
          </button>
        ) : undefined
      }
    />
  );
}
