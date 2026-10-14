'use client';

import { leadDaysText, leadStageLabel, leadTone, temperatureLabel } from '@/lib/wahub/leadStage';
import type { WahubLead, WahubLeadTemperature } from '@/types/wahub';
import { StageHelp, stageHelpText } from '../shared/StageHelp';
import { PILL_TONE, cx } from '../shared/tones';
import s from '../wahub.module.css';

/**
 * The small pieces every screen of "מצב הליד" shares: the state's tag, the
 * temperature dot, and the block that says why and what to do.
 */

/** The state as a tag: its name on the colour of its group. `size="row"` is the small one of a list row. */
export function LeadStageTag({
  lead,
  needsHuman = false,
  size = 'pill',
}: {
  lead: Pick<WahubLead, 'stage' | 'stage_label' | 'group'>;
  /** The person asked for a human: "שאל ולא קיבל תשובה" then wears the red of that request. */
  needsHuman?: boolean;
  size?: 'pill' | 'row';
}) {
  const label = leadStageLabel(lead);
  const tag = (
    <span
      className={cx(size === 'row' ? s.rowTag : s.pill, PILL_TONE[leadTone(lead, needsHuman)], s.stageTag)}
      title={size === 'row' ? stageHelpText(lead.stage) || undefined : undefined}
    >
      {label}
    </span>
  );
  // "מה זה אומר?" (the owner, 14.10.2026). In a row of the list a press opens the conversation, and the row cuts
  // whatever opens from it: there the words are the tag's title, for a mouse resting on it, and the bubble is in the
  // contact's card, one press away. Everywhere else the tag opens the bubble — around the tag, which cuts its own text.
  if (size === 'row') return tag;
  return (
    <StageHelp stage={lead.stage} title={label}>
      {tag}
    </StageHelp>
  );
}

const TEMPERATURE_CLASS: Record<Exclude<WahubLeadTemperature, ''>, string> = {
  hot: s.tempHot,
  warm: s.tempWarm,
  cold: s.tempCold,
};

/** A small dot for how warm the lead is. The word is in its title and for a screen reader — never the colour alone. */
export function TemperatureDot({ temperature }: { temperature: WahubLeadTemperature | undefined | null }) {
  const label = temperatureLabel(temperature);
  if (!temperature || !label) return null;
  return <span role="img" aria-label={label} title={label} className={cx(s.tempDot, TEMPERATURE_CLASS[temperature])} />;
}

/**
 * "הכיוון": what to do — the line the eye should land on, and so the first and
 * the largest — then the state, and one sentence why. Used at the top of the
 * contact's card. With nothing to do, the state leads and a quiet line says so.
 */
export function LeadStateBlock({ lead, needsHuman, now }: { lead: WahubLead; needsHuman: boolean; now: Date }) {
  const days = leadDaysText(lead, now);
  return (
    <div className={s.stateBox}>
      {lead.next_step && (
        <p className={cx(s.stateNext, lead.group === 'act' && s.stateNextAct)}>
          <span className={s.stateNextLabel}>מה עושים</span>
          <strong dir="auto">{lead.next_step}</strong>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <LeadStageTag lead={lead} needsHuman={needsHuman} />
        {days && <span className={s.stateDays}>{days}</span>}
        <TemperatureDot temperature={lead.temperature} />
      </div>
      {lead.reason && (
        <p className={s.stateWhy} dir="auto">
          {lead.reason}
        </p>
      )}
      {!lead.next_step && lead.group === 'wait' && <p className={s.stateIdle}>אין מה לעשות עכשיו.</p>}
    </div>
  );
}
