'use client';

import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown, ChevronLeft, Inbox, Search, UserPlus, X } from 'lucide-react';
import { isDemoContact } from '@/lib/wahub/demo';
import { displayName, previewText } from '@/lib/wahub/format';
import { LEAD_GROUP_HINTS, findStage, leadDaysText, leadOf, oldestText } from '@/lib/wahub/leadStage';
import type { WahubContact, WahubLeadBoard, WahubLeadBoardGroup } from '@/types/wahub';
import { ContactAvatar, DemoTag, EmptyState, Spinner } from '../shared/bits';
import { AreaError, RefreshNote, RowsSkeleton } from '../shared/loading';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { LeadStageTag, TemperatureDot } from './LeadBits';

/** The people of the state on show (or of a search), in whatever state the read is in. */
export interface LeadPeopleState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  rows: WahubContact[];
  /** The server's count for the whole list. */
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** Rows are on screen and are being read again. */
  refreshing: boolean;
  /** The rows on screen answer the search typed a moment ago, not the one in the box: they are dimmed until theirs land. */
  stale: boolean;
  error: string;
}

export const NO_PEOPLE: LeadPeopleState = {
  status: 'idle',
  rows: [],
  total: null,
  hasMore: false,
  loadingMore: false,
  refreshing: false,
  stale: false,
  error: '',
};

export interface LeadBoardViewProps {
  board: WahubLeadBoard;
  /** The board is on screen and is being read again. */
  refreshing: boolean;
  now: Date;
  /** Room for the states and the people side by side. Otherwise one of the two at a time, with a way back. */
  twoPane: boolean;
  search: string;
  /** The search as it was sent to the server: with one, the people are whoever it found, across all states. */
  searching: boolean;
  /** The state whose people are on show. Null: the board alone (a narrow screen), or a search. */
  selectedKey: string | null;
  /** "סגור" is unfolded. It starts folded, and opens by itself when the state on show is one of its own. */
  closedOpen: boolean;
  people: LeadPeopleState;
  creating: boolean;
  /** "ליד חדש" as a card, when it is open. */
  newLeadForm?: ReactNode;
  onSearch: (value: string) => void;
  onStage: (key: string | null) => void;
  onToggleClosed: () => void;
  onToggleCreate: () => void;
  onMore: () => void;
  onRetryPeople: () => void;
  onOpenChat: (id: number) => void;
}

/** One person of a state: the name, why in one line, how long, and — in bold — what to do. The whole row opens the conversation. */
function PersonRow({
  contact,
  now,
  showStage,
  onOpen,
}: {
  contact: WahubContact;
  now: Date;
  /** In a search across all states the row also says which one this person is in. */
  showStage: boolean;
  onOpen: (id: number) => void;
}) {
  const lead = leadOf(contact);
  const why = lead?.reason || previewText(contact.last_message);
  const days = lead ? leadDaysText(lead, now) : '';
  return (
    <li>
      <button type="button" onClick={() => onOpen(contact.id)} className={cx(s.listRow, s.personRow)}>
        <ContactAvatar contact={contact} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cx(s.t1, s.personName, 'truncate')} dir="auto">
              {displayName(contact)}
            </span>
            <TemperatureDot temperature={lead?.temperature} />
            {isDemoContact(contact) && <DemoTag size="row" />}
            {showStage && lead && <LeadStageTag lead={lead} needsHuman={contact.chat.needs_human} size="row" />}
          </span>
          <span className={cx(s.personWhy, 'block truncate')} dir="auto" title={why || undefined}>
            {why || 'עוד אין פרטים'}
          </span>
          {lead?.next_step && (
            <strong className={cx(s.personNext, 'block')} dir="auto">
              {lead.next_step}
            </strong>
          )}
        </span>
        {days && <span className={cx(s.rowTime, s.personDays)}>{days}</span>}
        <ChevronLeft className={s.rowChevron} aria-hidden="true" />
      </button>
    </li>
  );
}

/** One of the three groups: its title and total, and a row per state — the label, the oldest, the number. */
function GroupCard({
  group,
  selectedKey,
  folded,
  onToggle,
  onStage,
}: {
  group: WahubLeadBoardGroup;
  selectedKey: string | null;
  /** "סגור" opens on a press; the other two are always open. */
  folded: boolean | null;
  onToggle: () => void;
  onStage: (key: string) => void;
}) {
  const open = folded !== true;
  const title = (
    <>
      <h3 className={s.groupTitle}>{group.label}</h3>
      <span className={cx(s.groupTotal, s.num, group.key === 'act' && group.total > 0 && s.groupTotalAct)}>
        {group.total.toLocaleString('he-IL')}
      </span>
      <span className={cx(s.groupHint, 'min-w-0 flex-1 truncate')}>{LEAD_GROUP_HINTS[group.key]}</span>
    </>
  );
  return (
    <section className={cx(s.card, s.cardFlush, s.leadGroup)} aria-label={group.label} data-group={group.key}>
      {folded === null ? (
        <div className={s.groupHead}>{title}</div>
      ) : (
        <button type="button" aria-expanded={open} onClick={onToggle} className={cx(s.groupHead, s.groupHeadBtn)}>
          {title}
          <ChevronDown className={cx(s.foldChevron, open && s.foldChevronOpen)} aria-hidden="true" />
        </button>
      )}
      {open &&
        (group.stages.length === 0 ? (
          <p className={cx(s.t2, 'm-0 px-4 py-3')}>אין מצבים בקבוצה הזו.</p>
        ) : (
          <ul className={s.list}>
            {group.stages.map((stage) => {
              const on = stage.key === selectedKey;
              const oldest = stage.count > 0 ? oldestText(stage.oldest_days) : '';
              return (
                <li key={stage.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onStage(stage.key)}
                    title={stage.hint || undefined}
                    className={cx(s.listRow, s.stageRow, on && s.on, stage.count === 0 && s.stageEmpty)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cx(s.t1, s.stageLabel, 'block truncate')}>{stage.label}</span>
                      {oldest && <span className={cx(s.t2, 'block truncate')}>{oldest}</span>}
                    </span>
                    <span className={cx(s.stageCount, s.num)}>{stage.count.toLocaleString('he-IL')}</span>
                    <ChevronLeft className={s.rowChevron} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

/**
 * The leads tab as a board (docs/WAHUB-CONTRACT-LEAD-STAGES.md, ב): three
 * groups — needs handling, in progress, closed (folded) — each a few rows of
 * states with a number. A press on a state lists its people: who, why, how
 * long, and what to do; a press on a person opens the conversation. One search
 * box and nothing else to filter by.
 *
 * Drawn from what it is given; the reading is the tab's (LeadsTab).
 */
export default function LeadBoardView({
  board,
  refreshing,
  now,
  twoPane,
  search,
  searching,
  selectedKey,
  closedOpen,
  people,
  creating,
  newLeadForm,
  onSearch,
  onStage,
  onToggleClosed,
  onToggleCreate,
  onMore,
  onRetryPeople,
  onOpenChat,
}: LeadBoardViewProps) {
  const selected = findStage(board, selectedKey);
  const showPeople = searching || selected !== null;
  // A narrow screen shows the states or the people of one of them — never both.
  const showStages = twoPane || !showPeople;
  const shownTotal = people.total ?? (searching ? null : selected?.stage.count ?? null);

  return (
    <div className={cx(s.pg, s.leadsScreen)}>
      {/* The board is read again every half minute; a read that drags says so, quietly, in the tab's corner. */}
      <RefreshNote active={refreshing} className={s.refreshCorner} />
      <div className={s.leadsBar}>
        <label className={cx(s.search, s.leadsSearch)}>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="חיפוש לפי שם, טלפון או טקסט"
            aria-label="חיפוש בלידים"
          />
          {search && (
            <button type="button" onClick={() => onSearch('')} aria-label="נקה חיפוש">
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        <button type="button" onClick={onToggleCreate} aria-expanded={creating} className={cx(s.btn, s.btnP, s.leadsNew)}>
          <UserPlus aria-hidden="true" />
          ליד חדש
        </button>
      </div>

      {board.pending_scan > 0 && (
        <p role="status" className={cx(s.t2, s.leadsScan)}>
          המערכת עוד עוברת על {board.pending_scan.toLocaleString('he-IL')} אנשי קשר – המספרים יתעדכנו לבד.
        </p>
      )}

      {newLeadForm}

      <div className={cx(s.leadsGrid, twoPane && s.leadsTwo)}>
        {showStages && (
          <div className={s.leadsStages} role="group" aria-label="מצבי הלידים">
            {board.groups.map((group) => (
              <GroupCard
                key={group.key}
                group={group}
                selectedKey={searching ? null : selectedKey}
                folded={group.key === 'closed' ? !closedOpen : null}
                onToggle={onToggleClosed}
                onStage={onStage}
              />
            ))}
          </div>
        )}

        {showPeople ? (
          <section
            className={cx(s.card, s.cardFlush, s.leadsPeople)}
            aria-label={searching ? 'תוצאות החיפוש' : selected?.stage.label}
            aria-busy={people.status === 'loading' || people.refreshing}
          >
            <header className={s.peopleHead}>
              {!twoPane && !searching && (
                <button type="button" onClick={() => onStage(null)} aria-label="חזרה לכל המצבים" title="חזרה לכל המצבים" className={s.ib}>
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h3 className={s.peopleTitle}>
                  {searching ? 'תוצאות החיפוש' : selected?.stage.label}
                  {shownTotal !== null && <span className={cx(s.num, s.peopleCount)}>{shownTotal.toLocaleString('he-IL')}</span>}
                </h3>
                {!searching && selected?.stage.hint && <p className={cx(s.t2, 'm-0 truncate')}>{selected.stage.hint}</p>}
              </div>
              <RefreshNote active={people.refreshing} />
            </header>

            {people.status === 'error' ? (
              <AreaError title="לא הצלחנו לטעון את הרשימה" text={people.error} onRetry={onRetryPeople} />
            ) : people.status !== 'ready' ? (
              <RowsSkeleton rows={6} tall label="טוען את הרשימה" />
            ) : people.rows.length === 0 ? (
              <EmptyState
                icon={searching ? <Search /> : <Inbox />}
                title={searching ? 'אין מי שמתאים לחיפוש' : 'אין כאן אף אחד כרגע'}
                tight
              />
            ) : (
              <>
                <ul className={cx(s.list, people.stale && s.dimmed)}>
                  {people.rows.map((contact) => (
                    <PersonRow key={contact.id} contact={contact} now={now} showStage={searching} onOpen={onOpenChat} />
                  ))}
                </ul>
                {people.hasMore && (
                  <div className={s.peopleMore}>
                    <button type="button" onClick={onMore} disabled={people.loadingMore} className={cx(s.btn, s.btnSm)}>
                      {people.loadingMore && <Spinner className="h-3.5 w-3.5" />}
                      הצג עוד
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          twoPane && (
            <section className={cx(s.card, s.leadsPeople)} aria-label="רשימת האנשים">
              <EmptyState icon={<Inbox />} title="אין כרגע מי שדורש טיפול" text="לחיצה על מצב מציגה את האנשים שבו." />
            </section>
          )
        )}
      </div>
    </div>
  );
}
