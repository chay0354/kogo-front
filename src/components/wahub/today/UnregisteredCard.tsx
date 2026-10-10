'use client';

import { useId, useState } from 'react';
import { ChevronDown, Flame, UserX } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import { initials } from '@/lib/wahub/format';
import {
  DEFAULT_UNREGISTERED_DAYS,
  UNREGISTERED_DAY_RANGES,
  daysAgoText,
  leadName,
  leadPhone,
  unregisteredNotes,
  type UnregisteredDays,
} from '@/lib/wahub/unregistered';
import type { WahubUnregisteredCounts, WahubUnregisteredLead } from '@/types/wahub';
import { useUnregisteredLeads } from '../hooks/useWahubQueries';
import { DemoTag, EmptyState, ErrorState, Pill, Skeleton } from '../shared/bits';
import { outcomeTone } from '../shared/ContactParts';
import { NUMBER_TONE, cx } from '../shared/tones';
import s from '../wahub.module.css';

function RowsSkeleton() {
  return (
    <ul className={s.list} aria-busy="true" aria-label="טוען">
      {Array.from({ length: 4 }).map((_, row) => (
        <li key={row} className="flex items-center gap-2.5 px-2.5 py-2">
          <Skeleton className="h-[30px] w-[30px] shrink-0" />
          <Skeleton className="h-3.5 flex-1" />
        </li>
      ))}
    </ul>
  );
}

/** One person who asked and did not register. The whole row leads to the conversation. */
function LeadRow({ lead, onOpen }: { lead: WahubUnregisteredLead; onOpen: (id: number) => void }) {
  const waited = daysAgoText(lead.days_since_last);
  return (
    <li>
      <button type="button" onClick={() => onOpen(lead.id)} className={cx(s.listRow, 'items-start')}>
        <span className={cx(s.av, 'mt-0.5')}>
          <span aria-hidden="true">{initials({ name: lead.name, phone: lead.phone, phone_display: leadPhone(lead) })}</span>
          {lead.needs_human && <span className={s.avDot} role="img" aria-label="מבקש נציג" title="מבקש נציג" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className={cx(s.t1, 'truncate')} dir="auto">
              {leadName(lead)}
            </span>
            {lead.is_demo && <DemoTag size="row" />}
            {lead.hot && (
              <span className={cx(s.rowTag, s.pBad)} title="מתעניין בניסיון או בהרשמה, או שהחיוב שלו נכשל">
                <Flame className="h-3 w-3" aria-hidden="true" />
                חם
              </span>
            )}
          </span>
          <span className={cx(s.t2, 'block truncate')} dir="auto" title={lead.asked || undefined}>
            {lead.asked || 'לא נשמר מה שאל'}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {lead.kogo_outcome_label && (
              <Pill tone={outcomeTone(lead.kogo_outcome)} wrap>
                {lead.kogo_outcome_label}
              </Pill>
            )}
            {lead.followup_status_label && <Pill tone="primary">{lead.followup_status_label}</Pill>}
          </span>
        </span>
        {waited && (
          <span className={cx(s.pill, lead.hot ? s.pBad : s.pWarn, 'mt-0.5 shrink-0')} title="ההודעה האחרונה שלו">
            {waited}
          </span>
        )}
      </button>
    </li>
  );
}

interface UnregisteredCardProps {
  /** `unregistered_leads` of the summary (30 days). Undefined while it loads, or on a server that has no such key. */
  counts: WahubUnregisteredCounts | undefined;
  open: boolean;
  onToggle: () => void;
  onOpenChat: (id: number) => void;
}

/**
 * "שאלו ולא נרשמו" (stage 3, §ג.1): the title and the number first; the list
 * opens in the same card on a press, with "רק חמים" and a range of days.
 * Closed, nothing beyond the summary is read. The red mark on the menu is not
 * touched — it stays "מבקשים נציג" alone.
 */
export default function UnregisteredCard({ counts, open, onToggle, onOpenChat }: UnregisteredCardProps) {
  const panelId = useId();
  const [hot, setHot] = useState(false);
  const [days, setDays] = useState<UnregisteredDays>(DEFAULT_UNREGISTERED_DAYS);
  const list = useUnregisteredLeads(days, hot, open);

  const total = counts ? counts.total : null;
  const notes = unregisteredNotes(counts);
  const listCounts = list.data?.counts;

  return (
    <section className={cx(s.card, s.cardFlush)} aria-label="שאלו ולא נרשמו">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cx(s.kpi, 'rounded-[16px] hover:bg-[var(--lav-2)]')}
      >
        <span className={cx(s.kpiLabel, 'flex items-center gap-1.5')}>
          שאלו ולא נרשמו
          <ChevronDown
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform"
            style={open ? { transform: 'rotate(180deg)' } : undefined}
          />
        </span>
        <span className={cx(s.kpiValue, s.num, total ? NUMBER_TONE.warning : '')}>
          {total === null ? '–' : total.toLocaleString('he-IL')}
        </span>
        {notes.length > 0 && (
          <span className={cx(s.kpiNote, 'flex flex-wrap gap-x-2')}>
            {notes.map((note, index) => (
              <span key={note} className={index === 0 && counts && counts.hot > 0 ? s.warnText : undefined}>
                {note}
              </span>
            ))}
          </span>
        )}
        <span aria-hidden="true" className={s.kpiIcon}>
          <UserX className="h-[18px] w-[18px]" />
        </span>
      </button>

      {open && (
        <div id={panelId} style={{ borderTop: '1px solid var(--line-2)' }}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--line-2)' }}>
            <button
              type="button"
              aria-pressed={hot}
              onClick={() => setHot((value) => !value)}
              className={cx(s.chipbtn, hot && s.on)}
              title="מתעניינים בניסיון או בהרשמה, או שהחיוב שלהם נכשל"
            >
              <Flame aria-hidden="true" />
              רק חמים
            </button>
            <div role="group" aria-label="טווח ימים" className={s.seg}>
              {UNREGISTERED_DAY_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={days === range}
                  onClick={() => setDays(range)}
                  className={cx(days === range && s.on)}
                >
                  {range} ימים
                </button>
              ))}
            </div>
            {/* The counts describe the whole range whatever the filter (the server's rule), so under "רק חמים" they read as a share. */}
            {listCounts && (
              <span className={cx(s.t2, 'ms-auto font-semibold')}>
                {hot
                  ? `${listCounts.hot.toLocaleString('he-IL')} חמים מתוך ${listCounts.total.toLocaleString('he-IL')} בטווח`
                  : `${listCounts.total.toLocaleString('he-IL')} בטווח · ${listCounts.hot.toLocaleString('he-IL')} חמים`}
              </span>
            )}
          </div>

          {list.isLoading ? (
            <RowsSkeleton />
          ) : list.isError ? (
            <ErrorState title="לא הצלחנו לטעון את הרשימה" text={readableError(list.error, '')} onRetry={() => void list.refetch()} tight />
          ) : !list.data?.leads.length ? (
            <EmptyState
              icon={<UserX />}
              title={hot ? 'אין לידים חמים בטווח הזה' : 'אין מי ששאל ולא נרשם בטווח הזה'}
              text={`${days} הימים האחרונים. מי שנרשם, לקוח קודם, או שסומן "נרשם" / "לא רלוונטי" — לא ברשימה.`}
              tight
            />
          ) : (
            <ul className={s.list}>
              {list.data.leads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onOpen={onOpenChat} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
