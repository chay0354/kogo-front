'use client';

import { useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, Check, Hourglass } from 'lucide-react';
import {
  BOT_STILL_ANSWERS,
  futureChip,
  isActiveEntry,
  sortEntries,
  waitingEntryFacts,
  waitingSinceText,
} from '@/lib/wahub/futureLeads';
import type { WaitingAction } from '@/lib/wahub/futureLeadsApi';
import { saysMore } from '@/lib/wahub/leadsV2';
import type { WahubFuture, WahubWaitingEntry, WahubWaitingMark } from '@/types/wahub';
import { InlineConfirm, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import l from './leads.module.css';

/**
 * The waiting list and a future lead as the leads tab shows them
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.3, ה): on a row — the exact lesson
 * and since when, or "התפנה מקום ב…" as the row's headline; in a lead's details
 * — the same headline with the two things that can be done about it, and every
 * entry of this person.
 */

/** Which entry a press is being saved for, and what was pressed. */
export interface WaitingBusy {
  entryId: number;
  action: WaitingAction;
}

// ---------------------------------------------------------------------------
// On a row
// ---------------------------------------------------------------------------

/** "הבוט מטפל": the exact lesson, and since when — quietly, under the row's sentence. */
export function WaitingLine({ mark, now }: { mark: WahubWaitingMark; now: Date }) {
  const since = waitingSinceText(mark.since, now);
  const rest = [since, mark.more > 0 ? `ועוד ${mark.more}` : ''].filter(Boolean).join(' · ');
  return (
    <span className={l.wait}>
      <Hourglass aria-hidden="true" />
      <span dir="auto">
        <strong>{mark.label || mark.title}</strong>
        {rest ? ` · ${rest}` : ''}
      </span>
    </span>
  );
}

/** "מחכים לך": a place was freed — the row's headline, in the server's own words. */
export function FreedLine({ mark }: { mark: WahubWaitingMark }) {
  return (
    <span className={l.freed}>
      <BellRing aria-hidden="true" />
      <span dir="auto">{mark.title}</span>
    </span>
  );
}

/** A future lead: its mark — gold once its day has come or the customer wrote — with the reason and whose it is. */
export function FutureLine({ future, today, now, said = [] }: { future: WahubFuture; today: string; now: Date; said?: string[] }) {
  const chip = futureChip(future, today, now);
  const why = [saysMore(chip.reason, ...said) ? chip.reason : '', chip.by].filter(Boolean).join(' · ');
  return (
    <span className={l.futureLine}>
      <span className={cx(l.futureMark, chip.loud && l.futureMarkLoud)}>
        <CalendarClock aria-hidden="true" />
        {chip.label} · {chip.short}
      </span>
      {why && <span dir="auto">{why}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// In the details
// ---------------------------------------------------------------------------

export interface WaitingActionsViewProps {
  /** Whose entry it is, for the question. */
  name: string;
  /** The lesson, for the question. */
  lesson: string;
  /** The press that is on its way for this entry, if any. */
  busy: WaitingAction | null;
  /** "להסיר מהרשימה" was pressed and is being asked about. */
  asking: boolean;
  onAsk: (asking: boolean) => void;
  onAct: (action: WaitingAction) => void;
}

/**
 * The two things that can be done once a place was freed: "טופל", and "להסיר
 * מהרשימה" — which asks first, because nothing on this screen puts a person
 * back on the list.
 */
export function WaitingActionsView({ name, lesson, busy, asking, onAsk, onAct }: WaitingActionsViewProps) {
  if (asking) {
    return (
      <InlineConfirm
        danger
        busy={busy === 'remove'}
        text={
          <>
            להסיר את <strong dir="auto">{name}</strong> מרשימת ההמתנה{lesson ? <> של <span dir="auto">{lesson}</span></> : null}? אי אפשר להחזיר מכאן.
          </>
        }
        confirmLabel="כן, להסיר"
        onConfirm={() => onAct('remove')}
        onCancel={() => onAsk(false)}
      />
    );
  }
  const working = busy !== null;
  return (
    <div className={l.freedActs} role="group" aria-label="פעולות על המקום שהתפנה">
      <button type="button" disabled={working} onClick={() => onAct('handled')} className={cx(s.btn, s.btnP)}>
        {busy === 'handled' ? <Spinner /> : <Check aria-hidden="true" />}
        טופל
      </button>
      <button type="button" disabled={working} onClick={() => onAsk(true)} className={s.btn}>
        להסיר מהרשימה
      </button>
    </div>
  );
}

interface WaitingActionsProps {
  entryId: number;
  name: string;
  lesson: string;
  busy: WaitingBusy | null;
  onAct: (entryId: number, action: WaitingAction) => void;
}

/** The two actions of one entry, with what they keep: whether the question is open. */
export function WaitingActions({ entryId, name, lesson, busy, onAct }: WaitingActionsProps) {
  const [asking, setAsking] = useState(false);
  return (
    <WaitingActionsView
      name={name}
      lesson={lesson}
      busy={busy && busy.entryId === entryId ? busy.action : null}
      asking={asking}
      onAsk={setAsking}
      onAct={(action) => onAct(entryId, action)}
    />
  );
}

/** A place was freed: the headline, and the two actions — the first thing under "מה קורה עכשיו". */
export function FreedBlock({
  mark,
  name,
  busy,
  onAct,
}: {
  mark: WahubWaitingMark;
  name: string;
  busy: WaitingBusy | null;
  /** Absent: the headline alone (the screen cannot act on entries). */
  onAct?: (entryId: number, action: WaitingAction) => void;
}) {
  return (
    <section className={l.freedBox} aria-label="התפנה מקום">
      <p className={l.freedTitle}>
        <BellRing aria-hidden="true" />
        <span dir="auto">{mark.title}</span>
      </p>
      {mark.child && (
        <p className={l.freedChild} dir="auto">
          {mark.child}
        </p>
      )}
      {onAct && mark.entry_id > 0 && (
        <WaitingActions key={mark.entry_id} entryId={mark.entry_id} name={name} lesson={mark.label} busy={busy} onAct={onAct} />
      )}
    </section>
  );
}

/**
 * Every waiting-list entry of this person — a freed place first, then whoever
 * still waits, then what was closed: the lesson, and under it where the entry stands. A further entry whose place was freed carries its
 * own two actions; the first one's are in the block at the head of the details.
 */
export function WaitingEntries({
  entries,
  now,
  name,
  headId,
  busy,
  onAct,
}: {
  entries: WahubWaitingEntry[];
  now: Date;
  name: string;
  /** The entry the block at the head of the details already acts on. */
  headId: number | null;
  busy: WaitingBusy | null;
  onAct?: (entryId: number, action: WaitingAction) => void;
}) {
  return (
    <ul className={l.entries}>
      {sortEntries(entries).map((entry) => {
        const active = isActiveEntry(entry);
        return (
          <li key={entry.id} className={cx(l.entry, !active && l.entryOff, entry.status === 'freed' && l.entryFreed)}>
            <p className={l.entryLesson} dir="auto">
              {entry.lesson_label || entry.title}
            </p>
            <p className={l.entryFacts}>{waitingEntryFacts(entry, now).join(' · ')}</p>
            {onAct && entry.status === 'freed' && entry.id !== headId && (
              <WaitingActions entryId={entry.id} name={name} lesson={entry.lesson_label} busy={busy} onAct={onAct} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A future lead in the details: its mark, the reason in full, and — only when it is so — that the bot still answers. */
export function FutureBlock({ future, today, now, said }: { future: WahubFuture; today: string; now: Date; said: string[] }) {
  const chip = futureChip(future, today, now);
  return (
    <section className={l.dSect} aria-label={chip.label}>
      <p className={l.futureLine}>
        <span className={cx(l.futureMark, chip.loud && l.futureMarkLoud)}>
          <CalendarClock aria-hidden="true" />
          {chip.label} · {chip.when}
        </span>
        {chip.by && <span dir="auto">{chip.by}</span>}
      </p>
      {saysMore(chip.reason, ...said) && (
        <p className={cx(l.dText, 'mt-2')} dir="auto">
          {chip.reason}
        </p>
      )}
      {!future.muted && (
        <p className={l.botAnswers}>
          <AlertTriangle aria-hidden="true" />
          {BOT_STILL_ANSWERS}.
        </p>
      )}
    </section>
  );
}
