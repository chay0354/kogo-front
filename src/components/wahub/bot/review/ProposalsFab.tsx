'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { pendingCount, pendingProposals } from '@/lib/wahub/bot';
import { useProposals, useReviewSummary } from '../../hooks/useBotQueries';
import { useNow } from '../../hooks/useNow';
import { EmptyState, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import ProposalCard from './ProposalCard';
import { useProposalDecision } from './useProposalDecision';

interface ProposalsFabProps {
  onOpenChat: (contactId: number) => void;
  onOpenItem: (id: number) => void;
  onOpenReview: () => void;
}

/**
 * The floating button on the LEFT of the whole section: "יש הצעות לעדכון הבוט (N)".
 * Shown only while something waits. Pressing it opens a side panel with each
 * proposal and its אשר / דחה; nothing changes without the press.
 */
export default function ProposalsFab({ onOpenChat, onOpenItem, onOpenReview }: ProposalsFabProps) {
  const now = useNow(60_000);
  const [open, setOpen] = useState(false);
  const summary = useReviewSummary(true);
  const pending = useProposals('pending', open || (summary.data?.pending ?? 0) > 0);
  const { approve, reject, busyId } = useProposalDecision();
  const count = pendingCount(summary.data, pending.data);
  const list = pendingProposals(pending.data ?? []);

  // Escape closes the panel; nothing else on the page is touched.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // The last one was decided: the panel has nothing left to show.
  useEffect(() => {
    if (open && count === 0 && !pending.isLoading) setOpen(false);
  }, [open, count, pending.isLoading]);

  if (count === 0 && !open) return null;

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className={s.fab} aria-haspopup="dialog" aria-expanded={false}>
          <Lightbulb aria-hidden="true" />
          יש הצעות לעדכון הבוט
          <span className={cx(s.fabN, s.num)}>{count}</span>
        </button>
      )}

      {open && (
        <>
          <div className={s.fabScrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <aside role="dialog" aria-modal="true" aria-label="הצעות לעדכון הבוט" className={s.fabPanel}>
            <header className={s.fabPanelHead}>
              <Lightbulb className="h-5 w-5 shrink-0 text-[var(--navy-ink)]" aria-hidden="true" />
              <h2>
                הצעות לעדכון הבוט <span className={cx(s.num, s.muted)}>({count})</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenReview();
                }}
                className={cx(s.link, 'text-[12.5px]')}
              >
                להיסטוריה
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגור" className={cx(s.ib, s.ibSm)}>
                <X aria-hidden="true" />
              </button>
            </header>
            <div className={s.fabPanelBody}>
              <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>
                כל הצעה: למה, מה משתנה (לפני ← אחרי) והראיות מהשיחה. <strong className="font-extrabold">אשר</strong> מחיל על הידע;{' '}
                <strong className="font-extrabold">דחה</strong> שומר את הסיבה. שום דבר לא נשלח ללקוח.
              </p>
              {pending.isLoading && list.length === 0 ? (
                <p className={cx(s.muted, 'm-0 flex items-center gap-2')}>
                  <Spinner /> טוען…
                </p>
              ) : list.length === 0 ? (
                <EmptyState icon={<Lightbulb />} title="אין הצעות שמחכות" tight />
              ) : (
                list.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    now={now}
                    busy={busyId === proposal.id}
                    onApprove={(note) => void approve(proposal, note)}
                    onReject={(note) => void reject(proposal, note)}
                    onOpenChat={(contactId) => {
                      setOpen(false);
                      onOpenChat(contactId);
                    }}
                    onOpenItem={(id) => {
                      setOpen(false);
                      onOpenItem(id);
                    }}
                  />
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
