'use client';

import { AlertCircle, Bot, CheckCircle2, ChevronDown, ChevronLeft, Inbox, PauseCircle, Search, X } from 'lucide-react';
import { LEADS_VIEW_LABELS, emptyWords, stageOptionText } from '@/lib/wahub/leadsV2';
import { SEARCH_TEXT, notFoundWords } from '@/lib/wahub/search';
import type { WahubLeadCounts, WahubLeadRow, WahubLeadStageCount, WahubLeadsView } from '@/types/wahub';
import type { WahubSearchExtras } from '@/types/wahubSearch';
import { EmptyState, Skeleton, Spinner } from '../../shared/bits';
import { RefreshNote } from '../../shared/loading';
import { EverywhereStrip, FoundContacts, SystemCustomers } from '../../shared/SearchParts';
import { cx } from '../../shared/tones';
import m from '../../motion.module.css';
import s from '../../wahub.module.css';
import LeadRow from './LeadRow';
import l from './leads.module.css';
import { WaitingWay } from './WaitingBits';

export interface LeadsListProps {
  /** Which of the three lists is in front. */
  view: WahubLeadsView;
  /** The three numbers; null until the server has answered once. */
  counts: WahubLeadCounts | null;
  /** The state the list is narrowed to; null is all of them. */
  stage: string | null;
  /** The states that have someone in them — the one filter's choices. */
  stages: WahubLeadStageCount[];
  search: string;
  status: 'loading' | 'ready' | 'error';
  error: string;
  rows: WahubLeadRow[];
  /** The rows on screen answer what was asked a moment ago, not what is asked now. */
  stale: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  /** Rows are on screen and are being read again. */
  refreshing: boolean;
  /** The lead whose details are open. */
  selectedId: number | null;
  now: Date;
  sendingOn: boolean | null;
  /**
   * Messages whose time has come and did not go out, in a sentence ("3 הודעות היו יוצאות עכשיו — השליחה
   * כבויה") — for the head of "הבוט מטפל". Empty: there are none, and there is no strip.
   */
  held?: string;
  /** The strip was pressed: to the card in the settings that says what is missing. */
  onHeld?: () => void;
  /**
   * The waiting list in numbers — the quiet way into its screen, at the head of the two open lists
   * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז.1). Null: the server has no waiting list, and there is no way in.
   */
  waitingList?: { waiting: number; freed: number } | null;
  /**
   * How many people wait, and how many of them call on the office now (a place was freed, or the customer
   * answered); null when the server does not say.
   */
  waitingPeople?: number | null;
  waitingAct?: number | null;
  onWaitingList?: () => void;
  /**
   * The rows are the results of a search through every list — "מחכים לך", "הבוט מטפל", "מחכים שיתפנה מקום" and
   * "נסגרו" at once (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1.3). No tab is then the one in front, each row
   * says which list it stands in, and what matched is marked.
   */
  everywhere?: boolean;
  /** The search the rows answer. */
  found?: string;
  /** What the search brought beside its rows. */
  extras?: WahubSearchExtras | null;
  /** To a conversation — of somebody the search found who is not a lead. */
  onOpenChat?: (id: number) => void;
  onView: (view: WahubLeadsView) => void;
  onStage: (stage: string | null) => void;
  onSearch: (value: string) => void;
  onOpen: (id: number) => void;
  onMore: () => void;
  onRetry: () => void;
}

/** The rows on their way, each at a row's own height, so nothing moves when they land. */
export function LeadRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className={l.rows} aria-busy="true" aria-label="טוען את הלידים">
      {Array.from({ length: rows }).map((_, row) => (
        <li key={row} className={l.skRow}>
          <span className={l.skLines}>
            <Skeleton className={l.skLine} style={{ width: `${26 + ((row * 11) % 18)}%` }} />
            <Skeleton className={cx(l.skLine, l.skLineSm)} style={{ width: `${68 + ((row * 7) % 24)}%` }} />
            <Skeleton className={cx(l.skLine, l.skLineSm)} style={{ width: `${30 + ((row * 9) % 16)}%` }} />
          </span>
          <Skeleton className={l.skBox} />
        </li>
      ))}
    </ul>
  );
}

function TabCount({ value, loud }: { value: number | undefined; loud?: boolean }) {
  if (value === undefined) return null;
  return <span className={cx(l.tabCount, s.num, loud && value > 0 && l.tabCountAct)}>{value.toLocaleString('he-IL')}</span>;
}

/**
 * The leads tab as one list (docs/WAHUB-CONTRACT-LEADS-V2.md, ה): two tabs —
 * who waits for the office, who the bot is handling — "נסגרו" as a quiet link
 * beside them, and one filter: the state (only states with someone in them)
 * and a search. No board of columns, no switches.
 *
 * Drawn from what it is given; the reading is the screen's (LeadsScreen).
 */
export default function LeadsList({
  view,
  counts,
  stage,
  stages,
  search,
  status,
  error,
  rows,
  stale,
  hasMore,
  loadingMore,
  refreshing,
  selectedId,
  now,
  sendingOn,
  held = '',
  onHeld,
  waitingList = null,
  waitingPeople = null,
  waitingAct = null,
  onWaitingList,
  everywhere = false,
  found = '',
  extras = null,
  onOpenChat,
  onView,
  onStage,
  onSearch,
  onOpen,
  onMore,
  onRetry,
}: LeadsListProps) {
  const filtered = Boolean(stage) || Boolean(search.trim());
  const total = counts ? counts[view] : null;
  // A search through every list that found nothing says what was looked for, and what was looked through.
  const empty = everywhere ? notFoundWords(found, 'leads', true) : emptyWords(view, counts, filtered);
  const beside = everywhere && extras && (extras.contacts.length > 0 || extras.customers.length > 0) && (
    <>
      {onOpenChat && <FoundContacts contacts={extras.contacts} query={found} onOpenChat={onOpenChat} />}
      <SystemCustomers customers={extras.customers} more={extras.customers_more} query={found} inset onOpenChat={onOpenChat} />
    </>
  );
  // A search looks everywhere: no list is the one in front while it is on, and a press on one leaves the search for it.
  const pick = (next: WahubLeadsView) => {
    if (everywhere) onSearch('');
    onView(next);
  };

  return (
    <>
      <header className={l.bar}>
        <div role="tablist" aria-label="הלידים" className={l.tabs}>
          {(['office', 'bot'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={!everywhere && view === key}
              onClick={() => pick(key)}
              className={cx(l.tab, !everywhere && view === key && l.tabOn)}
            >
              {LEADS_VIEW_LABELS[key]}
              <TabCount value={counts?.[key]} loud={key === 'office'} />
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={!everywhere && view === 'closed'}
          onClick={() => pick('closed')}
          className={cx(l.closedLink, !everywhere && view === 'closed' && l.closedOn)}
        >
          {LEADS_VIEW_LABELS.closed}
          {counts && <span className={s.num}>({counts.closed.toLocaleString('he-IL')})</span>}
        </button>

        <div className={l.filters}>
          <label className={cx(s.search, l.searchBox)}>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="שם או טלפון"
              aria-label="חיפוש בלידים"
              enterKeyHint="search"
            />
            {search && (
              <button type="button" onClick={() => onSearch('')} aria-label="נקה חיפוש">
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          {/* Only states that have someone in them; with none to choose between, the filter is not drawn at all. */}
          {!everywhere && (stages.length > 1 || stage) && (
            <label className={cx(l.stage, stage && l.stageOn)}>
              <select value={stage ?? ''} onChange={(event) => onStage(event.target.value || null)} aria-label="סינון לפי מצב">
                <option value="">{total != null ? `כל המצבים (${total.toLocaleString('he-IL')})` : 'כל המצבים'}</option>
                {stages.map((option) => (
                  <option key={option.key} value={option.key}>
                    {stageOptionText(option)}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
          )}
        </div>
      </header>

      {/* The lists are read again every half minute; a read that drags says so, quietly, at the foot. */}
      <RefreshNote active={refreshing} className={s.refreshFloat} />

      <div
        className={l.scroll}
        role="tabpanel"
        aria-label={everywhere ? SEARCH_TEXT.leadsEverywhere : LEADS_VIEW_LABELS[view]}
        aria-busy={status === 'loading' || refreshing}
      >
        {/* "מחכים שיתפנה מקום": a title of its own above the two open lists — not inside "מחכים לך", and not a
            tab. Out of the way of a search. */}
        {waitingList && onWaitingList && view !== 'closed' && !search.trim() && <WaitingWay counts={waitingList} people={waitingPeople} act={waitingAct} onOpen={onWaitingList} />}
        {/* The search looked through every list: said once, above its results. */}
        {everywhere && status !== 'error' && <EverywhereStrip words={SEARCH_TEXT.leadsEverywhere} count={status === 'ready' && !hasMore ? rows.length : null} inset />}
        {/* The bot planned, and nothing went out: said once, quietly, above its list — and it leads to what is missing. */}
        {view === 'bot' && held && (
          <button type="button" onClick={onHeld} className={cx(l.held, m.rise)}>
            <PauseCircle aria-hidden="true" />
            <span className={l.heldText}>{held}</span>
            <span className={l.heldGo}>
              מה חסר
              <ChevronLeft aria-hidden="true" />
            </span>
          </button>
        )}
        {status === 'error' ? (
          <div role="alert" className={cx(l.note, s.emptyState, s.emptyTight)}>
            <div aria-hidden="true" className={cx(s.emptyIc, s.emptyIcBad)}>
              <AlertCircle />
            </div>
            <h3>לא הצלחנו לטעון את הלידים</h3>
            <p>{error || 'בדקו את החיבור ונסו שוב.'}</p>
            <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP, 'mt-1')}>
              נסו שוב
            </button>
          </div>
        ) : status === 'loading' ? (
          <LeadRowsSkeleton />
        ) : rows.length === 0 ? (
          <div className={l.note}>
            <EmptyState
              icon={filtered ? <Search /> : view === 'office' ? <CheckCircle2 /> : view === 'bot' ? <Bot /> : <Inbox />}
              title={empty.title}
              text={empty.text || undefined}
              tight
            >
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    onSearch('');
                    onStage(null);
                  }}
                  className={cx(s.btn, s.btnSm)}
                >
                  נקה סינון
                </button>
              )}
            </EmptyState>
            {/* Not a lead — but somebody the system knows: a conversation, or a customer in Kogo. */}
            {beside}
          </div>
        ) : (
          <>
            <ul className={cx(l.rows, stale && l.stale)}>
              {rows.map((lead) => (
                <LeadRow
                  key={lead.contact_id}
                  lead={lead}
                  now={now}
                  sendingOn={sendingOn}
                  selected={lead.contact_id === selectedId}
                  closed={everywhere ? lead.list === 'closed' : view === 'closed'}
                  query={everywhere ? found : ''}
                  onOpen={onOpen}
                />
              ))}
            </ul>
            {hasMore && (
              <div className={l.more}>
                <button type="button" onClick={onMore} disabled={loadingMore} className={s.btn}>
                  {loadingMore && <Spinner className="h-3.5 w-3.5" />}
                  הצג עוד
                </button>
              </div>
            )}
            {!hasMore && beside}
          </>
        )}
      </div>
    </>
  );
}
