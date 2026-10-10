'use client';

import { memo, useEffect, useRef } from 'react';
import { Inbox, Plug, Search, X } from 'lucide-react';
import { BOX_GROUPS, boxCount, boxesInGroup, handledByChip } from '@/lib/wahub/boxes';
import { displayName, formatListTime, previewText, waitingLabel } from '@/lib/wahub/format';
import type { WahubBox, WahubBoxCounts, WahubContact } from '@/types/wahub';
import type { ListStatus } from '../hooks/usePagedContacts';
import { ContactAvatar, EmptyState, ErrorState, Skeleton, Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface RowProps {
  contact: WahubContact;
  selected: boolean;
  /** The row was not in the list a moment ago: it comes in softly. */
  arrived: boolean;
  now: Date;
  onOpen: (id: number) => void;
}

/** One conversation in the list. Drawn again only when its own contact changed. */
const ChatRow = memo(function ChatRow({ contact, selected, arrived, now, onOpen }: RowProps) {
  const { chat } = contact;
  const unread = chat.unread_count > 0;
  const waiting = waitingLabel(chat.waiting_since, now);
  const who = handledByChip(contact);
  const preview = previewText(contact.last_message);

  return (
    <li className={arrived ? s.feedin : undefined}>
      <button
        type="button"
        onClick={() => onOpen(contact.id)}
        aria-current={selected ? 'true' : undefined}
        className={cx(s.listRow, selected && s.on, '!items-start')}
      >
        <ContactAvatar contact={contact} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cx(s.t1, 'truncate', unread && '!font-extrabold')} dir="auto">
              {displayName(contact)}
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

          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Who answers this conversation — on every row, so the state is never a guess (owner, 10.10). */}
            <span className={cx(s.rowTag, who.tone === 'human' ? s.pGold : s.pMute)}>{who.label}</span>
            {chat.needs_human && (
              <span className={cx(s.rowTag, s.pBad)}>
                <i className={s.pillDot} aria-hidden="true" />
                מבקש נציג
              </span>
            )}
            {waiting && <span className={cx(s.rowTag, s.pWarn)}>{waiting}</span>}
          </span>
        </span>
      </button>
    </li>
  );
});

function ListSkeletonRows() {
  return (
    <ul className={s.list} aria-busy="true" aria-label="טוען שיחות">
      {Array.from({ length: 8 }).map((_, row) => (
        <li key={row} className="flex items-start gap-2.5 px-2.5 py-2">
          <Skeleton className="h-10 w-10 shrink-0 !rounded-xl" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={s.paneHead}>
        <label className={s.search}>
          <Search aria-hidden="true" />
          <input
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
        <div className="mt-2.5 flex flex-col gap-1.5" role="group" aria-label="תיבות">
          {BOX_GROUPS.map((group) => (
            <div key={group.key} className={cx(s.chips, 'items-center')}>
              {group.label && <span className={s.boxGroupLabel}>{group.label}</span>}
              {boxesInGroup(group.key).map((def) => {
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
                    className={cx(s.chipbtn, active && s.on)}
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

      <div
        ref={scroller}
        className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain transition-opacity', status === 'refreshing' && 'opacity-60')}
        aria-busy={status === 'loading' || status === 'refreshing'}
      >
        {status === 'loading' ? (
          <ListSkeletonRows />
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
            <ul className={s.list} aria-label="שיחות">
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
