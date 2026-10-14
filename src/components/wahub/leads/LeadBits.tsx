'use client';

import { leadDaysText, leadStageLabel, leadTone, temperatureLabel } from '@/lib/wahub/leadStage';
import type { WahubLead, WahubLeadTemperature } from '@/types/wahub';
import { StageHelp } from '../shared/StageHelp';
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
  return (
    <span className={cx(size === 'row' ? s.rowTag : s.pill, PILL_TONE[leadTone(lead, needsHuman)], s.stageTag)}>
      {/* "מה זה אומר?": a bubble on the state — in a row of the list too, where a press on it opens only the bubble. */}
      <StageHelp stage={lead.stage} inRow={size === 'row'} title={leadStageLabel(lead)}>
        {leadStageLabel(lead)}
      </StageHelp>
    </span>
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
