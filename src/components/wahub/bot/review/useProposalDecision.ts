'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { approveWahubProposal, rejectWahubProposal } from '@/lib/wahubApi';
import type { WahubKnowledgeProposal } from '@/types/wahub';
import { useKnowledgeCache, useProposalsCache } from '../../hooks/useBotQueries';

/**
 * אשר / דחה, saved the same way from the floating panel and from the review
 * tab: the decision is shown at once; if the server refuses, the proposal is
 * put back as it was and the reason is said. An approval that went through
 * also refreshes the knowledge, because it changed.
 */
export function useProposalDecision() {
  const proposals = useProposalsCache();
  const knowledge = useKnowledgeCache();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function approve(proposal: WahubKnowledgeProposal, note = '') {
    setBusyId(proposal.id);
    const snapshot = proposals.snapshot();
    proposals.patch(proposal.id, (prev) => ({ ...prev, status: 'applied', status_label: 'הוחל על הידע', decided_at: new Date().toISOString(), decision_note: note }));
    proposals.bumpPending(-1);
    try {
      const result = await approveWahubProposal(proposal.id, note);
      if (result.item && typeof result.item.id === 'number') knowledge.put(result.item);
      if (result.proposal && typeof result.proposal.id === 'number') proposals.patch(proposal.id, () => result.proposal as WahubKnowledgeProposal);
      knowledge.invalidate();
      proposals.invalidate();
      toast.success(result.item?.title ? `אושר. הידע עודכן: ${result.item.title}` : 'אושר. הידע עודכן.');
      return true;
    } catch (error) {
      proposals.restore(snapshot);
      proposals.bumpPending(1);
      toast.error(readableError(error, 'האישור לא נשמר'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function reject(proposal: WahubKnowledgeProposal, note: string) {
    setBusyId(proposal.id);
    const snapshot = proposals.snapshot();
    proposals.patch(proposal.id, (prev) => ({ ...prev, status: 'rejected', status_label: 'נדחה', decided_at: new Date().toISOString(), decision_note: note }));
    proposals.bumpPending(-1);
    try {
      const saved = await rejectWahubProposal(proposal.id, note);
      if (saved) proposals.patch(proposal.id, () => saved);
      proposals.invalidate();
      toast.success('ההצעה נדחתה');
      return true;
    } catch (error) {
      proposals.restore(snapshot);
      proposals.bumpPending(1);
      toast.error(readableError(error, 'הדחייה לא נשמרה'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return { approve, reject, busyId };
}
