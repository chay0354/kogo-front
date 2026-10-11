'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight, ExternalLink, X } from 'lucide-react';
import { formatDateTime } from '@/lib/wahub/format';
import {
  childFacts,
  followUpLine,
  fullWhen,
  isClosedLead,
  leadChips,
  leadPhoneText,
  leadStageText,
  leadTitle,
  nextStepLine,
  sinceText,
  sortFollowUps,
  trialFacts,
  type Fact,
  type FollowUpTone,
  type LeadChange,
  type NextStepLine,
} from '@/lib/wahub/leadsV2';
import type { WahubLeadDetails, WahubLeadFollowUp, WahubLeadRow } from '@/types/wahub';
import { DemoTag, Skeleton } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import LeadActions, { type LeadActionsMode } from './LeadActions';
import { NextIcon } from './LeadRow';
import l from './leads.module.css';

export interface LeadDetailsProps {
  /** The lead as the list (or its own read) has it; null while nothing is known about it yet. */
  lead: WahubLeadRow | null;
  /** Everything a press opens; null until it was read. */
  details: WahubLeadDetails | null;
  /** `gone`: the server no longer has this lead. */
  status: 'loading' | 'ready' | 'error' | 'gone';
  error: string;
  now: Date;
  sendingOn: boolean | null;
  /** The details stand in place of the list (a phone): the head carries "חזרה" rather than a close mark. */
  cover: boolean;
  /** The lead was read from the closed list — said for a state this screen does not know by name. */
  closed?: boolean;
  busy: LeadChange['kind'] | null;
  initialMode?: LeadActionsMode;
  onClose: () => void;
  onRetry: () => void;
  onOpenChat: (id: number) => void;
  onChange: (lead: WahubLeadRow, change: LeadChange) => Promise<boolean> | void;
}

const NEXT_BOX: Record<NextStepLine['tone'], string> = {
  office: l.nextOffice,
  bot: l.nextBot,
  held: l.nextHeld,
  quiet: l.dNextQuiet,
};

const FOLLOW_UP_CLASS: Record<FollowUpTone, string> = {
  planned: l.fuPlanned,
  held: l.fuHeld,
  sent: l.fuSent,
  off: l.fuOff,
  bad: l.fuBad,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={l.dSect} aria-label={title}>
      <h3 className={l.dLabel}>{title}</h3>
      {children}
    </section>
  );
}

function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className={l.facts}>
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt>{fact.label}</dt>
          <dd dir="auto">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One time the bot comes back: a title — what, when, what became of it — and the wording a press away. */
function FollowUp({ followUp, now, sendingOn }: { followUp: WahubLeadFollowUp; now: Date; sendingOn: boolean | null }) {
  const line = followUpLine(followUp, now, sendingOn);
  // What is still ahead is what the bot is about to say: its wording is open to begin with.
  const ahead = followUp.status === 'planned' || followUp.status === 'due';
  const body = Boolean(followUp.text || line.note || followUp.why);
  const head = (
    <>
      <span className={l.fuTitle}>{line.title}</span>
      <span className={cx(l.fuStatus, FOLLOW_UP_CLASS[line.tone])}>{line.status}</span>
      {line.when && <span className={l.fuWhen}>{line.when}</span>}
    </>
  );
  if (!body) {
    return (
      <li className={l.fu}>
        <div className={l.fuPlain}>{head}</div>
      </li>
    );
  }
  return (
    <li>
      <details className={l.fu} open={ahead}>
        <summary>{head}</summary>
        <div className={l.fuBody}>
          {followUp.text && (
            <blockquote className={l.fuText} dir="auto">
              {followUp.text}
            </blockquote>
          )}
          {followUp.why && <p className={l.fuNote}>למה: {followUp.why}</p>}
          {line.note && <p className={l.fuNote}>{line.note}</p>}
        </div>
      </details>
    </li>
  );
}

/** The details on their way: the next step, and the sections under it, where they will stand. */
function DetailsSkeleton() {
  return (
    <div aria-busy="true" aria-label="טוען את פרטי הליד" className="flex flex-col gap-[18px]">
      <Skeleton className="!rounded-[14px]" style={{ height: 68 }} />
      {[78, 54, 62].map((width, index) => (
        <div key={index} className={l.dSk}>
          <Skeleton className={l.skLineSm} style={{ width: 64 }} />
          <Skeleton className={l.skLine} style={{ width: `${width}%` }} />
          <Skeleton className={l.skLine} style={{ width: `${width - 22}%` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Everything about one lead, a press away from its row
 * (docs/WAHUB-CONTRACT-LEADS-V2.md, ה, ח): why they are a lead, what stops them,
 * the child, the trial, what the bot planned and what it already sent, a short
 * timeline — and the few things that can be done. A column beside the list on a
 * desktop; a screen of its own, with a way back, on a phone.
 *
 * Drawn from what it is given. The name and the next step come at once from
 * the row that was pressed; only what is under them waits for its read.
 */
export default function LeadDetails({
  lead,
  details,
  status,
  error,
  now,
  sendingOn,
  cover,
  closed,
  busy,
  initialMode,
  onClose,
  onRetry,
  onOpenChat,
  onChange,
}: LeadDetailsProps) {
  const next = lead ? nextStepLine(lead, now, sendingOn, closed || undefined) : null;
  const chips = lead ? leadChips(lead.chips) : [];
  const phone = lead ? leadPhoneText(lead.phone) : '';
  const since = lead ? sinceText(lead.since, now) : '';
  const child = childFacts(details?.child);
  const trial = trialFacts(details?.trial, now);
  const followUps = sortFollowUps(details?.followups ?? []);
  const timeline = details?.timeline ?? [];
  const why = details?.reason || lead?.summary || '';
  // A closed lead has no next step: the same place says how it ended.
  const nextTitle = lead && (closed || isClosedLead(lead)) ? 'הליד סגור' : 'הצעד הבא';

  return (
    <aside className={cx(l.details, cover && l.detailsCover)} aria-label="פרטי הליד">
      <header className={l.dHead}>
        {cover && (
          <button type="button" onClick={onClose} aria-label="חזרה לרשימה" title="חזרה לרשימה" className={s.ib}>
            <ArrowRight aria-hidden="true" />
          </button>
        )}
        <div className={l.dWho}>
          {lead ? (
            <>
              <h2 className={l.dName}>
                <span className={l.dNameText} dir="auto">
                  {leadTitle(lead)}
                </span>
                {lead.is_demo && <DemoTag />}
              </h2>
              <p className={l.dSub}>
                {[lead.name && phone ? <span key="phone" className={s.num}>{phone}</span> : null, leadStageText(lead) || null, since || null]
                  .filter(Boolean)
                  .flatMap((part, index) => (index ? [' · ', part] : [part]))}
              </p>
            </>
          ) : status === 'gone' ? (
            <h2 className={l.dName}>הליד לא נמצא</h2>
          ) : (
            <div className={l.dSk} aria-hidden="true">
              <Skeleton className={l.skLine} style={{ width: 150 }} />
              <Skeleton className={l.skLineSm} style={{ width: 210 }} />
            </div>
          )}
        </div>
        {!cover && (
          <button type="button" onClick={onClose} aria-label="סגור את פרטי הליד" title="סגור" className={s.ib}>
            <X aria-hidden="true" />
          </button>
        )}
      </header>

      {lead && status !== 'gone' && (
        <LeadActions
          // Another lead starts from the buttons, never from the question that was open for the one before.
          key={lead.contact_id}
          lead={lead}
          closed={closed}
          now={now}
          busy={busy}
          initialMode={initialMode}
          onOpenChat={() => onOpenChat(lead.contact_id)}
          onChange={(change) => onChange(lead, change)}
        />
      )}

      <div className={l.dScroll}>
        {status === 'gone' ? (
          <div className={cx(s.emptyState, s.emptyTight)}>
            <h3>הליד הזה כבר לא ברשימה</h3>
            <p>ייתכן שכבר נרשמו, או שאוחד עם איש קשר אחר.</p>
            <button type="button" onClick={onClose} className={cx(s.btn, 'mt-1')}>
              חזרה לרשימה
            </button>
          </div>
        ) : (
          <>
            {lead && next && (
              <section className={cx(l.dNext, NEXT_BOX[next.tone])} aria-label={nextTitle}>
                <h3 className={l.dLabel}>{nextTitle}</h3>
                <p className={l.dNextText}>
                  <NextIcon line={next} />
                  <span dir="auto">{next.text}</span>
                </p>
                {next.detail && (
                  <p className={l.dNextMore} dir="auto">
                    {next.detail}
                  </p>
                )}
              </section>
            )}

            {why && (
              <Section title="למה זה ליד">
                <p className={l.dText} dir="auto">
                  {why}
                </p>
                {chips.length > 0 && (
                  <div className={cx(l.chips, 'mt-2')}>
                    {chips.map((chip) => (
                      <span key={chip.key} className={l.chip} dir="auto">
                        {chip.text}
                      </span>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {status === 'error' ? (
              <div role="alert" className={cx(s.emptyState, s.emptyTight)}>
                <div aria-hidden="true" className={cx(s.emptyIc, s.emptyIcBad)}>
                  <AlertCircle />
                </div>
                <h3>לא הצלחנו לטעון את שאר הפרטים</h3>
                {error && <p>{error}</p>}
                <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP, 'mt-1')}>
                  נסו שוב
                </button>
              </div>
            ) : !details ? (
              <DetailsSkeleton />
            ) : (
              <>
                {details.blocker_text && (
                  <Section title="מה עוצר את ההרשמה">
                    <p className={l.dText} dir="auto">
                      {details.blocker_text}
                    </p>
                  </Section>
                )}

                {details.come_back_on && (
                  <Section title="מתי חוזרים">
                    <p className={l.dText}>
                      {fullWhen(details.come_back_on)}
                      {details.come_back_why && <span dir="auto"> — {details.come_back_why}</span>}
                    </p>
                  </Section>
                )}

                {child.length > 0 && (
                  <Section title="הילד">
                    <Facts facts={child} />
                  </Section>
                )}

                {trial.length > 0 && (
                  <Section title="שיעור הניסיון">
                    <Facts facts={trial} />
                  </Section>
                )}

                <Section title="מה הבוט תכנן ומה כבר נשלח">
                  {followUps.length === 0 ? (
                    <p className={l.dMuted}>הבוט לא תכנן פנייה לליד הזה.</p>
                  ) : (
                    <ul className={l.fuList}>
                      {followUps.map((followUp, index) => (
                        <FollowUp key={followUp.id ?? `at-${index}`} followUp={followUp} now={now} sendingOn={sendingOn} />
                      ))}
                    </ul>
                  )}
                </Section>

                {timeline.length > 0 && (
                  <Section title="מה קרה עד עכשיו">
                    <ol className={l.timeline}>
                      {timeline.map((event, index) => (
                        <li key={index}>
                          {event.at && <span className={l.tlAt}>{formatDateTime(event.at, now)}</span>}
                          <span className={l.tlText} dir="auto">
                            {event.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}

                {details.in_system && (
                  <Section title="במערכת">
                    <Link href={details.in_system} className={l.dLink}>
                      כרטיס הלקוח ב-Kogo
                      <ExternalLink aria-hidden="true" />
                    </Link>
                  </Section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
