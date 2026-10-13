'use client';

import type { ReactNode } from 'react';
import { BellRing, ChevronDown, Hourglass, MessagesSquare, Phone, Send } from 'lucide-react';
import { WANTED_TEXT, callLabel, sentenceParts, wantedFacts } from '@/lib/wahub/waitingSummary';
import type { WahubWaitingState, WahubWaitingSummary } from '@/types/wahubSearch';
import x from '../../search.module.css';
import { Skeleton } from '../../shared/bits';
import CustomerCardLink from '../../shared/CustomerCardLink';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';

/** The small mark of each of the four states: an hourglass while they wait, a bell once a place is free… */
function StateIcon({ state }: { state: WahubWaitingState | '' }) {
  if (state === 'freed') return <BellRing aria-hidden="true" />;
  if (state === 'told') return <Send aria-hidden="true" />;
  if (state === 'answered') return <MessagesSquare aria-hidden="true" />;
  return <Hourglass aria-hidden="true" />;
}

export interface WantedBlockProps {
  summary: WahubWaitingSummary;
  /**
   * Where the lesson is already said right above (a person in the line of their lesson): the sentence, the
   * lesson's numbers and the short lines are left out — what is new there is the number to call, and what could
   * be offered instead.
   */
  compact?: boolean;
  /** Inside another card: no ground of its own. */
  bare?: boolean;
  /**
   * "לכרטיס הלקוח" beside the number to call. Left out where the screen around the block already carries that
   * button (a lead's actions, the contact's card): it is never said twice.
   */
  showCard?: boolean;
  /** What can be done with the entry — telling the customer, "טופל", taking them off the list — at the block's foot. */
  children?: ReactNode;
}

/**
 * "מה רצו" — the first thing to read about somebody who waits for a place
 * (owner, 13.10.2026: "כשנכנסים ללקוח — סיכום מאוד ברור על מה הוא רצה ולאיפה,
 * כי אולי פשוט אפשר להתקשר ולהגיד לו 'שמע, יש יום אחר'").
 *
 * Top to bottom, the important thing large and first: the server's own sentence
 * — what, when, where, for whom, since when, where in the line — with the
 * class's name bold; how full that lesson is right now; the number to call, as
 * one button; and "אפשר להציע במקום": every lesson that has room at this moment,
 * a row each, with how many places are left. The short lines (the class, the
 * hour, the instructor, the ages…) wait behind "כל הפרטים".
 *
 * Drawn from what it is given (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.3.2). It
 * decides nothing: who waits, for what, and what has room is the server's.
 */
export default function WantedBlock({ summary, compact = false, bare = false, showCard = false, children }: WantedBlockProps) {
  const { wanted, seats } = summary;
  const facts = compact ? [] : wantedFacts(summary);
  const card = showCard ? summary.customer?.link ?? null : null;
  const offers = summary.alternatives;
  // A lesson that no longer takes place has nothing to compare with: the server offers nothing, and says nothing.
  const none = wanted.exists ? summary.alternatives_note || WANTED_TEXT.noOffer : '';
  const ways = Boolean(summary.tel) || Boolean(card);

  return (
    <section className={cx(x.wanted, !bare && summary.needs_office && x.wantedAct, bare && x.wantedBare)} aria-label={WANTED_TEXT.title}>
      {!compact && (
        <>
          <div className={x.wantedHead}>
            <h3 className={x.wantedTitle}>{WANTED_TEXT.title}</h3>
            {summary.state_label && (
              <span className={cx(x.wantedState, summary.needs_office && x.wantedStateAct)}>
                <StateIcon state={summary.state} />
                {summary.state_label}
              </span>
            )}
          </div>

          <p className={x.wantedSentence} dir="auto">
            {sentenceParts(summary.sentence || wanted.label).map((part, index) =>
              part.hit ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>,
            )}
          </p>

          {!wanted.exists ? (
            <p className={cx(x.wantedNow, x.wantedGone)}>{WANTED_TEXT.gone}</p>
          ) : (
            seats.seats_label && (
              <p className={x.wantedNow}>
                {WANTED_TEXT.now}: <b>{seats.seats_label}</b>
              </p>
            )
          )}
        </>
      )}

      {ways && (
        <div className={x.wantedWays}>
          {summary.tel && (
            <a href={summary.tel} className={x.call} aria-label={callLabel(summary)} title={callLabel(summary)}>
              <Phone aria-hidden="true" />
              <span className={x.callNumber}>{summary.phone_display || WANTED_TEXT.call}</span>
            </a>
          )}
          {card && <CustomerCardLink href={card} className={s.btn} />}
        </div>
      )}

      {facts.length > 0 && (
        <details className={x.wantedFold}>
          <summary>
            {WANTED_TEXT.facts}
            <ChevronDown aria-hidden="true" />
          </summary>
          <dl className={x.wantedFacts}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd dir="auto">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {(offers.length > 0 || none) && (
        <div className={x.offer}>
          <h4 className={x.offerTitle}>{WANTED_TEXT.offer}</h4>
          {offers.length > 0 ? (
            <ul className={x.offerList}>
              {offers.map((offer, index) => (
                <li key={offer.lesson_id || index} className={x.offerRow}>
                  <span className={x.offerWhat}>
                    <span className={x.offerLabel} dir="auto">
                      {offer.label}
                    </span>
                    {(offer.kind_label || offer.instructor) && (
                      <span className={x.offerKind} dir="auto">
                        {[offer.kind_label, offer.instructor].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {offer.seats_label && <span className={x.offerSeats}>{offer.seats_label}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className={x.offerNone}>{none}</p>
          )}
        </div>
      )}

      {children && <div className={x.wantedFoot}>{children}</div>}
    </section>
  );
}

/**
 * The block's place while the lead's details are still on their way: the lesson the row already names, large,
 * and a grey line where the rest will stand — so "מה רצו" does not push the screen down when it lands.
 */
export function WantedPlaceholder({ label, stateLabel, act }: { label: string; stateLabel: string; act: boolean }) {
  return (
    <section className={cx(x.wanted, act && x.wantedAct)} aria-label={WANTED_TEXT.title} aria-busy="true">
      <div className={x.wantedHead}>
        <h3 className={x.wantedTitle}>{WANTED_TEXT.title}</h3>
        {stateLabel && <span className={cx(x.wantedState, act && x.wantedStateAct)}>{stateLabel}</span>}
      </div>
      <p className={x.wantedSentence} dir="auto">
        {label}
      </p>
      <Skeleton className="h-11 !rounded-xl" style={{ width: '58%' }} />
    </section>
  );
}
