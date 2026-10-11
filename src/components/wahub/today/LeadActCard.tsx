'use client';

import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { LEAD_GROUP_LABELS } from '@/lib/wahub/leadStage';
import type { WahubLeadActSummary } from '@/types/wahub';
import { EmptyState, Skeleton } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface LeadActCardProps {
  /** `lead_act` of the summary: the total, and the states that have someone in them. */
  counts: WahubLeadActSummary;
  /** A state was pressed: the leads tab opens on it. */
  onStage: (key: string) => void;
}

/** The card on its way: its title row and its rows of states, in the same grid, so nothing moves when the numbers land. */
export function LeadActSkeleton() {
  return (
    <div className={cx(s.card, s.cardFlush, s.actCard)} aria-busy="true" aria-label="טוען">
      <div className={s.groupHead}>
        <Skeleton className={s.skLine} style={{ width: 110 }} />
        <Skeleton className={s.skCount} />
      </div>
      <ul className={cx(s.list, s.actList, s.skList)}>
        {Array.from({ length: 6 }).map((_, row) => (
          <li key={row} className={s.skRow}>
            <Skeleton className={cx(s.skLine, 'flex-1')} style={{ maxWidth: `${50 + ((row * 13) % 35)}%` }} />
            <Skeleton className={s.skCount} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "דורש טיפול" on the day's tab (docs/WAHUB-CONTRACT-LEAD-STAGES.md, ב): the
 * states that wait for something from the office, each with its number. A
 * press on a state opens the leads tab on that state. It stands where "שאלו
 * ולא נרשמו" stood, on a server that knows the lead states. The red mark on
 * the menu is not touched — it stays "מבקשים נציג" alone.
 */
export default function LeadActCard({ counts, onStage }: LeadActCardProps) {
  const title = LEAD_GROUP_LABELS.act;
  return (
    <section className={cx(s.card, s.cardFlush, s.actCard)} aria-label={title}>
      <div className={s.groupHead}>
        <h3 className={s.groupTitle}>{title}</h3>
        <span className={cx(s.groupTotal, s.num, counts.total > 0 && s.groupTotalAct)}>{counts.total.toLocaleString('he-IL')}</span>
      </div>
      {counts.stages.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="אין כרגע מי שדורש טיפול" tight />
      ) : (
        <ul className={cx(s.list, s.actList)}>
          {counts.stages.map((stage) => (
            <li key={stage.key}>
              <button type="button" onClick={() => onStage(stage.key)} className={cx(s.listRow, s.stageRow)}>
                <span className={cx(s.t1, s.stageLabel, 'min-w-0 flex-1 truncate')}>{stage.label}</span>
                <span className={cx(s.stageCount, s.num)}>{stage.count.toLocaleString('he-IL')}</span>
                <ChevronLeft className={s.rowChevron} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
