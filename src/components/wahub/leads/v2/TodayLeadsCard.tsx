'use client';

import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { LEADS_VIEW_LABELS, emptyWords, leadTitle, nextStepLine, stuckFirst } from '@/lib/wahub/leadsV2';
import type { WahubLeadsPage } from '@/types/wahub';
import { DemoTag, EmptyState } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import l from './leads.module.css';

/** The card shows this many; the rest are a press away, in the leads tab. */
export const GLANCE_ROWS = 5;

interface TodayLeadsCardProps {
  /** The first page of the list that waits for the office, with the three numbers. */
  page: WahubLeadsPage;
  now: Date;
  sendingOn: boolean | null;
  /** The title was pressed: the leads tab opens on "מחכים לך". */
  onOpenList: () => void;
  /** A lead was pressed: the leads tab opens on it, with its details. */
  onOpenLead: (id: number) => void;
}

/**
 * "מחכים לך" on the day's tab (docs/WAHUB-CONTRACT-LEADS-V2.md, ה): how many
 * leads wait for the office, the first few by name with what each waits for,
 * and — in a word — how many the bot is handling by itself. The title leads to
 * the leads tab; a name leads to that lead. It stands where "דורש טיפול" stood,
 * on a server that has `leads/`. The red mark on the menu is not touched.
 */
export default function TodayLeadsCard({ page, now, sendingOn, onOpenList, onOpenLead }: TodayLeadsCardProps) {
  const title = LEADS_VIEW_LABELS.office;
  const total = page.counts.office;
  // "נתקע בהרשמה" first, here as in the list: it is the one that cannot wait for tomorrow.
  const rows = stuckFirst(page.results).slice(0, GLANCE_ROWS);
  const empty = emptyWords('office', page.counts, false);
  const botHint = page.counts.bot > 0 ? `הבוט מטפל ב-${page.counts.bot.toLocaleString('he-IL')}` : '';
  return (
    <section className={cx(s.card, s.cardFlush, s.actCard)} aria-label={title}>
      <button type="button" onClick={onOpenList} className={l.glanceHead} title="לכל הרשימה">
        <span className={l.glanceTitle}>{title}</span>
        <span className={cx(l.glanceCount, s.num, total > 0 && l.glanceCountAct)}>{total.toLocaleString('he-IL')}</span>
        <span className={l.glanceHint}>{total > 0 ? botHint : ''}</span>
        <ChevronLeft className={s.rowChevron} aria-hidden="true" />
      </button>
      {rows.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title={empty.title} text={empty.text || undefined} tight />
      ) : (
        <>
          <ul className={l.glanceRows}>
            {rows.map((lead) => (
              <li key={lead.contact_id}>
                <button type="button" onClick={() => onOpenLead(lead.contact_id)} className={l.glanceRow}>
                  <span className={l.glanceName} dir="auto">
                    {leadTitle(lead)}
                  </span>
                  {lead.is_demo && <DemoTag size="row" />}
                  <span className={l.glanceNext} dir="auto">
                    {nextStepLine(lead, now, sendingOn).text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {total > rows.length && (
            <div className={s.peopleMore}>
              <button type="button" onClick={onOpenList} className={cx(s.btn, s.btnSm)}>
                לכל ה-{total.toLocaleString('he-IL')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
