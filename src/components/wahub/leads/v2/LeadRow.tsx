'use client';

import { Bot, CalendarClock, ChevronLeft, PauseCircle, UserRound } from 'lucide-react';
import { leadChips, leadTitle, nextStepLine, sinceText, type NextStepLine } from '@/lib/wahub/leadsV2';
import type { WahubLeadRow } from '@/types/wahub';
import { DemoTag } from '../../shared/bits';
import { cx } from '../../shared/tones';
import l from './leads.module.css';

const NEXT_CLASS: Record<NextStepLine['tone'], string> = {
  office: l.nextOffice,
  bot: l.nextBot,
  held: l.nextHeld,
  quiet: l.nextQuiet,
};

/** The small mark before the line: whose move it is. Never the colour alone — the words say it too. */
export function NextIcon({ line }: { line: NextStepLine }) {
  if (line.tone === 'office') return <UserRound aria-hidden="true" />;
  if (line.tone === 'held') return <PauseCircle aria-hidden="true" />;
  if (line.tone === 'bot') return line.dated ? <CalendarClock aria-hidden="true" /> : <Bot aria-hidden="true" />;
  return null;
}

/** "הצעד הבא" as it stands in a row: who, what and when, on the ground of whose move it is. */
export function NextStep({ line }: { line: NextStepLine }) {
  return (
    <span className={cx(l.next, NEXT_CLASS[line.tone])} title={line.detail || undefined} data-next={line.tone}>
      <NextIcon line={line} />
      <span dir="auto">{line.text}</span>
    </span>
  );
}

interface LeadRowProps {
  lead: WahubLeadRow;
  now: Date;
  /** The owner's sending switch, when it is known: it words a step that was due and did not go out. */
  sendingOn: boolean | null;
  /** The details of this lead are the ones open. */
  selected: boolean;
  /** The row stands in the closed list: with nobody's step, it says how the lead ended. */
  closed?: boolean;
  onOpen: (id: number) => void;
}

/**
 * One lead in one row (docs/WAHUB-CONTRACT-LEADS-V2.md, ה): the name, the one
 * sentence that says why they are a lead, what the bot understood as quiet
 * words, and — the second thing the eye lands on — the next step. The whole
 * row is one button; everything else about the lead is a press away.
 */
export default function LeadRow({ lead, now, sendingOn, selected, closed, onOpen }: LeadRowProps) {
  const chips = leadChips(lead.chips);
  const since = sinceText(lead.since ?? lead.last_message_at, now);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(lead.contact_id)}
        aria-current={selected ? 'true' : undefined}
        data-lead={lead.contact_id}
        className={cx(l.row, selected && l.rowOn)}
      >
        <span className={l.rowMain}>
          <span className={l.rowTop}>
            <span className={l.name} dir="auto">
              {leadTitle(lead)}
            </span>
            {lead.is_demo && <DemoTag size="row" />}
          </span>
          <span className={cx(l.summary, !lead.summary && l.summaryNone)} dir="auto" title={lead.summary || undefined}>
            {lead.summary || 'הבוט עוד לא סיכם את השיחה'}
          </span>
          {chips.length > 0 && (
            <span className={l.chips}>
              {chips.map((chip) => (
                <span key={chip.key} className={l.chip} dir="auto">
                  {chip.text}
                </span>
              ))}
            </span>
          )}
        </span>
        <NextStep line={nextStepLine(lead, now, sendingOn, closed || undefined)} />
        {/* Always there, so the columns of every row line up — with or without a time to say. */}
        <span className={l.since}>{since}</span>
        <ChevronLeft className={l.chev} aria-hidden="true" />
      </button>
    </li>
  );
}
