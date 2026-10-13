'use client';

import { BellRing, CheckCircle2, ChevronLeft, Hourglass } from 'lucide-react';
import { LEADS_VIEW_LABELS, WAITING_LIST_TITLE, emptyWords, knowsListsApart, leadTitle, nextStepLine, stuckFirst } from '@/lib/wahub/leadsV2';
import { waitersText } from '@/lib/wahub/waitingList';
import { waitingActText } from '@/lib/wahub/waitingSummary';
import type { WahubLeadsPage } from '@/types/wahub';
import { DemoTag, EmptyState } from '../../shared/bits';
import { cx } from '../../shared/tones';
import x from '../../search.module.css';
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
  /** "מחכים שיתפנה מקום" was pressed: the leads tab opens on that list. Absent: the line is not drawn. */
  onOpenWaiting?: () => void;
}

/**
 * "מחכים לך" on the day's tab (docs/WAHUB-CONTRACT-LEADS-V2.md, ה): how many
 * leads wait for the office, the first few by name with what each waits for,
 * and — in a word — how many the bot is handling by itself. The title leads to
 * the leads tab; a name leads to that lead. It stands where "דורש טיפול" stood,
 * on a server that has `leads/`. The red mark on the menu is not touched.
 *
 * Whoever waits for a place is not among them (owner, 13.10.2026: "'מחכים לך'
 * זה כללי מדי… תרשום 'מחכים שיתפנה מקום'"): they have one line of their own at
 * the card's foot — how many, and how many of them call on the office now.
 */
export default function TodayLeadsCard({ page, now, sendingOn, onOpenList, onOpenLead, onOpenWaiting }: TodayLeadsCardProps) {
  const title = LEADS_VIEW_LABELS.office;
  const total = page.counts.office;
  // "נתקע בהרשמה" first, here as in the list: it is the one that cannot wait for tomorrow.
  const rows = stuckFirst(page.results).slice(0, GLANCE_ROWS);
  const empty = emptyWords('office', page.counts, false);
  const botHint = page.counts.bot > 0 ? `הבוט מטפל ב-${page.counts.bot.toLocaleString('he-IL')}` : '';
  // Only a server that lists them apart counts them; with nobody waiting there is nothing to say.
  const waiting = knowsListsApart(page.counts) ? page.counts.waiting ?? 0 : 0;
  const waitingAct = waitingActText(page.counts.waiting_act);
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
      {waiting > 0 && onOpenWaiting && (
        <button type="button" onClick={onOpenWaiting} className={x.todayWaiting}>
          {waitingAct ? <BellRing aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
          <span className={x.todayWaitingText}>
            <strong>{WAITING_LIST_TITLE}</strong> · {waitersText(waiting)}
            {waitingAct && (
              <>
                {' · '}
                <span className={x.todayWaitingAct}>{waitingAct}</span>
              </>
            )}
          </span>
          <ChevronLeft className={s.rowChevron} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
