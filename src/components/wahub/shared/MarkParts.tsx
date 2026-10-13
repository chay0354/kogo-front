'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BellOff, ChevronDown, Clock } from 'lucide-react';
import { OPT_OUT_TEXT, optOutChip, optOutFacts } from '@/lib/wahub/optOut';
import { OVERDUE_HEAD, type WaitTag } from '@/lib/wahub/overdue';
import type { WahubOptedOut } from '@/types/wahub';
import k from '../marks.module.css';
import w from '../waiting.module.css';
import s from '../wahub.module.css';
import { InlineConfirm } from './bits';
import { Fold } from './motion';
import { cx } from './tones';

/**
 * The two small marks of docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.1–ט.2, as more
 * than one screen draws them: how long a customer waits for a person — pulsing
 * softly once that is more than three office hours — and "ביקש הסר".
 */

// ---------------------------------------------------------------------------
// How long they wait
// ---------------------------------------------------------------------------

/**
 * "מחכה 3:20 שע׳". Amber, like the mark it replaces; past three office hours it breathes (marks.module.css) and
 * carries a small clock. That it is late is also said in words, for a reader who does not see the page — and
 * for a device that asked for no motion, where the mark stands still.
 */
export function WaitMark({ tag, size = 'row', className }: { tag: WaitTag; size?: 'row' | 'pill'; className?: string }) {
  return (
    <span
      className={cx(size === 'row' ? s.rowTag : s.pill, s.pWarn, tag.overdue && k.late, className)}
      title={tag.title || undefined}
      data-overdue={tag.overdue ? '' : undefined}
    >
      {tag.overdue && <Clock aria-hidden="true" />}
      {tag.label}
      {tag.overdue && <span className="sr-only"> – יותר משלוש שעות</span>}
    </span>
  );
}

/** The same words inside a line of text (the one line under the name, on a phone). */
export function WaitWords({ tag }: { tag: WaitTag }) {
  return (
    <span className={tag.overdue ? k.lateText : k.waitText} title={tag.title || undefined} data-overdue={tag.overdue ? '' : undefined}>
      {tag.label}
    </span>
  );
}

/** The quiet line over the conversations pinned to the head of the list: "מחכים יותר מ-3 שעות (2)". */
export function PinnedHead({ count }: { count: number }) {
  return (
    <li className={k.pinHead} role="presentation" data-pinned-head="">
      <Clock aria-hidden="true" />
      <span>
        {OVERDUE_HEAD} <span className={cx(s.num, k.pinCount)}>({count.toLocaleString('he-IL')})</span>
      </span>
    </li>
  );
}

/** Where the pinned conversations end and the rest of the list goes on. */
export function PinnedEnd() {
  return <li className={k.pinEnd} role="separator" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// "ביקש הסר"
// ---------------------------------------------------------------------------

/** On a row, and at the head of a conversation: "ביקש הסר · 13.10" — said, and not calling. The rest is in the card. */
export function OptOutMark({ opted, now, size = 'row', short = false }: { opted: WahubOptedOut; now: Date; size?: 'row' | 'pill'; short?: boolean }) {
  const chip = optOutChip(opted, now);
  return (
    <span className={cx(size === 'row' ? s.rowTag : s.pill, k.out)} title={chip.title} data-opted-out="">
      <BellOff aria-hidden="true" />
      {short ? chip.label : chip.text}
    </span>
  );
}

export interface OptOutCardProps {
  opted: WahubOptedOut;
  now: Date;
  /**
   * "להחזיר לתפוצה": resolves '' once the customer is back, or — in words — why not. Absent: the details are
   * read, and nothing can be pressed (the screen has no way to save it).
   */
  onBack?: () => Promise<string>;
  /** Open from the start — for a test, or a picture of the open state. */
  defaultOpen?: boolean;
  /** The question stands from the start — the same. */
  defaultAsking?: boolean;
}

/**
 * "ביקש הסר" in the contact's card: a title first — the mark itself — and on a press, when it was, where it
 * came from (their own message, or the person who marked it), what stays as it was, and the one thing that
 * can be done: "להחזיר לתפוצה". That one asks first — "הלקוח ביקש לחזור?" — because it puts a person back on
 * every broadcast. Not a switch: the list is changed by a request of the customer's, said in words.
 */
export function OptOutCard({ opted, now, onBack, defaultOpen = false, defaultAsking = false }: OptOutCardProps) {
  const [open, setOpen] = useState(defaultOpen || defaultAsking);
  const [asking, setAsking] = useState(defaultAsking);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panelId = useId();
  const chip = optOutChip(opted, now);
  const facts = optOutFacts(opted, now);
  // The request may come back after the card moved on to another person: nothing is set on what is gone.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function back() {
    if (!onBack || busy) return;
    setBusy(true);
    setError('');
    const reason = await onBack();
    if (!alive.current) return;
    setBusy(false);
    if (reason) setError(reason);
    else setAsking(false);
  }

  return (
    <div className={k.outCard} data-opted-out="">
      <button type="button" onClick={() => setOpen((was) => !was)} aria-expanded={open} aria-controls={panelId} className={k.outChip}>
        <BellOff aria-hidden="true" />
        {chip.text}
        <ChevronDown className={k.outChevron} aria-hidden="true" />
      </button>
      <Fold open={open} id={panelId} innerClassName={k.outBody}>
        <dl className={k.outFacts}>
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt>{fact.label}</dt>
              <dd dir="auto">{fact.quote ? <span className={k.outQuote}>{fact.value}</span> : fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className={k.outStill}>{OPT_OUT_TEXT.still}</p>
        {error && (
          <p className={k.outError} role="alert">
            {error}
          </p>
        )}
        {onBack &&
          (asking ? (
            <InlineConfirm
              busy={busy}
              text={
                <>
                  <strong>{OPT_OUT_TEXT.backAsk}</strong> {OPT_OUT_TEXT.backAskMore}
                </>
              }
              confirmLabel={OPT_OUT_TEXT.backYes}
              onConfirm={() => void back()}
              onCancel={() => {
                setAsking(false);
                setError('');
              }}
            />
          ) : (
            <button type="button" onClick={() => setAsking(true)} className={w.quietLink}>
              {OPT_OUT_TEXT.back}
            </button>
          ))}
      </Fold>
    </div>
  );
}

export interface OptOutMarkLinkProps {
  /** Who is being marked, for the question. */
  name: string;
  /** Resolves '' once the mark stands, or — in words — why not. */
  onMark: () => Promise<string>;
  /** The question stands from the start — for a test, or a picture of it. */
  defaultAsking?: boolean;
  /** Nothing stands above the line in its section: it needs no room over it. */
  flush?: boolean;
}

/**
 * Marking by hand, for somebody who said it on the phone: one quiet line in the card — never a button among
 * the actions, and never a switch. It says what it does before it does it: which messages stop, and which go on.
 */
export function OptOutMarkLink({ name, onMark, defaultAsking = false, flush = false }: OptOutMarkLinkProps) {
  const [asking, setAsking] = useState(defaultAsking);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function mark() {
    if (busy) return;
    setBusy(true);
    setError('');
    const reason = await onMark();
    if (!alive.current) return;
    setBusy(false);
    if (reason) setError(reason);
    else setAsking(false);
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={cx(w.quietLink, !flush && w.addLink)} data-opt-out-mark="">
        <BellOff aria-hidden="true" />
        {OPT_OUT_TEXT.mark}
      </button>
    );
  }
  return (
    <div className={flush ? undefined : 'mt-2'}>
      <InlineConfirm
        busy={busy}
        text={
          <>
            לסמן "ביקש הסר" על <strong dir="auto">{name}</strong>? {OPT_OUT_TEXT.markAsk}
            {error && (
              <span className={cx(k.outError, 'mt-1 block')} role="alert">
                {error}
              </span>
            )}
          </>
        }
        confirmLabel={OPT_OUT_TEXT.markYes}
        onConfirm={() => void mark()}
        onCancel={() => {
          setAsking(false);
          setError('');
        }}
      />
    </div>
  );
}

/**
 * Beside a press that is locked because the customer asked out: why, in plain words, and what can be done
 * instead. `bot` — the bot does not come back to them; `notify` — they are not told of a freed place by a
 * message.
 */
export function BlockedByOptOut({ what = 'bot' }: { what?: 'bot' | 'notify' }) {
  return (
    <p className={k.blocked} role="note" data-blocked="opted_out">
      <BellOff aria-hidden="true" />
      <span>
        <strong>{what === 'notify' ? OPT_OUT_TEXT.notifyBlocked : OPT_OUT_TEXT.botBlocked}.</strong> {OPT_OUT_TEXT.botBlockedMore}
      </span>
    </p>
  );
}
