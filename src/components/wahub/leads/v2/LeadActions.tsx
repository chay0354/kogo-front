'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { CalendarClock, MessagesSquare } from 'lucide-react';
import {
  OWNER_ACTION_LABELS,
  isValidSnooze,
  leadActions,
  leadBotBlocked,
  leadTitle,
  snoozeDates,
  type LeadChange,
} from '@/lib/wahub/leadsV2';
import type { WahubLeadRow } from '@/types/wahub';
import { InlineConfirm, Spinner } from '../../shared/bits';
import CustomerCardLink from '../../shared/CustomerCardLink';
import { BlockedByOptOut } from '../../shared/MarkParts';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import l from './leads.module.css';

/** What stands where the buttons are: the buttons themselves, or one of the two questions. */
export type LeadActionsMode = 'idle' | 'snooze' | 'remove';

export interface LeadActionsViewProps {
  lead: WahubLeadRow;
  /** The lead was read from the closed list: it can only be opened or brought back, whatever its state is called. */
  closed?: boolean;
  now: Date;
  /** The change that is on its way for this lead, if any: its button says so, and nothing else can be pressed. */
  busy: LeadChange['kind'] | null;
  mode: LeadActionsMode;
  /** "דחה למועד": the day chosen (YYYY-MM-DD) and the note beside it. */
  until: string;
  note: string;
  onMode: (mode: LeadActionsMode) => void;
  onUntil: (value: string) => void;
  onNote: (value: string) => void;
  onOpenChat: () => void;
  onChange: (change: LeadChange) => void;
  /**
   * The customer's card in the customers section, for a lead Kogo knows (lib/wahub/customerCard.ts). Absent or
   * null — nobody identified, or the details not read yet — and "לכרטיס הלקוח" is not drawn.
   */
  customerCard?: string | null;
  /**
   * The screen around these buttons already says "ביקש הסר" in words of its own (the lead's sentence, its next
   * step): the line under a locked "החזר לבוט" then does not say it again.
   */
  optOutSaid?: boolean;
}

/**
 * What can be done with a lead — and nothing more than the contract lists (ה):
 * open the conversation; take it or hand it back to the bot; put it off to a
 * day (a date and a note); and "לא רלוונטי", which asks first and then writes
 * `deleted`. A closed lead can only be opened or brought back.
 *
 * For somebody Kogo knows there is one more way out, beside "פתח שיחה": "לכרטיס
 * הלקוח" (owner, 13.10.2026). The two ways out share the first row; what
 * changes the lead shares the second.
 *
 * Somebody who asked out ("ביקש הסר", docs/WAHUB-CONTRACT-FUTURE-LEADS.md,
 * ט.1.6): the bot does not come back to them, so "החזר לבוט" is locked and one
 * plain line under the buttons says why, and what can be done instead.
 *
 * The two that ask something ask it here, in place of the buttons — the
 * browser's own boxes are not used anywhere in this section. Drawn from what
 * it is given; what is open and what was typed is kept by LeadActions.
 */
export function LeadActionsView({
  lead,
  closed,
  now,
  busy,
  mode,
  until,
  note,
  onMode,
  onUntil,
  onNote,
  onOpenChat,
  onChange,
  customerCard = null,
  optOutSaid = false,
}: LeadActionsViewProps) {
  const can = leadActions(lead, closed || undefined);
  // Somebody who asked out: the bot does not come back to them, and the press that would send it is locked.
  const botBlocked = leadBotBlocked(lead, closed || undefined);
  const dates = snoozeDates(now);
  const working = busy !== null;
  const untilOk = isValidSnooze(until, now);
  // Escape lets go of the question that is open — and only of it: the details behind it stay.
  const backOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || working) return;
    event.preventDefault();
    onMode('idle');
  };

  if (mode === 'snooze' && can.snooze) {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (untilOk && !working) onChange({ kind: 'snooze', until, note: note.trim() });
    };
    return (
      <form className={cx(l.actions, l.snooze)} onSubmit={submit} onKeyDown={backOnEscape} aria-label="דחייה למועד">
        <p className={l.snoozeTitle}>מתי לחזור?</p>
        <div className={l.snoozeFields}>
          <label className={s.fieldLabel}>
            תאריך
            <input type="date" className={s.field} value={until} min={dates.min} required onChange={(event) => onUntil(event.target.value)} />
          </label>
          <label className={s.fieldLabel}>
            הערה (לא חובה)
            <input
              type="text"
              className={s.field}
              value={note}
              maxLength={200}
              placeholder="למשל: אחרי החגים"
              autoComplete="off"
              onChange={(event) => onNote(event.target.value)}
            />
          </label>
        </div>
        <div className={l.snoozeButtons}>
          <button type="submit" disabled={working || !untilOk} className={cx(s.btn, s.btnP)}>
            {busy === 'snooze' && <Spinner />}
            דחה למועד
          </button>
          <button type="button" disabled={working} onClick={() => onMode('idle')} className={s.btn}>
            ביטול
          </button>
        </div>
      </form>
    );
  }

  if (mode === 'remove' && can.remove) {
    return (
      <div className={l.actions} onKeyDown={backOnEscape}>
        <InlineConfirm
          danger
          busy={busy === 'close'}
          text={
            <>
              להוציא את <strong dir="auto">{leadTitle(lead)}</strong> מהלידים? הבוט לא יפנה יותר. אפשר להחזיר אחר כך מ״נסגרו״.
            </>
          }
          confirmLabel="כן, להוציא"
          onConfirm={() => onChange({ kind: 'close', reason: 'deleted' })}
          onCancel={() => onMode('idle')}
        />
      </div>
    );
  }

  // A closed lead has one action or two; they share a row rather than leave it half empty.
  const others = [can.owner, can.snooze, can.remove, can.reopen].filter(Boolean).length;
  // With the way to the customer's card: the two ways out side by side, and whatever else there is under them.
  const shape = customerCard
    ? others === 0
      ? l.actGridTwo
      : l.actGridCard
    : cx(others === 0 && l.actGridOne, others === 1 && l.actGridTwo);
  return (
    <div className={l.actions}>
      <div className={cx(l.actGrid, shape)} role="group" aria-label="פעולות">
        <button type="button" onClick={onOpenChat} className={cx(s.btn, s.btnP, l.act, l.actMain)}>
          <MessagesSquare aria-hidden="true" />
          פתח שיחה
        </button>
        {customerCard && <CustomerCardLink href={customerCard} className={cx(s.btn, l.act, l.actCard)} />}
        {can.owner && (
          <button
            type="button"
            disabled={working || Boolean(botBlocked)}
            title={botBlocked || undefined}
            onClick={() => onChange({ kind: 'owner', owner: can.owner as 'office' | 'bot' })}
            className={cx(s.btn, l.act)}
          >
            {busy === 'owner' && <Spinner />}
            {OWNER_ACTION_LABELS[can.owner]}
          </button>
        )}
        {can.snooze && (
          <button type="button" disabled={working} onClick={() => onMode('snooze')} className={cx(s.btn, l.act)}>
            <CalendarClock aria-hidden="true" />
            דחה למועד
          </button>
        )}
        {can.remove && (
          <button type="button" disabled={working} onClick={() => onMode('remove')} className={cx(s.btn, l.act)}>
            לא רלוונטי
          </button>
        )}
        {can.reopen && (
          <button type="button" disabled={working} onClick={() => onChange({ kind: 'reopen' })} className={cx(s.btn, l.act)}>
            {busy === 'reopen' && <Spinner />}
            החזר לרשימה
          </button>
        )}
      </div>
      {botBlocked && <BlockedByOptOut said={optOutSaid} />}
    </div>
  );
}

interface LeadActionsProps {
  lead: WahubLeadRow;
  closed?: boolean;
  now: Date;
  busy: LeadChange['kind'] | null;
  /** What is open to begin with — the buttons, unless a test asks for one of the two questions. */
  initialMode?: LeadActionsMode;
  onOpenChat: () => void;
  /** Resolves true once the change was saved; the question that asked for it then closes. */
  onChange: (change: LeadChange) => Promise<boolean> | void;
  /** The customer's card, for a lead Kogo knows; null or absent — no button. */
  customerCard?: string | null;
  /** The screen already says "ביקש הסר" in its own words: the line under a locked press does not repeat it. */
  optOutSaid?: boolean;
}

/** The actions of one lead, with what they keep while a question is open: which one, the day chosen, the note. */
export default function LeadActions({ lead, closed, now, busy, initialMode = 'idle', onOpenChat, onChange, customerCard, optOutSaid }: LeadActionsProps) {
  const [mode, setMode] = useState<LeadActionsMode>(initialMode);
  const [until, setUntil] = useState(() => snoozeDates(now).suggested);
  const [note, setNote] = useState('');

  async function change(what: LeadChange) {
    const saved = await onChange(what);
    // A change the server refused leaves its question open, with what was typed still in it.
    if (saved !== false) setMode('idle');
  }

  return (
    <LeadActionsView
      lead={lead}
      closed={closed}
      now={now}
      busy={busy}
      mode={mode}
      until={until}
      note={note}
      onMode={setMode}
      onUntil={setUntil}
      onNote={setNote}
      onOpenChat={onOpenChat}
      onChange={(what) => void change(what)}
      customerCard={customerCard}
      optOutSaid={optOutSaid}
    />
  );
}
