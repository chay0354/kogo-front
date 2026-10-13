'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Inbox, Plug, Search, X } from 'lucide-react';
import { BOX_GROUPS, boxCount, boxesInGroup, handledByChip } from '@/lib/wahub/boxes';
import { isDemoContact } from '@/lib/wahub/demo';
import { displayName, formatListTime, israelToday, previewText, waitingLabel } from '@/lib/wahub/format';
import { futureOf, waitingOf } from '@/lib/wahub/futureLeads';
import { leadOf, showsInList } from '@/lib/wahub/leadStage';
import type { WahubBox, WahubBoxCounts, WahubContact } from '@/types/wahub';
import f from '../future.module.css';
import type { ListStatus } from '../hooks/usePagedContacts';
import { LeadStageTag } from '../leads/LeadBits';
import { ContactAvatar, DemoTag, EmptyState, ErrorState, LiveTestTag, Spinner } from '../shared/bits';
import m from '../motion.module.css';
import { ListRowsSkeleton, RefreshNote } from '../shared/loading';
import { useStagger } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { FutureRowMark, WaitingRowMark } from './Notes';

interface RowProps {
  contact: WahubContact;
  selected: boolean;
  /** The row was not in the list a moment ago: it comes in softly. */
  arrived: boolean;
  now: Date;
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
 */
const ChatRow = memo(function ChatRow({ contact, selected, arrived, now, onOpen }: RowProps) {
  const { chat } = contact;
  const unread = chat.unread_count > 0;
  const waiting = waitingLabel(chat.waiting_since, now);
  const who = handledByChip(contact);
  const preview = previewText(contact.last_message);
  const lead = leadOf(contact);
  const demo = isDemoContact(contact);
  const liveTest = contact.live_test === true;
  const future = futureOf(contact);
  const waitingList = waitingOf(contact);
  const marks = lead ? demo || liveTest || who.tone === 'human' || Boolean(future) || Boolean(waitingList) : true;

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
                {displayName(contact)}
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

          {marks && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {lead ? (
                who.tone === 'human' && <span className={cx(s.rowTag, s.pGold)}>{who.label}</span>
              ) : (
                // Who answers this conversation — on every row, so the state is never a guess (owner, 10.10).
                // A phone shows only "נציג עונה"; the bot answering is the ordinary state there.
                <span className={cx(s.rowTag, who.tone === 'human' ? s.pGold : cx(s.pMute, s.rowWhoBot))}>{who.label}</span>
              )}
              {demo && <DemoTag size="row" />}
              {liveTest && <LiveTestTag size="row" />}
              {!lead && chat.needs_human && (
                <span className={cx(s.rowTag, s.pBad)}>
                  <i className={s.pillDot} aria-hidden="true" />
                  מבקש נציג
                </span>
              )}
              {!lead && waiting && <span className={cx(s.rowTag, s.pWarn)}>{waiting}</span>}
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
  const shown = useRef<{ ids: Set<number>; settled: boolean }>({ ids: new Set(), settled: false });
  const before = shown.current;
  const settled = status === 'ready';
  const newcomers = before.settled && settled ? items.filter((contact) => !before.ids.has(contact.id)).length : 0;
  // A whole page added by "load more" is not an arrival; a handful of rows is.
  const greet = newcomers > 0 && newcomers <= 5;
  useEffect(() => {
    shown.current = { ids: new Set(items.map((contact) => contact.id)), settled };
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

  const filtered = Boolean(search.trim()) || box !== 'all';
  // A list that was just read comes in a row at a time; once it is on screen its rows only move with the live update.
  const stagger = useStagger(status === 'ready');

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={cx(s.paneHead, s.listHead)}>
        <label className={cx(s.search, !searchShown && s.searchFolded)}>
          <Search aria-hidden="true" />
          <input
            ref={searchInput}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="חיפוש לפי שם, טלפון או טקסט"
            aria-label="חיפוש בשיחות"
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
          {BOX_GROUPS.map((group) => (
            <div key={group.key} className={cx(s.chips, 'items-center')}>
              {group.label && <span className={s.boxGroupLabel}>{group.label}</span>}
              {/* "פתוחות" and "לידים עתידיים" only where the server counts them. */}
              {boxesInGroup(group.key, counts).map((def) => {
                const active = box === def.key;
                const count = boxCount(counts, def.key);
                const loud = def.key === 'needs_human' && (count ?? 0) > 0 && !active;
                return (
                  <button
                    key={def.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onBox(def.key)}
                    title={def.hint}
                    className={cx(s.chipbtn, active && s.on, def.quiet && f.boxQuiet)}
                  >
                    {def.label}
                    {count !== null && (
                      <span className={cx(s.cnt, s.num, loud && s.cntHot)}>{count.toLocaleString('he-IL')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
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
          filtered ? (
            <EmptyState icon={<Search />} title="אין שיחות שמתאימות" text="נסו תיבה אחרת או חיפוש אחר." />
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
            <ul className={cx(s.list, stagger)} aria-label="שיחות">
              {items.map((contact) => (
                <ChatRow
                  key={contact.id}
                  contact={contact}
                  selected={contact.id === selectedId}
                  arrived={greet && !before.ids.has(contact.id)}
                  now={now}
                  onOpen={onOpen}
                />
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
          </>
        )}
      </div>
    </div>
  );
}
