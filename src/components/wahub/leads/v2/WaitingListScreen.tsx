'use client';

import { useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, BellRing, ChevronDown, Hourglass } from 'lucide-react';
import { customerCardFor } from '@/lib/wahub/customerCard';
import type { WaitingAction } from '@/lib/wahub/futureLeadsApi';
import { WAITING_LIST_TITLE } from '@/lib/wahub/leadsV2';
import { summaryOfEntry, waitingActText } from '@/lib/wahub/waitingSummary';
import {
  entriesOfLesson,
  entryMoreFacts,
  entryStanding,
  lessonFreed,
  lessonHead,
  placeText,
  waitersText,
  waitingStripText,
  type EntryTone,
} from '@/lib/wahub/waitingList';
import type { WahubWaitingEntry, WahubWaitingLesson, WahubWaitingListPage } from '@/types/wahub';
import { DemoTag, EmptyState } from '../../shared/bits';
import { RefreshNote } from '../../shared/loading';
import { Fold } from '../../shared/motion';
import { cx } from '../../shared/tones';
import w from '../../waiting.module.css';
import s from '../../wahub.module.css';
import { LeadRowsSkeleton } from './LeadsList';
import l from './leads.module.css';
import { ToldLines, WaitingActions, type NotifyControls, type WaitingBusy } from './WaitingBits';
import WantedBlock from './WantedBlock';
import { useLeadDetail } from './useLeads';

/**
 * The full waiting list (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז.1), by lesson:
 * a title row for each — the class, when and where; how full it is right now;
 * how many wait — and, a press away, who waits: since when, who is first, and
 * where each entry stands.
 *
 * A lesson that has a place now comes first, in green, and stands open, with
 * the first in its line open as well: what to do next is on the screen without
 * a press. Everything else is a title until it is asked for.
 */

const STANDING_CLASS: Record<EntryTone, string | undefined> = {
  waiting: undefined,
  freed: w.standingFreed,
  told: w.standingTold,
  replied: w.standingReplied,
  closed: undefined,
};

interface PersonProps {
  entry: WahubWaitingEntry;
  /** The place in the line, when the server did not say: the order of the row. */
  fallbackPlace: number;
  lesson: string;
  open: boolean;
  now: Date;
  busy: WaitingBusy | null;
  notify?: NotifyControls;
  onToggle: (id: number, open: boolean) => void;
  onAct: (entryId: number, action: WaitingAction) => void;
  onOpenChat: (contactId: number) => void;
  /**
   * What stands in a person's opened row above the actions: the number to call, and what could be offered in
   * place of the lesson that is full (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.3.2). Absent: nothing is added.
   */
  renderSummary?: (entry: WahubWaitingEntry) => ReactNode;
}

/** One person of a lesson's line: the place, the name, what is known of the child, and one word for where they stand. */
function Person({ entry, fallbackPlace, lesson, open, now, busy, notify, onToggle, onAct, onOpenChat, renderSummary }: PersonProps) {
  const standing = entryStanding(entry, now);
  const place = entry.position ?? fallbackPlace;
  const name = entry.name || entry.phone_display || 'ללא שם';
  const facts = entryMoreFacts(entry, now);
  const panelId = `waiting-person-${entry.id}`;
  const contactId = entry.contact_id;
  return (
    <li className={cx(w.person, open && w.personOpen)}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => onToggle(entry.id, !open)} className={w.personHead}>
        <span className={cx(w.place, place === 1 && w.placeFirst)} title={placeText(place)}>
          {place}
        </span>
        <span className={w.personWho}>
          <span className={w.personName}>
            <span dir="auto">{name}</span>
            {entry.is_demo && <DemoTag size="row" />}
          </span>
          {entry.child && (
            <span className={w.personChild} dir="auto">
              {entry.child}
            </span>
          )}
        </span>
        <span className={cx(w.standing, STANDING_CLASS[standing.tone])}>{standing.word}</span>
        <ChevronDown className={w.chevron} aria-hidden="true" />
      </button>
      <Fold open={open} id={panelId} innerClassName={w.personBody}>
        {facts.length > 0 && <p className={w.facts}>{facts.join(' · ')}</p>}
        <ToldLines entry={entry} now={now} />
        {/* "אולי פשוט אפשר להתקשר ולהגיד לו שיש יום אחר": the number, and the lessons that have room now. */}
        {renderSummary?.(entry)}
        <WaitingActions
          entryId={entry.id}
          name={name}
          lesson={lesson}
          status={entry.status === 'freed' ? 'freed' : 'waiting'}
          busy={busy}
          onAct={onAct}
          notify={notify}
          entry={entry}
          onOpenChat={contactId ? () => onOpenChat(contactId) : undefined}
          // Somebody Kogo knows: one press to the card of the child the entry is about.
          customerCard={customerCardFor(entry)}
          now={now}
        />
      </Fold>
    </li>
  );
}

interface LessonProps extends Omit<PersonProps, 'entry' | 'fallbackPlace' | 'lesson' | 'open' | 'onToggle'> {
  lesson: WahubWaitingLesson;
  entries: WahubWaitingEntry[];
  open: boolean;
  /** Which people were opened or closed by a press. */
  toggledEntries: Readonly<Record<number, boolean>>;
  onToggle: (id: string, open: boolean) => void;
  onToggleEntry: (id: number, open: boolean) => void;
}

/** One lesson: its title row, and — once it is opened — its line. */
function Lesson({ lesson, entries, open, toggledEntries, now, busy, notify, onToggle, onToggleEntry, onAct, onOpenChat, renderSummary }: LessonProps) {
  const freed = lessonFreed(lesson, entries);
  const head = lessonHead(lesson, entries.length);
  const panelId = `waiting-lesson-${lesson.id}`;
  // The first in line whose place was freed is the one to start from: open, unless it was closed by a press.
  const lead = entries.find((entry) => entry.status === 'freed') ?? null;
  return (
    <section className={cx(w.lesson, freed && w.lessonFreed, open && w.lessonOpen)} aria-label={lesson.label}>
      <h3 className="m-0">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => onToggle(lesson.id, !open)} className={w.lessonHead}>
          <span className={w.lessonWhat}>
            {freed && (
              <span className={w.lessonNews}>
                <BellRing aria-hidden="true" />
                התפנה מקום
              </span>
            )}
            <span className={w.lessonTitle} dir="auto">
              {head.title}
            </span>
            {head.when && <span className={w.lessonWhen}>{head.when}</span>}
          </span>
          <span className={w.lessonNums}>
            {head.seats && <span className={w.lessonSeats}>{head.seats}</span>}
            <span className={w.lessonWaiters}>{head.waiters}</span>
          </span>
          <ChevronDown className={w.chevron} aria-hidden="true" />
        </button>
      </h3>
      <Fold open={open} id={panelId}>
        <ol className={w.people} aria-label="מי ממתין, לפי התור">
          {entries.map((entry, index) => {
            // The block of "להודיע ללקוח" that is open for this person keeps them open, whatever was pressed.
            const telling = notify?.open?.entryId === entry.id;
            return (
              <Person
                key={entry.id}
                entry={entry}
                fallbackPlace={index + 1}
                lesson={lesson.label}
                open={telling || (toggledEntries[entry.id] ?? entry.id === lead?.id)}
                now={now}
                busy={busy}
                notify={notify}
                onToggle={onToggleEntry}
                onAct={onAct}
                onOpenChat={onOpenChat}
                renderSummary={renderSummary}
              />
            );
          })}
        </ol>
      </Fold>
    </section>
  );
}

export interface WaitingListViewProps {
  status: 'loading' | 'ready' | 'error';
  error: string;
  page: WahubWaitingListPage | null;
  /**
   * How many people wait, and how many of them call on the office now; null on a server that does not say — the
   * entries, and the freed places, are then what is counted.
   */
  people?: number | null;
  act?: number | null;
  now: Date;
  /** The list is being read again while it is on screen. */
  refreshing: boolean;
  /** Which lessons were opened or closed by a press; the rest follow the rule — a freed place is open. */
  toggledLessons: Readonly<Record<string, boolean>>;
  toggledEntries: Readonly<Record<number, boolean>>;
  busy: WaitingBusy | null;
  notify?: NotifyControls;
  onBack: () => void;
  onToggleLesson: (id: string, open: boolean) => void;
  onToggleEntry: (id: number, open: boolean) => void;
  onAct: (entryId: number, action: WaitingAction) => void;
  onOpenChat: (contactId: number) => void;
  onRetry: () => void;
  /** What stands in a person's opened row above the actions (the number to call, what could be offered instead). */
  renderSummary?: (entry: WahubWaitingEntry) => ReactNode;
}

/** The screen itself, drawn from what it is given; what was opened by a press is kept by WaitingListScreen. */
export function WaitingListView({
  status,
  error,
  page,
  people = null,
  act = null,
  now,
  refreshing,
  toggledLessons,
  toggledEntries,
  busy,
  notify,
  onBack,
  onToggleLesson,
  onToggleEntry,
  onAct,
  onOpenChat,
  onRetry,
  renderSummary,
}: WaitingListViewProps) {
  const words = page ? waitingStripText(page.counts) : null;
  const news = words ? (act !== null ? waitingActText(act) : words.freed) : '';
  const lessons = (page?.lessons ?? [])
    .map((lesson) => ({ lesson, entries: entriesOfLesson(lesson, page?.results ?? []) }))
    // A lesson none of whose entries is on screen has nothing to open.
    .filter((group) => group.entries.length > 0);

  return (
    <div className={w.wl}>
      <header className={w.wlHead}>
        <button type="button" onClick={onBack} aria-label="חזרה ללידים" title="חזרה ללידים" className={s.ib}>
          <ArrowRight aria-hidden="true" />
        </button>
        <div className={w.wlWho}>
          <h2 className={w.wlTitle}>{WAITING_LIST_TITLE}</h2>
          {words && (
            <p className={w.wlSub}>
              {people !== null ? waitersText(people) : words.total}
              {news && (
                <>
                  {' · '}
                  <strong>{news}</strong>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      <RefreshNote active={refreshing} className={s.refreshFloat} />

      <div className={w.wlScroll} aria-busy={status === 'loading' || refreshing}>
        {status === 'error' ? (
          <div role="alert" className={cx(l.note, s.emptyState, s.emptyTight)}>
            <div aria-hidden="true" className={cx(s.emptyIc, s.emptyIcBad)}>
              <AlertCircle />
            </div>
            <h3>לא הצלחנו לטעון את רשימת ההמתנה</h3>
            <p>{error || 'בדקו את החיבור ונסו שוב.'}</p>
            <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP, 'mt-1')}>
              נסו שוב
            </button>
          </div>
        ) : status === 'loading' ? (
          <LeadRowsSkeleton rows={4} />
        ) : lessons.length === 0 ? (
          <div className={l.note}>
            <EmptyState
              icon={<Hourglass />}
              title="אף אחד לא ממתין"
              text="כשחוג מלא והלקוח רוצה דווקא אותו, הוא נכנס לכאן — מהבוט, או מכרטיס הלקוח."
              tight
            />
          </div>
        ) : (
          lessons.map(({ lesson, entries }) => {
            const telling = entries.some((entry) => notify?.open?.entryId === entry.id);
            return (
              <Lesson
                key={lesson.id}
                lesson={lesson}
                entries={entries}
                open={telling || (toggledLessons[lesson.id] ?? lessonFreed(lesson, entries))}
                toggledEntries={toggledEntries}
                now={now}
                busy={busy}
                notify={notify}
                onToggle={onToggleLesson}
                onToggleEntry={onToggleEntry}
                onAct={onAct}
                onOpenChat={onOpenChat}
                renderSummary={renderSummary}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export type WaitingListScreenProps = Omit<WaitingListViewProps, 'toggledLessons' | 'toggledEntries' | 'onToggleLesson' | 'onToggleEntry' | 'renderSummary'>;

/**
 * What a person's opened row adds from the summary of what they asked for (ח.3.2): the number to call and the
 * lessons that have room right now. The lesson itself, its numbers and the place in the line already stand in
 * the rows above, so they are not said again. Read only once the row is opened — and not at all on a server that
 * does not sum it up (it says nothing of the customer on an entry either).
 */
function PersonSummary({ entry }: { entry: WahubWaitingEntry }) {
  const knows = entry.customer !== undefined && entry.contact_id != null;
  const detail = useLeadDetail(knows ? (entry.contact_id as number) : null, knows);
  const summary = summaryOfEntry(detail.data?.details.waiting_summary, entry.id);
  if (!summary) return null;
  return <WantedBlock summary={summary} compact bare />;
}

/** The screen with what it keeps: which lessons and which people were opened, or closed, by a press. */
export default function WaitingListScreen(props: WaitingListScreenProps) {
  const [lessons, setLessons] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<Record<number, boolean>>({});
  return (
    <WaitingListView
      {...props}
      renderSummary={(entry) => <PersonSummary entry={entry} />}
      toggledLessons={lessons}
      toggledEntries={people}
      onToggleLesson={(id, open) => setLessons((prev) => ({ ...prev, [id]: open }))}
      onToggleEntry={(id, open) => setPeople((prev) => ({ ...prev, [id]: open }))}
    />
  );
}
