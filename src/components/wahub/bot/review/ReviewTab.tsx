'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import type { WahubKnowledgeProposal, WahubProposalStatus } from '@/types/wahub';
import { useProposals, useReviewSummary } from '../../hooks/useBotQueries';
import { useNow } from '../../hooks/useNow';
import { EmptyState, ErrorState, Pill, Skeleton } from '../../shared/bits';
import { NUMBER_TONE, cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import ProposalCard from './ProposalCard';
import { useProposalDecision } from './useProposalDecision';

type View = 'all' | WahubProposalStatus;

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'all', label: 'הכול' },
  { key: 'pending', label: 'ממתינות' },
  { key: 'applied', label: 'אושרו' },
  { key: 'rejected', label: 'נדחו' },
];

function Tile({ label, value, tone = 'neutral' as const }: { label: string; value: string; tone?: keyof typeof NUMBER_TONE }) {
  return (
    <div className={cx(s.card, s.kpi)}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={cx(s.kpiValue, s.num, NUMBER_TONE[tone], '!pe-0')}>{value}</span>
    </div>
  );
}

interface ReviewTabProps {
  onOpenChat: (contactId: number) => void;
  onOpenItem: (id: number) => void;
}

/**
 * "ביקורת": every proposal the reviewer made — what is waiting, what was
 * approved and applied, what was rejected, by whom and when. The pending ones
 * can be decided here as well as from the floating button.
 */
export default function ReviewTab({ onOpenChat, onOpenItem }: ReviewTabProps) {
  const now = useNow(60_000);
  const [view, setView] = useState<View>('all');
  const summary = useReviewSummary(true);
  const proposals = useProposals('', true);
  const { approve, reject, busyId } = useProposalDecision();

  const list = useMemo(() => {
    const all = (proposals.data ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    const picked = view === 'all' ? all : all.filter((proposal) => (view === 'applied' ? proposal.status === 'applied' || proposal.status === 'approved' : proposal.status === view));
    // Pending first, then by time.
    return picked.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  }, [proposals.data, view]);

  const countOf = (status: View) =>
    status === 'all'
      ? proposals.data?.length ?? null
      : (proposals.data?.filter((proposal: WahubKnowledgeProposal) => (status === 'applied' ? proposal.status === 'applied' || proposal.status === 'approved' : proposal.status === status)).length ?? null);

  const sum = summary.data;

  return (
    <div className="flex flex-col gap-3.5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="סיכום">
        <Tile label="ממתינות לאישור" value={sum ? sum.pending.toLocaleString('he-IL') : '–'} tone={sum?.pending ? 'warning' : 'neutral'} />
        <Tile label="אושרו ב-7 ימים" value={sum ? sum.applied_7d.toLocaleString('he-IL') : '–'} tone="success" />
        <Tile label="נדחו ב-7 ימים" value={sum ? sum.rejected_7d.toLocaleString('he-IL') : '–'} />
        <div className={cx(s.card, s.kpi)}>
          <span className={s.kpiLabel}>איך הידע משתנה</span>
          <span className="mt-1">
            <Pill tone={sum?.auto_mode ? 'warning' : 'success'} dot>
              {sum?.auto_mode ? 'אוטומטי' : 'רק באישור שלך'}
            </Pill>
          </span>
          <span className={s.kpiNote}>אוטומטי – בשלב הבא, עם מתג.</span>
        </div>
      </section>

      <section className={cx(s.card, 'flex flex-wrap items-center gap-2.5')} aria-label="סינון">
        <div className={s.chips} role="group" aria-label="סינון לפי מצב">
          {VIEWS.map((def) => {
            const count = countOf(def.key);
            return (
              <button key={def.key} type="button" aria-pressed={view === def.key} onClick={() => setView(def.key)} className={cx(s.chipbtn, view === def.key && s.on)}>
                {def.label}
                {count != null && <span className={s.cnt}>{count}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {proposals.isLoading ? (
        <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="טוען הצעות">
          {[0, 1].map((card) => (
            <div key={card} className={s.card}>
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-3 h-12 !rounded-xl" />
            </div>
          ))}
        </div>
      ) : proposals.isError ? (
        <div className={s.card}>
          <ErrorState title="לא הצלחנו לטעון את ההצעות" text={readableError(proposals.error, '')} onRetry={() => void proposals.refetch()} />
        </div>
      ) : list.length === 0 ? (
        <div className={s.card}>
          <EmptyState
            icon={<ClipboardCheck />}
            title={view === 'all' ? 'עוד אין הצעות' : 'אין הצעות במצב הזה'}
            text={
              view === 'all'
                ? 'הצעה נולדת כשנציג ענה מעל הבוט, כשסימנת 👎 עם הערה, כשנכתב "הבוט טעה כאן", או מהסריקה היומית.'
                : undefined
            }
          />
        </div>
      ) : (
        <section className="flex flex-col gap-3.5" aria-label="הצעות">
          {list.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              now={now}
              busy={busyId === proposal.id}
              compact={proposal.status !== 'pending'}
              onApprove={(note) => void approve(proposal, note)}
              onReject={(note) => void reject(proposal, note)}
              onOpenChat={onOpenChat}
              onOpenItem={onOpenItem}
            />
          ))}
        </section>
      )}
    </div>
  );
}
