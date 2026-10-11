'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { plainOfProposal } from '@/lib/wahub/plain';
import { isUndoneProposal, proposalExcerpt } from '@/lib/wahub/refine';
import { isNotBuiltYet, undoWahubProposal } from '@/lib/wahub/refineApi';
import type { WahubKnowledgeProposal } from '@/types/wahub';
import ProposalCard from '../bot/review/ProposalCard';
import { useKnowledgeCache, useProposalsCache } from '../hooks/useBotQueries';
import { Pill } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { useRefine, type RefineTarget } from './RefineContext';
import r from './refine.module.css';

/** How many cards the list shows before "הצג עוד". */
const SHOWN_FIRST = 6;

/**
 * "בטל" on a change that is in the knowledge
 * (POST review/proposals/{id}/undo/). Not shown before the server has answered:
 * the knowledge either went back or it did not.
 */
export function useProposalUndo() {
  const proposals = useProposalsCache();
  const knowledge = useKnowledgeCache();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function undo(proposal: WahubKnowledgeProposal): Promise<boolean> {
    if (busyId !== null) return false;
    setBusyId(proposal.id);
    try {
      const saved = await undoWahubProposal(proposal.id);
      proposals.patch(proposal.id, (prev) => {
        const next = { ...prev, ...(saved ?? {}) };
        // The contract says the proposal is marked "בוטל"; an answer that does not say so is still a change taken back.
        return isUndoneProposal(next) ? next : { ...next, status: 'undone', status_label: 'בוטל' };
      });
      knowledge.invalidate();
      proposals.invalidate();
      toast.success('בוטל. הידע של הבוט חזר למצב הקודם.');
      return true;
    } catch (error) {
      toast.error(isNotBuiltYet(error) ? 'הביטול עוד לא זמין בשרת.' : readableError(error, 'הביטול לא נשמר'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return { undo, busyId };
}

/** What the small chat of "דיוק" opens on for a proposal: the proposal itself, in the words its card uses. */
export function proposalTarget(proposal: WahubKnowledgeProposal): RefineTarget {
  return {
    contactId: proposal.contact_id,
    contactName: proposal.contact_name ?? '',
    messageIds: [],
    excerpt: proposalExcerpt(plainOfProposal(proposal)),
    heading: 'ההצעה',
    proposalId: proposal.id,
  };
}

/**
 * "דיוק" on a proposal's card: the small chat opens on the proposal and asks
 * "מה לשנות בהצעה?". Undefined where there is no small chat to open.
 */
export function useProposalRefine(): ((proposal: WahubKnowledgeProposal) => void) | undefined {
  const { available, open } = useRefine();
  const refine = useCallback((proposal: WahubKnowledgeProposal) => open(proposalTarget(proposal)), [open]);
  return available ? refine : undefined;
}

interface AutoAppliedSectionProps {
  proposals: ReadonlyArray<WahubKnowledgeProposal>;
  /** "אישור אוטומטי של תיקונים" as the server last said; undefined on a server that does not know it. */
  autoApply: boolean | undefined;
  now: Date;
  /** The proposal being taken back right now. */
  busyId: number | null;
  onUndo: (proposal: WahubKnowledgeProposal) => void;
  onRefine?: (proposal: WahubKnowledgeProposal) => void;
  onOpenChat?: (contactId: number) => void;
  onOpenItem?: (id: number) => void;
}

/**
 * "עודכן לבד": what the system changed in the bot's knowledge without waiting
 * for a press, newest first — each the same card as any proposal, folded to
 * what the bot does from now on, with "בטל" and "דיוק". One that was taken
 * back stays on the list, marked, so the list is a true record.
 *
 * Not drawn at all while the switch is off and nothing was ever applied by
 * itself: there is nothing to say.
 */
export default function AutoAppliedSection({
  proposals,
  autoApply,
  now,
  busyId,
  onUndo,
  onRefine,
  onOpenChat,
  onOpenItem,
}: AutoAppliedSectionProps) {
  const [showAll, setShowAll] = useState(false);
  if (proposals.length === 0 && !autoApply) return null;
  const shown = showAll ? proposals : proposals.slice(0, SHOWN_FIRST);
  const hidden = proposals.length - shown.length;
  return (
    <section className="flex flex-col gap-2.5" aria-label="עודכן לבד">
      <div className={r.autoHead}>
        <h3>
          עודכן לבד <span className={cx(s.num, s.muted)}>({proposals.length})</span>
        </h3>
        {autoApply !== undefined && (
          <Pill tone={autoApply ? 'success' : 'muted'} dot title='המתג "אישור אוטומטי של תיקונים" נמצא בלשונית "הגדרות"'>
            {autoApply ? 'אישור אוטומטי פעיל' : 'אישור אוטומטי כבוי'}
          </Pill>
        )}
        <p>
          {proposals.length === 0 ? (
            'עוד לא היו תיקונים שנכנסו לבד.'
          ) : (
            <>
              תיקונים שנכנסו לידע של הבוט בלי לחכות לאישור. <strong className="font-extrabold">בטל</strong> מחזיר את הידע למצב
              הקודם; <strong className="font-extrabold">דיוק</strong> משנה את התיקון.
            </>
          )}
        </p>
      </div>
      {shown.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          now={now}
          busy={busyId === proposal.id}
          compact
          onUndo={() => onUndo(proposal)}
          onRefine={onRefine ? () => onRefine(proposal) : undefined}
          onOpenChat={onOpenChat}
          onOpenItem={onOpenItem}
        />
      ))}
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className={cx(s.link, 'self-start text-[12.5px]')}>
          {hidden === 1 ? 'הצג עוד אחד' : `הצג עוד ${hidden}`}
        </button>
      )}
    </section>
  );
}
