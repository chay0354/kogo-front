'use client';

import { nextStepHelp, type StageHelp as StageHelpWords } from '@/lib/wahub/stageHelp';
import { HoverHelp } from '../../shared/StageHelp';
import { Bot, CalendarClock, ChevronLeft, PauseCircle, UserRound } from 'lucide-react';
import { israelToday } from '@/lib/wahub/format';
import { leadChips, leadPhoneText, leadTitle, nextStepLine, saysMore, sinceText, type NextStepLine } from '@/lib/wahub/leadsV2';
import { optedOutOf, saysOptedOut } from '@/lib/wahub/optOut';
import { leadWaitTag } from '@/lib/wahub/overdue';
import type { WahubLeadRow } from '@/types/wahub';
import { DemoTag } from '../../shared/bits';
import { OptOutMark, WaitMark } from '../../shared/MarkParts';
import k from '../../marks.module.css';
import { FoundLines, MarkedName, PlaceTag } from '../../shared/SearchParts';
import { cx } from '../../shared/tones';
import l from './leads.module.css';
import { FreedLine, FutureLine, WaitingLine } from './WaitingBits';

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
export function NextStep({ line, help = null }: { line: NextStepLine; help?: StageHelpWords | null }) {
  // With words behind it, a mouse resting on the line opens them (a press still opens the lead); without, the
  // line's own detail is its title, as it always was.
  return (
    <HoverHelp help={help} className={cx(l.next, NEXT_CLASS[line.tone])} data-next={line.tone} {...(help ? {} : { title: line.detail || undefined })}>
      <NextIcon line={line} />
      <span dir="auto">{line.text}</span>
    </HoverHelp>
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
  /**
   * What was searched for, while the row is a result of a search through every list
   * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1.3): the row then marks what matched, says which list the lead
   * stands in, and why it was found. Empty: the row is the one it always was.
   */
  query?: string;
  onOpen: (id: number) => void;
}

/**
 * One lead in one row (docs/WAHUB-CONTRACT-LEADS-V2.md, ה): the name, the one
 * sentence that says why they are a lead, what the bot understood as quiet
 * words, and — the second thing the eye lands on — the next step. The whole
 * row is one button; everything else about the lead is a press away.
 *
 * The waiting list and a future lead (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ה):
 * a place that was freed is the row's headline, in place of a sentence that
 * would only say it again; a lead that still waits shows its exact lesson and
 * since when; a future lead carries its mark and its reason.
 *
 * Since the evening of 13.10.2026 (ט): a lead that waits for a person says for
 * how long, in the office's own hours, beside its name — pulsing softly past
 * three of them; and "ביקש הסר" is marked, unless the row's own words already
 * say it ("ביקש הסר — הבוט לא חוזר אליו").
 */
export default function LeadRow({ lead, now, sendingOn, selected, closed, query = '', onOpen }: LeadRowProps) {
  const chips = leadChips(lead.chips);
  const since = sinceText(lead.since ?? lead.last_message_at, now);
  const waiting = lead.waiting_list ?? null;
  const freed = waiting?.status === 'freed' ? waiting : null;
  const future = lead.future ?? null;
  const next = nextStepLine(lead, now, sendingOn, closed || undefined);
  const wait = closed ? null : leadWaitTag(lead, now);
  const optedOut = optedOutOf(lead);
  // Nothing is said twice: the next step, or the sentence, of somebody who asked out usually says so itself.
  const outMark = optedOut && !saysOptedOut(next.text, next.detail, lead.summary) ? optedOut : null;
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
              <MarkedName name={leadTitle(lead)} query={query} />
            </span>
            {lead.is_demo && <DemoTag size="row" />}
            {wait && <WaitMark tag={wait} className={k.rowWait} />}
            {outMark && <OptOutMark opted={outMark} now={now} short />}
            {/* A result of a search through every list says which one it stands in. */}
            {query && lead.list_label && <PlaceTag label={lead.list_label} tone={lead.list === 'office' ? 'gold' : 'muted'} />}
          </span>
          <FoundLines query={query} phone={leadPhoneText(lead.phone)} phoneShown={!lead.name} found={lead.found_by} />
          {freed && <FreedLine mark={freed} />}
          {/* Under a freed place the sentence is drawn only when it says more than the headline. */}
          {(!freed || saysMore(lead.summary, freed.title)) && (
            <span className={cx(l.summary, !lead.summary && l.summaryNone)} dir="auto" title={lead.summary || undefined}>
              {lead.summary || 'הבוט עוד לא סיכם את השיחה'}
            </span>
          )}
          {waiting && !freed && <WaitingLine mark={waiting} now={now} />}
          {future && <FutureLine future={future} today={israelToday(now)} now={now} said={[lead.summary]} />}
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
        <NextStep line={next} help={nextStepHelp(lead, next)} />
        {/* Always there, so the columns of every row line up — with or without a time to say. */}
        <span className={l.since}>{since}</span>
        <ChevronLeft className={l.chev} aria-hidden="true" />
      </button>
    </li>
  );
}
