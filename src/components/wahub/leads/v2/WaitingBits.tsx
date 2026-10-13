'use client';

import { useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, Check, ChevronLeft, Hourglass, MessagesSquare, Send } from 'lucide-react';
import {
  BOT_STILL_ANSWERS,
  futureChip,
  isActiveEntry,
  sortEntries,
  waitingEntryFacts,
  waitingSinceText,
} from '@/lib/wahub/futureLeads';
import type { WaitingAction } from '@/lib/wahub/futureLeadsApi';
import { WAITING_LIST_TITLE, saysMore } from '@/lib/wahub/leadsV2';
import { waitersText } from '@/lib/wahub/waitingList';
import { waitingActText } from '@/lib/wahub/waitingSummary';
import {
  alreadyNotifiedText,
  entryStanding,
  knowsNotify,
  notSentText,
  notifyHowText,
  placeText,
  toldOfThisPlace,
  waitingStripText,
  type NotifyOpen,
  type NotifyStep,
} from '@/lib/wahub/waitingList';
import type { WahubFuture, WahubWaitingEntry, WahubWaitingMark } from '@/types/wahub';
import { InlineConfirm, Spinner } from '../../shared/bits';
import CustomerCardLink from '../../shared/CustomerCardLink';
import { ThinkingDots } from '../../shared/motion';
import { cx } from '../../shared/tones';
import w from '../../waiting.module.css';
import s from '../../wahub.module.css';
import l from './leads.module.css';

/**
 * The waiting list and a future lead as the leads tab shows them
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.3, ה, ז): on a row — the exact lesson
 * and since when, or "התפנה מקום ב…" as the row's headline; in a lead's details
 * — the same headline with the things that can be done about it, and every
 * entry of this person.
 */

/** Which entry a press is being saved for, and what was pressed. */
export interface WaitingBusy {
  entryId: number;
  action: WaitingAction;
}

/** What telling a customer needs from whoever holds it: the block that is open, and its three presses. */
export interface NotifyControls {
  open: NotifyOpen | null;
  onStart: (entryId: number) => void;
  onSend: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// The way in
// ---------------------------------------------------------------------------

/**
 * The way in, at the head of the leads — and the title these leads stand under: "מחכים שיתפנה מקום" (owner,
 * 13.10.2026: "'מחכים לך' זה כללי מדי… תרשום 'מחכים שיתפנה מקום', ושיישאר ככה"). How many wait; and, in green,
 * what calls on the office: how many of them need it now (a place was freed, or the customer answered) when the
 * server says so — otherwise for how many a place was freed.
 */
export function WaitingWay({
  counts,
  people = null,
  act = null,
  onOpen,
}: {
  counts: { waiting: number; freed: number };
  /**
   * How many people wait, and how many of them call on the office now — the same two numbers the day's tab
   * shows; null on a server that does not say (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.3.1), and then the
   * entries of the list are what is counted.
   */
  people?: number | null;
  act?: number | null;
  onOpen: () => void;
}) {
  const words = waitingStripText(counts);
  const total = people !== null ? waitersText(people) : words.total;
  const news = act !== null ? waitingActText(act) : words.freed;
  return (
    <button type="button" onClick={onOpen} className={cx(w.way, news && w.wayFreed)}>
      {news ? <BellRing aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
      <span className={w.wayText}>
        <strong>{WAITING_LIST_TITLE}</strong> · {total}
        {news && (
          <>
            {' · '}
            <span className={w.wayNews}>{news}</span>
          </>
        )}
      </span>
      <ChevronLeft className={w.wayGo} aria-hidden="true" />
    </button>
  );
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
// "להודיע ללקוח" — first what would go out, then the press that sends it
// ---------------------------------------------------------------------------

export interface NotifyViewProps {
  step: NotifyStep;
  now: Date;
  onSend: () => void;
  onClose: () => void;
}

/**
 * The block that opens under "להודיע ללקוח" (ז.4), in place of the entry's buttons: the wording as the customer
 * will see it, how it goes out — a plain message, or an approved template — and one press that sends it. When
 * it would not go out, the reason stands first and the press is locked. A customer who was already told of this
 * place is asked about before a second message; while a send is on its way nothing here can be pressed.
 */
export function NotifyView({ step, now, onSend, onClose }: NotifyViewProps) {
  if (step.step === 'loading') {
    return (
      <div className={w.notify} role="status" aria-live="polite">
        <p className={w.notifyWait}>
          בודקים מה ייצא ללקוח
          <ThinkingDots />
        </p>
      </div>
    );
  }

  if (step.step === 'held') {
    return (
      <div className={w.notify} role="alert">
        <p className={w.notifyHeld}>
          <AlertTriangle aria-hidden="true" />
          <span dir="auto">{step.text}</span>
        </p>
        <div className={w.acts}>
          <button type="button" onClick={onClose} className={s.btn}>
            סגור
          </button>
        </div>
      </div>
    );
  }

  const { preview, sending } = step;
  const again = preview.can ? alreadyNotifiedText(preview, now) : '';
  const how = preview.can ? notifyHowText(preview) : '';
  return (
    <div className={w.notify} role="group" aria-label="הודעה ללקוח על המקום שהתפנה">
      {/* It would not go out: why comes first — it is the answer to the press. */}
      {!preview.can && (
        <p className={w.notifyHeld} role="status">
          <AlertTriangle aria-hidden="true" />
          <span dir="auto">{notSentText(preview.blocked, preview.detail)}</span>
        </p>
      )}
      {preview.text && (
        <>
          <p className={w.notifyLabel}>{preview.can ? 'זה מה שיישלח ללקוח' : 'הנוסח שהיה נשלח'}</p>
          <blockquote className={cx(w.notifyBubble, !preview.can && w.notifyBubbleOff)} dir="auto">
            {preview.text}
          </blockquote>
        </>
      )}
      {how && <p className={w.notifyHow}>{how}</p>}
      {again && (
        <p className={w.notifyHeld} role="status">
          <AlertTriangle aria-hidden="true" />
          <span>{again}</span>
        </p>
      )}
      <div className={w.acts}>
        <button type="button" disabled={!preview.can || sending} onClick={onSend} className={cx(s.btn, s.btnP)}>
          {sending ? <Spinner /> : <Send aria-hidden="true" />}
          {again ? 'לשלוח שוב' : 'לשלוח ללקוח'}
        </button>
        <button type="button" disabled={sending} onClick={onClose} className={s.btn}>
          {preview.can ? 'ביטול' : 'סגור'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What can be done with one entry
// ---------------------------------------------------------------------------

export interface WaitingActionsViewProps {
  /** Whose entry it is, for the question. */
  name: string;
  /** The lesson, for the question. */
  lesson: string;
  /**
   * Where the entry stands. One whose place was freed can be told of it and marked as dealt with; one that only
   * waits can be taken off the list, and nothing else.
   */
  status?: 'waiting' | 'freed';
  /** The press that is on its way for this entry, if any. */
  busy: WaitingAction | null;
  /** "להסיר מהרשימה" was pressed and is being asked about. */
  asking: boolean;
  onAsk: (asking: boolean) => void;
  onAct: (action: WaitingAction) => void;
  /** "להודיע ללקוח". Absent: the server cannot tell a customer, and the button is not drawn. */
  onNotify?: () => void;
  /** The customer was already told of this place: "טופל" then leads, and telling again is a quiet second. */
  told?: boolean;
  /** The block of "להודיע ללקוח", while it is open for this entry: it stands in place of the buttons. */
  notify?: NotifyStep | null;
  onNotifySend?: () => void;
  onNotifyClose?: () => void;
  /** "פתח שיחה" — where the entry is shown away from its conversation. */
  onOpenChat?: () => void;
  /** "לכרטיס הלקוח" — where the entry is shown away from the lead's own actions. Null or absent: no button. */
  customerCard?: string | null;
  now?: Date;
}

const NOOP = () => {};

/**
 * The things that can be done with one entry of the waiting list. Once a place was freed: "להודיע ללקוח" —
 * which shows what would go out before anything is sent — "טופל", and "להסיר מהרשימה". While they only wait:
 * "להסיר מהרשימה" alone. Taking somebody off asks first: their place in the line is not kept.
 */
export function WaitingActionsView({
  name,
  lesson,
  status = 'freed',
  busy,
  asking,
  onAsk,
  onAct,
  onNotify,
  told = false,
  notify = null,
  onNotifySend = NOOP,
  onNotifyClose = NOOP,
  onOpenChat,
  customerCard = null,
  now,
}: WaitingActionsViewProps) {
  if (notify) return <NotifyView step={notify} now={now ?? new Date()} onSend={onNotifySend} onClose={onNotifyClose} />;

  if (asking) {
    return (
      <InlineConfirm
        danger
        busy={busy === 'remove'}
        text={
          <>
            להסיר את <strong dir="auto">{name}</strong> מרשימת ההמתנה{lesson ? <> של <span dir="auto">{lesson}</span></> : null}? המקום בתור לא נשמר.
          </>
        }
        confirmLabel="כן, להסיר"
        onConfirm={() => onAct('remove')}
        onCancel={() => onAsk(false)}
      />
    );
  }

  const working = busy !== null;
  const freed = status === 'freed';
  // The two ways out of the row, quietly at its end: to the conversation, and — for somebody Kogo knows — to
  // the customer's card.
  const chat = (onOpenChat || customerCard) && (
    <>
      {onOpenChat && (
        <button type="button" onClick={onOpenChat} className={cx(w.quietLink, w.quietLinkEnd)}>
          <MessagesSquare aria-hidden="true" />
          פתח שיחה
        </button>
      )}
      {customerCard && <CustomerCardLink href={customerCard} className={cx(w.quietLink, !onOpenChat && w.quietLinkEnd)} />}
    </>
  );

  if (!freed) {
    return (
      <div className={cx(w.acts, w.actsQuiet)} role="group" aria-label="פעולות על הרשומה">
        <button type="button" disabled={working} onClick={() => onAsk(true)} className={cx(s.btn, s.btnSm)}>
          להסיר מהרשימה
        </button>
        {chat}
      </div>
    );
  }

  // The one that leads is the next thing to do: tell the customer; once they were told — mark it as dealt with.
  const notifyLeads = Boolean(onNotify) && !told;
  return (
    <div className={cx(l.freedActs, w.acts)} role="group" aria-label="פעולות על המקום שהתפנה">
      {onNotify && (
        <button type="button" disabled={working} onClick={onNotify} className={cx(s.btn, notifyLeads && s.btnP)}>
          <Send aria-hidden="true" />
          להודיע ללקוח
        </button>
      )}
      <button type="button" disabled={working} onClick={() => onAct('handled')} className={cx(s.btn, !notifyLeads && s.btnP)}>
        {busy === 'handled' ? <Spinner /> : <Check aria-hidden="true" />}
        טופל
      </button>
      <button type="button" disabled={working} onClick={() => onAsk(true)} className={s.btn}>
        להסיר מהרשימה
      </button>
      {chat}
    </div>
  );
}

interface WaitingActionsProps {
  entryId: number;
  name: string;
  lesson: string;
  status?: 'waiting' | 'freed';
  busy: WaitingBusy | null;
  onAct: (entryId: number, action: WaitingAction) => void;
  /** Telling the customer. Absent — or an entry the server says nothing of telling about — and it is not offered. */
  notify?: NotifyControls;
  /** The entry as the server has it: whether the customer can be told, and whether they were. */
  entry?: WahubWaitingEntry | null;
  onOpenChat?: () => void;
  customerCard?: string | null;
  now?: Date;
}

/** The actions of one entry, with what they keep: whether the question is open. */
export function WaitingActions({ entryId, name, lesson, status = 'freed', busy, onAct, notify, entry, onOpenChat, customerCard, now }: WaitingActionsProps) {
  const [asking, setAsking] = useState(false);
  const canNotify = Boolean(notify) && status === 'freed' && knowsNotify(entry);
  const open = notify?.open && notify.open.entryId === entryId ? notify.open.step : null;
  return (
    <WaitingActionsView
      name={name}
      lesson={lesson}
      status={status}
      busy={busy && busy.entryId === entryId ? busy.action : null}
      asking={asking}
      onAsk={setAsking}
      onAct={(action) => onAct(entryId, action)}
      onNotify={canNotify ? () => notify?.onStart(entryId) : undefined}
      told={entry ? toldOfThisPlace(entry) !== null : false}
      notify={open}
      onNotifySend={notify?.onSend}
      onNotifyClose={notify?.onClose}
      onOpenChat={onOpenChat}
      customerCard={customerCard}
      now={now}
    />
  );
}

/** "הודענו ללקוח · מתי · מי", and under it "הלקוח ענה" — only once the customer was told of the place. */
export function ToldLines({ entry, now }: { entry: WahubWaitingEntry; now: Date }) {
  const standing = entryStanding(entry, now);
  if (!standing.told) return null;
  return (
    <>
      <p className={w.told}>
        <Send aria-hidden="true" />
        <span>{standing.told}</span>
      </p>
      {standing.replied && (
        <p className={cx(w.told, w.replied)}>
          <MessagesSquare aria-hidden="true" />
          <span>{standing.replied}</span>
        </p>
      )}
    </>
  );
}

/**
 * A place was freed: the headline, what is known of the entry — the child, since when they wait, their place
 * in line — whether the customer was told, and what can be done. The first thing under "מה קורה עכשיו"; the
 * entry is then not told again in the list under it.
 */
export function FreedBlock({
  mark,
  entry,
  name,
  now,
  busy,
  onAct,
  notify,
}: {
  mark: WahubWaitingMark;
  /** The same entry as the full read has it — it knows the place in line. Absent until that read lands. */
  entry?: WahubWaitingEntry | null;
  name: string;
  now: Date;
  busy: WaitingBusy | null;
  /** Absent: the headline alone (the screen cannot act on entries). */
  onAct?: (entryId: number, action: WaitingAction) => void;
  notify?: NotifyControls;
}) {
  const facts = [mark.child, waitingSinceText(mark.since, now), placeText(entry?.position)].filter(Boolean);
  return (
    <section className={l.freedBox} aria-label="התפנה מקום">
      <p className={l.freedTitle}>
        <BellRing aria-hidden="true" />
        <span dir="auto">{mark.title}</span>
      </p>
      {facts.length > 0 && (
        <p className={l.freedChild} dir="auto">
          {facts.join(' · ')}
        </p>
      )}
      {entry && (
        <div className={l.freedTold}>
          <ToldLines entry={entry} now={now} />
        </div>
      )}
      {onAct && mark.entry_id > 0 && (
        <WaitingActions
          key={mark.entry_id}
          entryId={mark.entry_id}
          name={name}
          lesson={mark.label}
          busy={busy}
          onAct={onAct}
          notify={notify}
          entry={entry}
          now={now}
        />
      )}
    </section>
  );
}

/**
 * The waiting-list entries of this person — a freed place first, then whoever
 * still waits, then what was closed: the lesson, and under it where the entry
 * stands. The entry the block at the head of the details already tells is left
 * out (each thing once). A further entry whose place was freed carries its own
 * actions; one that only waits can be taken off the list.
 */
export function WaitingEntries({
  entries,
  now,
  name,
  headId,
  busy,
  onAct,
  notify,
}: {
  entries: WahubWaitingEntry[];
  now: Date;
  name: string;
  /** The entry the block at the head of the details already acts on. */
  headId: number | null;
  busy: WaitingBusy | null;
  onAct?: (entryId: number, action: WaitingAction) => void;
  notify?: NotifyControls;
}) {
  return (
    <ul className={l.entries}>
      {sortEntries(entries.filter((entry) => entry.id !== headId)).map((entry) => {
        const active = isActiveEntry(entry);
        return (
          <li key={entry.id} className={cx(l.entry, !active && l.entryOff, entry.status === 'freed' && l.entryFreed)}>
            <p className={l.entryLesson} dir="auto">
              {entry.lesson_label || entry.title}
            </p>
            <p className={l.entryFacts}>{waitingEntryFacts(entry, now).join(' · ')}</p>
            {active && <ToldLines entry={entry} now={now} />}
            {onAct && active && (
              <div className={l.entryActs}>
                <WaitingActions
                  entryId={entry.id}
                  name={name}
                  lesson={entry.lesson_label}
                  status={entry.status === 'freed' ? 'freed' : 'waiting'}
                  busy={busy}
                  onAct={onAct}
                  notify={notify}
                  entry={entry}
                  now={now}
                />
              </div>
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
