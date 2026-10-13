'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight, ChevronDown, ExternalLink, Plus, X } from 'lucide-react';
import { formatDateTime, israelToday } from '@/lib/wahub/format';
import { entryOfMark, isActiveEntry } from '@/lib/wahub/futureLeads';
import type { WaitingAction } from '@/lib/wahub/futureLeadsApi';
import {
  childFacts,
  currentFollowUp,
  factsBeyond,
  followUpLine,
  fullWhen,
  isClosedLead,
  leadChips,
  leadPhoneText,
  leadStageText,
  leadTitle,
  nextStepLine,
  saysMore,
  sinceText,
  sortFollowUps,
  timelineWords,
  trialFacts,
  type Fact,
  type FollowUpTone,
  type LeadChange,
  type NextStepLine,
} from '@/lib/wahub/leadsV2';
import type { WahubLeadDetails, WahubLeadFollowUp, WahubLeadRow } from '@/types/wahub';
import { NoteList } from '../../shared/FutureParts';
import { DemoTag, Skeleton } from '../../shared/bits';
import { cx } from '../../shared/tones';
import w from '../../waiting.module.css';
import s from '../../wahub.module.css';
import LeadActions, { type LeadActionsMode } from './LeadActions';
import { NextIcon } from './LeadRow';
import l from './leads.module.css';
import { FreedBlock, FutureBlock, WaitingEntries, type NotifyControls, type WaitingBusy } from './WaitingBits';

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
  /**
   * "טופל" / "להסיר מהרשימה" on a waiting-list entry whose place was freed
   * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.4). Absent: the entries are shown, and nothing can be pressed.
   */
  onWaiting?: (entryId: number, action: WaitingAction) => void;
  /** The press on an entry that is on its way, if any. */
  waitingBusy?: WaitingBusy | null;
  /**
   * "להודיע ללקוח" on an entry whose place was freed (ז.4): the block that is open, and its presses. Absent —
   * or an entry the server says nothing of telling about — and it is not offered.
   */
  notify?: NotifyControls;
  /** "להוסיף לרשימת המתנה" (ז.2): opens the window where a lesson is chosen. Absent: the server cannot, and nothing is drawn. */
  onAddWaiting?: () => void;
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
      <h3 className={l.dTitle}>{title}</h3>
      {children}
    </section>
  );
}

/**
 * What is secondary stays behind its title ("משני = מקופל"): the title and how
 * many, and the rest a press away. The browser's own fold, so the details keep
 * no state of their own and it works before any script has run.
 */
function FoldSection({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count: number;
  /** Open from the start — for the few lines that are worth reading before anything is pressed. */
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={l.dSect} aria-label={title}>
      <details className={l.dFold} open={open || undefined}>
        <summary className={l.dFoldHead}>
          <h3 className={l.dTitle}>
            {title} <span className={cx(s.num, l.dFoldCount)}>({count})</span>
          </h3>
          <ChevronDown className={l.dFoldChevron} aria-hidden="true" />
        </summary>
        <div className={l.dFoldBody}>{children}</div>
      </details>
    </section>
  );
}

/** A small label and, under it, the value that matters — one short row a fact. */
function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className={l.facts}>
      {facts.map((fact) => (
        <div key={fact.label} className={l.fact}>
          <dt>{fact.label}</dt>
          <dd dir="auto">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "פנייה 2 · 11.10 10:31" — which of the round, and when it happened; the hour of one still ahead is the block's own line. */
function followUpMeta(followUp: WahubLeadFollowUp, when: string): string {
  const ahead = followUp.status === 'planned';
  return [followUp.step ? `פנייה ${followUp.step}` : '', ahead ? '' : when].filter(Boolean).join(' · ');
}

/**
 * The bot's message inside "מה קורה עכשיו": its wording as the customer will
 * see it, and one word for where it stands — "מתוכנן", "היה נשלח עכשיו",
 * "נשלח". What the block's own line already says is not said again under it.
 */
function NowMessage({
  followUp,
  now,
  sendingOn,
  line: blockLine,
  said,
}: {
  followUp: WahubLeadFollowUp;
  now: Date;
  sendingOn: boolean | null;
  /** The block's own words, right above the message: its state and its hour are not said again under it. */
  line: string[];
  /** Everything the screen already says, above and below — the block's words, and why this is a lead. */
  said: string[];
}) {
  const line = followUpLine(followUp, now, sendingOn);
  const meta = followUpMeta(followUp, line.when);
  const sent = followUp.status === 'sent';
  return (
    <div className={l.nowMsg}>
      {followUp.text && (
        <blockquote className={cx(l.bubble, sent ? l.bubbleSent : l.bubbleAhead)} dir="auto">
          {followUp.text}
        </blockquote>
      )}
      <p className={l.nowMeta}>
        {saysMore(line.status, ...blockLine) && <span className={cx(l.fuStatus, FOLLOW_UP_CLASS[line.tone])}>{line.status}</span>}
        {meta && <span className={s.num}>{meta}</span>}
      </p>
      {saysMore(line.note, ...blockLine) && <p className={l.fuNote}>{line.note}</p>}
      {saysMore(followUp.why, ...said) && <p className={l.fuNote}>למה: {followUp.why}</p>}
    </div>
  );
}

/** One time the bot came back, among those behind us: a title — what, when, what became of it — and the wording a press away. */
function FollowUp({
  followUp,
  now,
  sendingOn,
  said,
}: {
  followUp: WahubLeadFollowUp;
  now: Date;
  sendingOn: boolean | null;
  said: string[];
}) {
  const line = followUpLine(followUp, now, sendingOn);
  const why = saysMore(followUp.why, ...said) ? followUp.why : '';
  const body = Boolean(followUp.text || line.note || why);
  const head = (
    <>
      <span className={l.fuTitle}>{line.title}</span>
      <span className={cx(l.fuStatus, FOLLOW_UP_CLASS[line.tone])}>{line.status}</span>
      {line.when && <span className={cx(s.num, l.fuWhen)}>{line.when}</span>}
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
      <details className={l.fu}>
        <summary>{head}</summary>
        <div className={l.fuBody}>
          {followUp.text && (
            <blockquote className={l.fuText} dir="auto">
              {followUp.text}
            </blockquote>
          )}
          {why && <p className={l.fuNote}>למה: {why}</p>}
          {line.note && <p className={l.fuNote}>{line.note}</p>}
        </div>
      </details>
    </li>
  );
}

/** The details on their way: the sections under "מה קורה עכשיו", where they will stand. */
function DetailsSkeleton() {
  return (
    <div aria-busy="true" aria-label="טוען את פרטי הליד" className={l.dSkList}>
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
 * (docs/WAHUB-CONTRACT-LEADS-V2.md, ה, ח), in the order the eye should take it
 * (docs/CHANGE-IMPACT-2026-10-12-CRM-ROUND-FONT-AND-CLARITY.md):
 *
 *   who — the name, large, and one quiet line under it;
 *   "מה קורה עכשיו" — who is handling it and what comes next, the largest
 *     thing on the screen, with the message the bot will send (or sent) as the
 *     customer sees it;
 *   why they are a lead — one sentence and the chips; what stops them only
 *     when it adds to that sentence;
 *   the trial, the child, the day to come back — a small label and a value;
 *   and, folded, what is behind us: the bot's earlier messages, the timeline.
 *
 * Since docs/WAHUB-CONTRACT-FUTURE-LEADS.md: a place that was freed stands
 * right under "מה קורה עכשיו", with what can be done about it — telling the
 * customer first; a future lead carries its mark and its reason; and the
 * office's notes and this person's entries on the waiting list each have a
 * section, with a quiet way to put them on another lesson's list.
 *
 * Nothing is said twice: a line that repeats one already on the screen is left
 * out (lib/wahub/leadsV2.ts, saysMore). A column beside the list on a desktop;
 * a screen of its own, with a way back, on a phone.
 *
 * Drawn from what it is given, and keeps no state: the name and the next step
 * come at once from the row that was pressed; only what is under them waits
 * for its read.
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
  onWaiting,
  waitingBusy = null,
  notify,
  onAddWaiting,
}: LeadDetailsProps) {
  const isClosed = Boolean(lead && (closed || isClosedLead(lead)));
  const next = lead ? nextStepLine(lead, now, sendingOn, closed || undefined) : null;
  const chips = lead ? leadChips(lead.chips) : [];
  const phone = lead ? leadPhoneText(lead.phone) : '';
  const since = lead ? sinceText(lead.since, now) : '';
  const waiting = lead?.waiting_list ?? null;
  const freed = waiting?.status === 'freed' ? waiting : null;
  const future = lead?.future ?? null;
  const reason = details?.reason || lead?.summary || '';
  // A place was freed: its headline is the reason, and the reason is not said again under it.
  const why = freed && !saysMore(reason, freed.title) ? '' : reason;
  // What the screen has said by the time the eye reaches the rest: nothing under it repeats these.
  const nowWords = [next?.text ?? '', next?.detail ?? ''];
  const said = [...nowWords, why, freed?.title ?? ''];
  const notes = details?.notes ?? [];
  // The entries, from their own read — and until it lands, the one the row already carries.
  const entries = details?.waiting_list_entries ?? (waiting ? [entryOfMark(waiting)] : []);
  const name = lead ? leadTitle(lead) : '';
  // The freed place that stands at the head of the details; its entry is then not told again in the list.
  const headFreed = freed && !isClosed ? freed : null;
  const otherEntries = headFreed ? entries.filter((entry) => entry.id !== headFreed.entry_id) : entries;
  // Adding to a waiting list by hand: only for a lead that is open, on a server that can list the lessons.
  const canAdd = Boolean(onAddWaiting) && !isClosed;
  // Somebody who already waits for a lesson is offered another one; the words say which it is.
  const addWords = entries.some(isActiveEntry) ? 'להוסיף לשיעור נוסף' : 'להוסיף לרשימת המתנה';
  const blocker = saysMore(details?.blocker_text, ...said) ? details?.blocker_text ?? '' : '';
  const child = factsBeyond(childFacts(details?.child), lead?.chips.child, why);
  const trial = trialFacts(details?.trial, now);
  const followUps = sortFollowUps(details?.followups ?? []);
  // A closed lead has no next step, and so no message of the bot's that belongs to "now".
  const current = isClosed ? null : currentFollowUp(followUps, lead);
  const earlier = followUps.filter((followUp) => followUp !== current);
  const timeline = details?.timeline ?? [];
  // A closed lead has no next step: the same place says how it ended.
  const nowTitle = isClosed ? 'הליד סגור' : 'מה קורה עכשיו';

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
              {/* One quiet line: the phone, the state in plain words, how long. Each stays whole when the line breaks. */}
              <p className={l.dSub}>
                {[
                  lead.name && phone ? (
                    <span key="phone" className={cx(s.num, l.dSubPart)}>
                      {phone}
                    </span>
                  ) : null,
                  leadStageText(lead) ? (
                    <span key="stage" className={l.dSubPart}>
                      {leadStageText(lead)}
                    </span>
                  ) : null,
                  since ? (
                    <span key="since" className={l.dSubPart}>
                      {since}
                    </span>
                  ) : null,
                ]
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
              <section className={cx(l.now, NEXT_BOX[next.tone])} aria-label={nowTitle}>
                <h3 className={l.nowLabel}>{nowTitle}</h3>
                <p className={l.nowText}>
                  <NextIcon line={next} />
                  <span dir="auto">{next.text}</span>
                </p>
                {next.detail && (
                  <p className={l.nowMore} dir="auto">
                    {next.detail}
                  </p>
                )}
                {current && <NowMessage followUp={current} now={now} sendingOn={sendingOn} line={nowWords} said={said} />}
              </section>
            )}

            {/* A place was freed: what to offer, and the two things that can be done about it. */}
            {headFreed && (
              <FreedBlock
                mark={headFreed}
                entry={entries.find((entry) => entry.id === headFreed.entry_id)}
                name={name}
                now={now}
                busy={waitingBusy}
                onAct={onWaiting}
                notify={notify}
              />
            )}

            {/* A future lead: its mark, the reason the office wrote, whose it is. */}
            {future && !isClosed && <FutureBlock future={future} today={israelToday(now)} now={now} said={nowWords} />}

            {why && (
              <Section title="למה זה ליד">
                <p className={l.dText} dir="auto">
                  {why}
                </p>
                {chips.length > 0 && (
                  <div className={cx(l.chips, l.dChips)}>
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
                {blocker && (
                  <Section title="מה עוצר את ההרשמה">
                    <p className={l.dText} dir="auto">
                      {blocker}
                    </p>
                  </Section>
                )}

                {details.come_back_on && (
                  <Section title="מתי חוזרים">
                    <p className={l.dText}>
                      {fullWhen(details.come_back_on)}
                      {saysMore(details.come_back_why, ...said) && <span dir="auto"> — {details.come_back_why}</span>}
                    </p>
                  </Section>
                )}

                {trial.length > 0 && (
                  <Section title="שיעור הניסיון">
                    <Facts facts={trial} />
                  </Section>
                )}

                {child.length > 0 && (
                  <Section title="הילד">
                    <Facts facts={child} />
                  </Section>
                )}

                {/* What the office wrote about this person. A few are read at once; many wait behind their title. */}
                {notes.length > 0 && (
                  <FoldSection title="פתקים" count={notes.length} open={notes.length <= 3}>
                    <NoteList notes={notes} now={now} />
                  </FoldSection>
                )}

                {otherEntries.length > 0 ? (
                  <Section title={headFreed ? 'עוד ברשימת ההמתנה' : 'רשימת המתנה'}>
                    <WaitingEntries
                      entries={otherEntries}
                      now={now}
                      name={name}
                      headId={headFreed ? headFreed.entry_id : null}
                      busy={waitingBusy}
                      onAct={isClosed ? undefined : onWaiting}
                      notify={isClosed ? undefined : notify}
                    />
                    {canAdd && (
                      <button type="button" onClick={onAddWaiting} className={cx(w.quietLink, w.addLink)}>
                        <Plus aria-hidden="true" />
                        {addWords}
                      </button>
                    )}
                  </Section>
                ) : (
                  // Nobody's list yet: one quiet line is the whole of it — the words themselves are its title.
                  canAdd && (
                    <section className={l.dSect} aria-label="רשימת המתנה">
                      <button type="button" onClick={onAddWaiting} className={w.quietLink}>
                        <Plus aria-hidden="true" />
                        {addWords}
                      </button>
                    </section>
                  )
                )}

                {earlier.length > 0 && (
                  <FoldSection title="פניות קודמות של הבוט" count={earlier.length}>
                    <ul className={l.fuList}>
                      {earlier.map((followUp, index) => (
                        <FollowUp key={followUp.id ?? `at-${index}`} followUp={followUp} now={now} sendingOn={sendingOn} said={said} />
                      ))}
                    </ul>
                  </FoldSection>
                )}

                {timeline.length > 0 && (
                  <FoldSection title="מה קרה עד עכשיו" count={timeline.length}>
                    <ol className={l.timeline}>
                      {timeline.map((event, index) => (
                        <li key={index}>
                          {event.at && <span className={cx(s.num, l.tlAt)}>{formatDateTime(event.at, now)}</span>}
                          <span className={l.tlText} dir="auto">
                            {timelineWords(event.text, ...said)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </FoldSection>
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
