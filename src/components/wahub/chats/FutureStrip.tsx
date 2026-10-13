'use client';

import { useState } from 'react';
import { AlertTriangle, Bot, CalendarClock, Check, ChevronDown } from 'lucide-react';
import { BOT_STILL_ANSWERS, futureChip, type FutureChip } from '@/lib/wahub/futureLeads';
import type { WahubFuture } from '@/types/wahub';
import f from '../future.module.css';
import { Spinner } from '../shared/bits';
import { Fold } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

export interface FutureStripViewProps {
  chip: FutureChip;
  /** The bot is silenced for this person. False: one small line says it still answers. */
  muted: boolean;
  /** The three actions are on show. */
  open: boolean;
  /** "טופל" is on its way. */
  doneBusy: boolean;
  onToggle: () => void;
  /** "טופל" — the conversation's ✓. */
  onDone: () => void;
  /** "לדחות" — the form of "ליד עתידי שלי", for another day. */
  onPostpone: () => void;
  /** "להחזיר לבוט" — the bot reads the conversation and decides how to go on. */
  onToBot: () => void;
}

/**
 * The chip of a future lead, at the head of its conversation
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.5, ה): "ליד עתידי · 1.12 · הסיבה · של
 * מי" — a title first, and what can be done with it a press away: "טופל",
 * "לדחות", "להחזיר לבוט". Quiet while it waits for its day; gold once the day
 * has come or the customer wrote before it — and then it stands open, because
 * that is when it is acted on.
 */
export function FutureStripView({ chip, muted, open, doneBusy, onToggle, onDone, onPostpone, onToBot }: FutureStripViewProps) {
  const rest = [chip.when, chip.reason, chip.by].filter(Boolean).join(' · ');
  return (
    <div className={cx(f.strip, chip.loud && f.stripLoud, open && f.stripOpen)} role="status" aria-label={chip.label}>
      <button type="button" onClick={onToggle} aria-expanded={open} className={f.stripHead}>
        <CalendarClock aria-hidden="true" />
        <span className={f.stripLine} dir="auto">
          <strong>{chip.label}</strong>
          {rest ? ` · ${rest}` : ''}
        </span>
        <ChevronDown className={f.stripChevron} aria-hidden="true" />
      </button>
      {/* The bot was not silenced: said under the title whether or not the chip is open — it is not a detail. */}
      {!muted && (
        <p className={cx(f.warnLine, f.stripWarn)}>
          <AlertTriangle aria-hidden="true" />
          <span>{BOT_STILL_ANSWERS}.</span>
        </p>
      )}
      <Fold open={open} innerClassName={f.stripBody}>
        <div className={f.stripActs} role="group" aria-label="פעולות על הליד העתידי">
          <button type="button" onClick={onDone} disabled={doneBusy} className={cx(s.btn, s.btnSm, s.btnP)}>
            {doneBusy ? <Spinner className="h-3.5 w-3.5" /> : <Check aria-hidden="true" />}
            טופל
          </button>
          <button type="button" onClick={onPostpone} disabled={doneBusy} className={cx(s.btn, s.btnSm)}>
            <CalendarClock aria-hidden="true" />
            לדחות
          </button>
          <button type="button" onClick={onToBot} disabled={doneBusy} className={cx(s.btn, s.btnSm)}>
            <Bot aria-hidden="true" />
            להחזיר לבוט
          </button>
        </div>
      </Fold>
    </div>
  );
}

interface FutureStripProps {
  future: WahubFuture;
  /** Today in Israel, YYYY-MM-DD. */
  today: string;
  now: Date;
  doneBusy: boolean;
  onDone: () => void;
  onPostpone: () => void;
  onToBot: () => void;
}

/**
 * The chip with what it keeps: whether its actions are on show. It opens by
 * itself when the lead needs handling (its day came, the customer wrote), and
 * folds again when it goes back to waiting; a press in between is the person's own.
 */
export default function FutureStrip({ future, today, now, doneBusy, onDone, onPostpone, onToBot }: FutureStripProps) {
  const chip = futureChip(future, today, now);
  const [held, setHeld] = useState({ loud: chip.loud, open: chip.loud });
  if (held.loud !== chip.loud) setHeld({ loud: chip.loud, open: chip.loud });
  const open = held.loud === chip.loud ? held.open : chip.loud;
  return (
    <FutureStripView
      chip={chip}
      muted={future.muted}
      open={open}
      doneBusy={doneBusy}
      onToggle={() => setHeld((prev) => ({ ...prev, open: !prev.open }))}
      onDone={onDone}
      onPostpone={onPostpone}
      onToBot={onToBot}
    />
  );
}
