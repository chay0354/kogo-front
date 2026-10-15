'use client';

import { Fragment, memo, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Inbox, Plug, Search, X } from 'lucide-react';
import { BOX_GROUPS, boxCount, boxesInGroup, handledByChip, openEmptyWords } from '@/lib/wahub/boxes';
import { isDemoContact } from '@/lib/wahub/demo';
import { displayName, formatListTime, israelToday, previewText } from '@/lib/wahub/format';
import { futureOf, waitingOf } from '@/lib/wahub/futureLeads';
import { chatWaitTag, isOverdue, knowsOverdue, overdueHeadCount, pinnedCount } from '@/lib/wahub/overdue';
import { SEARCH_MAX_LENGTH, SEARCH_TEXT, chatPlace, notFoundWords } from '@/lib/wahub/search';
import { leadOf, showsInList } from '@/lib/wahub/leadStage';
import type { WahubBox, WahubBoxCounts, WahubContact } from '@/types/wahub';
import type { WahubSearchExtras } from '@/types/wahubSearch';
import type { ListStatus } from '../hooks/usePagedContacts';
import { LeadStageTag } from '../leads/LeadBits';
import { ContactAvatar, DemoTag, EmptyState, ErrorState, LiveTestTag, Spinner } from '../shared/bits';
import m from '../motion.module.css';
import { ListRowsSkeleton, RefreshNote } from '../shared/loading';
import { useStagger } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { FutureRowMark, WaitingRowMark } from '../shared/FutureParts';
import { PinnedEnd, PinnedHead, WaitMark } from '../shared/MarkParts';
import { EverywhereStrip, FoundLines, MarkedName, PlaceTag, SystemCustomers } from '../shared/SearchParts';
import { BoxChip, BoxHelpSheet, GroupHelpButton, type BoxHelpOpen } from './BoxHelp';

interface RowProps {
  contact: WahubContact;
  selected: boolean;
  /** The row was not in the list a moment ago: it comes in softly. */
  arrived: boolean;
  now: Date;
  /**
   * What was searched for, while the rows are a search's results — from every box
   * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1.2). The row then marks what matched, says in which box the
   * conversation stands, and why it was found. Empty: the row is the one it always was.
   */
  query?: string;
  onOpen: (id: number) => void;
}

/**
 * One conversation in the list. Drawn again only when its own contact changed.
 *
 * With a lead state from the server, the row carries one tag — the state,
 * beside the name, and only when it calls for action — in place of the row of
 * small marks (docs/WAHUB-CONTRACT-LEAD-STAGES.md, ב). What says who this is
 * stays: an invented contact, a live test, a person answering. On a server
 * that has no lead state yet the row is as it was.
 *
 * A future lead and the waiting list are marks of their own
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ה): quiet while they only wait, and
 * standing out once the day has come, the customer wrote, or a place was freed.
 *
 * How long the customer waits (ט.2): where the server says the conversation
 * waits for a person, the mark carries its words — the office's own hours — on
 * every such row, and past three of them it pulses softly and leads the row's
 * marks. "ביקש הסר" (ט.1) is not said on the row (owner, 15.10.2026): the card
 * and the leads keep it.
 */
const ChatRow = memo(function ChatRow({ contact, selected, arrived, now, query = '', onOpen }: RowProps) {
  const { chat } = contact;
  const unread = chat.unread_count > 0;
  const wait = chatWaitTag(chat, now);
  // The server's own words for somebody who waits for a person — or the mark the screen always drew by itself.
  const personWaits = Boolean(wait) && knowsOverdue(contact) && (chat.overdue === true || Boolean(chat.waiting_label));
  const who = handledByChip(contact);
  const preview = previewText(contact.last_message);
  const lead = leadOf(contact);
  const demo = isDemoContact(contact);
  const liveTest = contact.live_test === true;
  const future = futureOf(contact);
  const waitingList = waitingOf(contact);
  // A search's result says where it stands in the server's own word — the box. A future lead's own mark already
  // says it (with its day), so it is not said twice; and the box's word stands in place of the row's own marks
  // of the same thing: who answers, "מבקש נציג", how long they wait.
  const found = query ? chatPlace(chat) : null;
  const place = found && !(future && (chat.box === 'future' || chat.box === 'open')) ? found : null;
  // Somebody who waits for a person carries the mark beside whatever else the row says — unless the row is a
  // search's result, where the box's word already stands for it; past three office hours it is always there.
  // The screen's own mark stays where it always was: on a row with no lead state, outside a search.
  const waitShown = wait && (personWaits ? wait.overdue || !place : !place && !lead) ? wait : null;
  const marks = lead
    ? demo || liveTest || who.tone === 'human' || Boolean(future) || Boolean(waitingList) || Boolean(place) || Boolean(waitShown)
    : true;
  const name = displayName(contact);

  return (
    <li className={arrived ? m.drop : undefined}>
      <button
        type="button"
        onClick={() => onOpen(contact.id)}
        aria-current={selected ? 'true' : undefined}
        className={cx(s.listRow, selected && s.on, s.chatRow, '!items-start')}
      >
        <ContactAvatar contact={contact} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            {/* The state's tag stands beside the name; in a column too narrow for both it drops under it, whole. */}
            <span className={s.rowNameLine}>
              <span className={cx(s.t1, s.rowName, 'truncate', unread && '!font-extrabold')} dir="auto">
                <MarkedName name={name} query={query} />
              </span>
              {showsInList(lead) && <LeadStageTag lead={lead} needsHuman={chat.needs_human} size="row" />}
            </span>
            <span className={cx(s.rowTime, s.num)}>{formatListTime(contact.last_message_at, now)}</span>
          </span>

          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={cx(s.t2, 'truncate', unread && '!font-semibold')} dir="auto">
              {preview || 'עוד אין הודעות'}
            </span>
            {unread && (
              <span className={cx(s.unread, s.num)} aria-label={`${chat.unread_count} הודעות שלא נקראו`}>
                {chat.unread_count > 99 ? '99+' : chat.unread_count}
              </span>
            )}
          </span>

          {/* The phone that matched, and why the row was found when it was not by its name or its phone. */}
          <FoundLines query={query} phone={contact.phone_display || contact.phone} phoneShown={name === (contact.phone_display || contact.phone)} found={contact.found_by} />

          {marks && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* Past three office hours: the first thing the row's marks say. */}
              {waitShown?.overdue && <WaitMark tag={waitShown} />}
              {place ? (
                <PlaceTag label={place.label} tone={place.tone} />
              ) : lead ? (
                who.tone === 'human' && <span className={cx(s.rowTag, s.pGold)}>{who.label}</span>
              ) : (
                // Who answers this conversation — on every row, so the state is never a guess (owner, 10.10).
                // A phone shows only "נציג עונה"; the bot answering is the ordinary state there.
                <span className={cx(s.rowTag, who.tone === 'human' ? s.pGold : cx(s.pMute, s.rowWhoBot))}>{who.label}</span>
              )}
              {demo && <DemoTag size="row" />}
              {liveTest && <LiveTestTag size="row" />}
              {!place && !lead && chat.needs_human && (
                <span className={cx(s.rowTag, s.pBad)}>
                  <i className={s.pillDot} aria-hidden="true" />
                  מבקש נציג
                </span>
              )}
              {waitShown && !waitShown.overdue && <WaitMark tag={waitShown} />}
              {waitingList && <WaitingRowMark mark={waitingList} />}
              {future && <FutureRowMark future={future} today={israelToday(now)} now={now} />}
            </span>
          )}
        </span>
      </button>
    </li>
  );
});

interface ChatListProps {
  items: WahubContact[];
  status: ListStatus;
  error: string;
  hasMore: boolean;
  loadingMore: boolean;
  box: WahubBox;
  counts: WahubBoxCounts | null;
  search: string;
  /**
   * The search the rows on screen answer (the typed words, a moment later) — empty when they are a box's own.
   * While it stands the rows come from every box, and say so.
   */
  found?: string;
  /** How many the search found in all, when the server said. */
  total?: number | null;
  /** What the search brought beside its rows: customers in Kogo who have no conversation. */
  extras?: WahubSearchExtras | null;
  selectedId: number | null;
  now: Date;
  /** The copy from ManyChat is not connected yet, so an empty list is no surprise. */
  notConnected: boolean;
  onSearch: (value: string) => void;
  onBox: (box: WahubBox) => void;
  onOpen: (id: number) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
}

/**
 * The right-hand column: search, the boxes with their counts, and the
 * conversations — newest message first, the open one marked.
 */
export default function ChatList({
  items,
  status,
  error,
  hasMore,
  loadingMore,
  box,
  counts,
  search,
  found = '',
  total = null,
  extras = null,
  selectedId,
  now,
  notConnected,
  onSearch,
  onBox,
  onOpen,
  onLoadMore,
  onRetry,
  onOpenSettings,
}: ChatListProps) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  // On a phone the search field is folded behind a magnifier until it is
  // pressed, and stays out while something is typed. A desktop always shows it.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const searchShown = searchOpen || Boolean(search);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  // Which contacts the list already showed. One that was not there at the last
  // draw of a list already on screen is a newcomer, and gets the soft entrance;
  // a list that was just read (first load, another box, a search) gets none.
  const shown = useRef<{ ids: Set<number>; late: Set<number>; settled: boolean }>({ ids: new Set(), late: new Set(), settled: false });
  const before = shown.current;
  const settled = status === 'ready';
  const newcomers = before.settled && settled ? items.filter((contact) => !before.ids.has(contact.id)).length : 0;
  // A whole page added by "load more" is not an arrival; a handful of rows is.
  const greet = newcomers > 0 && newcomers <= 5;
  // A conversation that crossed the three hours while it was on screen rises to the head of the list: it comes
  // in softly there, like a row that just arrived — it did, to its new place.
  const justLate = (contact: WahubContact) => isOverdue(contact) && before.ids.has(contact.id) && !before.late.has(contact.id);
  const risen = before.settled && settled ? items.filter(justLate).length : 0;
  const greetRisen = risen > 0 && risen <= 3;
  useEffect(() => {
    shown.current = {
      ids: new Set(items.map((contact) => contact.id)),
      late: new Set(items.filter(isOverdue).map((contact) => contact.id)),
      settled,
    };
  }, [items, settled]);

  // Reaching the end of the list loads the next page; the button under it does the same.
  useEffect(() => {
    const target = sentinel.current;
    const root = scroller.current;
    if (!target || !root || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreRef.current();
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

  const searching = Boolean(search.trim());
  // The tab opens on "פתוחות"; with nobody in it the list says so, and shows the way to every conversation.
  const nothingOpen = box === 'open' && !searching;
  const filtered = searching || (box !== 'all' && !nothingOpen);
  const openEmpty = openEmptyWords(counts);
  // The rows are a search's results: from every box, whatever was chosen. Until the answer to what is typed now
  // has landed, the rows of a moment ago are not passed off as its results.
  const results = searching && Boolean(found);
  const notFound = notFoundWords(found || search, 'chats', extras !== null);
  const customers = results && extras ? extras.customers : [];
  // Whoever has waited for a person more than three office hours stands at the head of the list, in the
  // server's own order (ט.2.4), under one quiet line. A search keeps its own order, and pins nobody.
  const pinned = searching ? 0 : pinnedCount(items);
  // A list that was just read comes in a row at a time; once it is on screen its rows only move with the live update.
  const stagger = useStagger(status === 'ready');
  // "מה זה אומר?" — one box's words (a long press) or a whole group's (its "?"), under the boxes.
  const [help, setHelp] = useState<BoxHelpOpen | null>(null);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={cx(s.paneHead, s.listHead, 'relative')}>
        <label className={cx(s.search, !searchShown && s.searchFolded)}>
          <Search aria-hidden="true" />
          <input
            ref={searchInput}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="חיפוש לפי שם, טלפון או טקסט"
            aria-label="חיפוש בשיחות"
            maxLength={SEARCH_MAX_LENGTH}
          />
          {search && (
            <button type="button" onClick={() => onSearch('')} aria-label="נקה חיפוש">
              <X aria-hidden="true" />
            </button>
          )}
        </label>

        {/* Two worlds, kept apart on purpose: what a person must handle, and what the bot handles (owner, 11.10). */}
        <div className={s.boxRows} role="group" aria-label="תיבות">
          {/* The magnifier of the phone: shown there only (see the stylesheet). */}
          <button
            type="button"
            onClick={() => {
              if (searchShown) {
                onSearch('');
                setSearchOpen(false);
              } else {
                setSearchOpen(true);
              }
            }}
            aria-expanded={searchShown}
            aria-label={searchShown ? 'סגור חיפוש' : 'חיפוש'}
            title={searchShown ? 'סגור חיפוש' : 'חיפוש'}
            className={cx(s.chipbtn, s.searchToggle, searchShown && s.on)}
          >
            {searchShown ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
          </button>
          {BOX_GROUPS.map((group) => {
            // "פתוחות", "ברכת יום הולדת" and "לידים עתידיים" only where the server counts them.
            const defs = boxesInGroup(group.key, counts);
            const groupOpen = help?.kind === 'group' && help.label === group.label;
            return (
              <div key={group.key} className={cx(s.chips, 'items-center')}>
                {group.label && <span className={s.boxGroupLabel}>{group.label}</span>}
                {group.label && (
                  <GroupHelpButton
                    label={group.label}
                    open={groupOpen}
                    onToggle={() => setHelp(groupOpen ? null : { kind: 'group', label: group.label, defs })}
                  />
                )}
                {defs.map((def) => {
                  // A search looks everywhere: no box is the one in front while it is on. A press on one leaves the
                  // search for that box.
                  const active = !searching && box === def.key;
                  const count = boxCount(counts, def.key);
                  const loud = def.key === 'needs_human' && (count ?? 0) > 0 && !active;
                  return (
                    <BoxChip
                      key={def.key}
                      def={def}
                      count={count}
                      active={active}
                      loud={loud}
                      onPress={() => {
                        setHelp(null);
                        if (searching) onSearch('');
                        onBox(def.key);
                      }}
                      onHold={(held) => setHelp({ kind: 'box', def: held })}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        <BoxHelpSheet open={help} onClose={() => setHelp(null)} />
      </div>

      {/* Another box or a search over a list already on screen: the rows stay, a quiet word says they are being read again. */}
      <RefreshNote active={status === 'refreshing'} className={s.refreshFloat} />
      <div
        ref={scroller}
        className={cx(s.listScroll, 'min-h-0 flex-1 overflow-y-auto overscroll-contain transition-opacity', status === 'refreshing' && 'opacity-60')}
        aria-busy={status === 'loading' || status === 'refreshing'}
      >
        {status === 'loading' ? (
          <ListRowsSkeleton />
        ) : status === 'error' ? (
          <ErrorState title="לא הצלחנו לטעון את השיחות" text={error} onRetry={onRetry} />
        ) : items.length === 0 ? (
          results ? (
            // Nothing was found: said with what was looked for and what was looked through — and, when Kogo knows
            // the number or the name, the customer it belongs to.
            <>
              <EverywhereStrip words={SEARCH_TEXT.chatsEverywhere} count={null} />
              <EmptyState icon={<Search />} title={notFound.title} text={notFound.text} tight={customers.length > 0} />
              <SystemCustomers customers={customers} more={Boolean(extras?.customers_more)} query={found} onOpenChat={onOpen} />
            </>
          ) : filtered ? (
            <EmptyState icon={<Search />} title="אין שיחות שמתאימות" text="נסו תיבה אחרת או חיפוש אחר." />
          ) : nothingOpen && !notConnected ? (
            <EmptyState icon={<CheckCircle2 />} title={openEmpty.title} text={openEmpty.text}>
              <button type="button" onClick={() => onBox('all')} className={cx(s.btn, s.btnP)}>
                {openEmpty.go}
              </button>
            </EmptyState>
          ) : notConnected ? (
            <EmptyState
              icon={<Plug />}
              title="הוואטסאפ עוד לא מחובר"
              text="כשמחברים את ההעתק מ-ManyChat, כל הודעה שנכנסת תופיע כאן מיד."
            >
              <button type="button" onClick={onOpenSettings} className={cx(s.btn, s.btnP)}>
                להגדרות החיבור
              </button>
            </EmptyState>
          ) : (
            <EmptyState icon={<Inbox />} title="אין שיחות עדיין" text="הודעה ראשונה שתיכנס תופיע כאן, בלי לרענן." />
          )
        ) : (
          <>
            {/* How many is said only of the answer that is on screen — never of the rows that were there a moment ago. */}
            {results && <EverywhereStrip words={SEARCH_TEXT.chatsEverywhere} count={status === 'ready' ? (total ?? (hasMore ? null : items.length)) : null} />}
            <ul className={cx(s.list, stagger)} aria-label={results ? SEARCH_TEXT.chatsEverywhere : 'שיחות'}>
              {pinned > 0 && <PinnedHead count={overdueHeadCount(pinned, box, counts, hasMore)} />}
              {items.map((contact, index) => (
                <Fragment key={contact.id}>
                  {pinned > 0 && index === pinned && <PinnedEnd />}
                  <ChatRow
                    contact={contact}
                    selected={contact.id === selectedId}
                    arrived={(greet && !before.ids.has(contact.id)) || (greetRisen && justLate(contact))}
                    now={now}
                    query={results ? found : ''}
                    onOpen={onOpen}
                  />
                </Fragment>
              ))}
            </ul>
            {hasMore && (
              <div ref={sentinel} className="flex justify-center p-3">
                <button type="button" onClick={onLoadMore} disabled={loadingMore} className={cx(s.btn, s.btnSm)}>
                  {loadingMore && <Spinner className="h-3.5 w-3.5" />}
                  טען עוד שיחות
                </button>
              </div>
            )}
            {!hasMore && <SystemCustomers customers={customers} more={Boolean(extras?.customers_more)} query={found} onOpenChat={onOpen} />}
          </>
        )}
      </div>
    </div>
  );
}
