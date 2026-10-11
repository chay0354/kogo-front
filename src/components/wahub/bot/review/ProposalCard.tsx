'use client';

import { useState } from 'react';
import { Check, Crosshair, Undo2, X } from 'lucide-react';
import { formatDateTime } from '@/lib/wahub/format';
import { plainOfProposal } from '@/lib/wahub/plain';
import { AUTO_APPLIED_NOTE, isAutoApplied, isUndoneProposal } from '@/lib/wahub/refine';
import type { WahubKnowledgeProposal, WahubProposalStatus } from '@/types/wahub';
import PlainCard, { type PlainStands } from '../../refine/PlainCard';
import { Pill, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';

const STATUS_TONE: Record<WahubProposalStatus, 'warning' | 'success' | 'danger' | 'primary' | 'muted'> = {
  pending: 'warning',
  approved: 'primary',
  applied: 'success',
  rejected: 'danger',
  undone: 'muted',
};

const STATUS_WORD: Record<WahubProposalStatus, string> = {
  pending: 'ממתין לאישור',
  approved: 'אושר',
  applied: 'הוחל על הידע',
  rejected: 'נדחה',
  undone: 'בוטל',
};

interface ProposalCardProps {
  proposal: WahubKnowledgeProposal;
  now: Date;
  busy: boolean;
  /** Folded by default: the headline, the pills and the buttons; the rest on a press. */
  compact?: boolean;
  onApprove?: (note: string) => void;
  onReject?: (note: string) => void;
  /** "בטל" on a change that is in the knowledge: puts the knowledge back as it was. */
  onUndo?: () => void;
  /** "דיוק": the small chat opens on this proposal — "מה לשנות בהצעה?". */
  onRefine?: () => void;
  onOpenChat?: (contactId: number) => void;
  onOpenItem?: (id: number) => void;
}

/**
 * One proposal to change the bot, as a person reads it
 * (docs/WAHUB-CONTRACT-REFINE.md, ג): what the bot will do from now on, why,
 * what changes in a paragraph, the examples and the technical details folded.
 * Waiting: אשר · דחה · דיוק. In the knowledge already: בטל · דיוק. Nothing
 * waiting changes the knowledge until אשר is pressed.
 */
export default function ProposalCard({
  proposal,
  now,
  busy,
  compact = false,
  onApprove,
  onReject,
  onUndo,
  onRefine,
  onOpenChat,
  onOpenItem,
}: ProposalCardProps) {
  const [open, setOpen] = useState(!compact);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const pending = proposal.status === 'pending';
  const undone = isUndoneProposal(proposal);
  const inKnowledge = !undone && (proposal.status === 'applied' || proposal.status === 'approved');
  const auto = isAutoApplied(proposal);
  const stands: PlainStands = pending ? 'waiting' : undone ? 'undone' : inKnowledge ? 'applied' : 'rejected';
  const statusWord = undone ? STATUS_WORD.undone : auto ? 'עודכן לבד' : proposal.status_label || STATUS_WORD[proposal.status] || proposal.status;
  const itemId = proposal.change?.item_id ?? proposal.applied_item_id ?? null;
  const contactId = proposal.contact_id;
  // The system's own note on what it applied by itself is already said by the pill.
  const decisionNote = (proposal.decision_note ?? '').trim().startsWith(AUTO_APPLIED_NOTE) ? '' : proposal.decision_note;

  // "דיוק": the small chat opens on this proposal, for whoever would rather say what to change than decide yes or no.
  const refineButton = () =>
    onRefine && (
      <button
        type="button"
        onClick={onRefine}
        disabled={busy}
        title={pending ? 'דיוק: כתבו מה לשנות בהצעה' : 'דיוק: כתבו מה לשנות בתיקון הזה'}
        className={cx(s.btn, !pending && s.btnSm)}
      >
        <Crosshair aria-hidden="true" />
        דיוק
      </button>
    );

  let actions: React.ReactNode;
  if (pending && !rejecting && (onApprove || onReject || onRefine)) {
    actions = (
      <>
        <button type="button" disabled={busy || !onApprove} onClick={() => onApprove?.('')} className={cx(s.btn, s.btnP)}>
          {busy ? <Spinner /> : <Check aria-hidden="true" />}
          אשר
        </button>
        <button type="button" disabled={busy || !onReject} onClick={() => setRejecting(true)} className={s.btn}>
          <X aria-hidden="true" />
          דחה
        </button>
        {refineButton()}
        <span className={cx(s.t2, '!text-[12px]')}>אשר = הידע משתנה עכשיו. לא נשלח כלום ללקוח.</span>
      </>
    );
  } else if (inKnowledge && (onUndo || onRefine)) {
    actions = (
      <>
        {onUndo && proposal.can_undo !== false && (
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            aria-label={`בטל את השינוי: ${proposal.title}`}
            title="בטל: הידע של הבוט חוזר למצב שלפני השינוי"
            className={cx(s.btn, s.btnSm)}
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <Undo2 aria-hidden="true" />}
            בטל
          </button>
        )}
        {refineButton()}
      </>
    );
  }

  return (
    <PlainCard
      model={plainOfProposal(proposal)}
      stands={stands}
      className={s.card}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      onOpenChat={contactId != null && onOpenChat ? () => onOpenChat(contactId) : undefined}
      onOpenItem={itemId != null && onOpenItem ? () => onOpenItem(itemId) : undefined}
      evidence={proposal.evidence}
      pills={
        <>
          <Pill tone={undone ? 'muted' : STATUS_TONE[proposal.status] ?? 'neutral'}>{statusWord}</Pill>
          {proposal.source_label && <Pill tone="neutral">{proposal.source_label}</Pill>}
          {proposal.pattern_label && <Pill tone="muted">{proposal.pattern_label}</Pill>}
          {proposal.contact_name && (
            <span className="font-bold" dir="auto">
              {proposal.contact_name}
            </span>
          )}
          <span className={s.num}>{formatDateTime(proposal.decided_at ?? proposal.created_at, now)}</span>
        </>
      }
      note={
        pending ? (
          rejecting && (
            <div className={cx(s.confirm, s.confirmBad, 'flex flex-col gap-2')}>
              <p className="m-0">
                <strong className="font-extrabold">למה לדחות?</strong> ההערה נשמרת עם ההצעה.
              </p>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} autoFocus aria-label="הערת דחייה" className={s.field} />
              <div className="flex gap-2">
                <button type="button" disabled={busy || !note.trim()} onClick={() => onReject?.(note)} className={cx(s.btn, s.btnSm, s.btnBad)}>
                  {busy && <Spinner className="h-3.5 w-3.5" />}
                  דחה
                </button>
                <button type="button" onClick={() => setRejecting(false)} disabled={busy} className={cx(s.btn, s.btnSm)}>
                  חזרה
                </button>
              </div>
            </div>
          )
        ) : proposal.decided_by_name || decisionNote ? (
          <p className={cx(s.t2, 'm-0 !text-[12.5px]')} dir="auto">
            {[statusWord, proposal.decided_by_name, proposal.decided_at ? formatDateTime(proposal.decided_at, now) : '', decisionNote ? `“${decisionNote}”` : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : undefined
      }
      actions={actions}
    />
  );
}
