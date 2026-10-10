'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plug, RefreshCw, Search, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { fetchWahubCounts } from '@/lib/wahubApi';
import {
  INTEREST_LABELS,
  LEAD_QUEUES,
  OUTCOME_LABELS,
  TOPIC_LABELS,
  labelOptions,
  learnLabels,
  matchesLeadView,
  queueCount,
  queueDef,
} from '@/lib/wahub/boxes';
import { israelToday } from '@/lib/wahub/format';
import { patchContactsInPlace, replaceContactInPlace } from '@/lib/wahub/live';
import { countsParams } from '@/lib/wahub/params';
import type {
  WahubContact,
  WahubFollowupPatch,
  WahubQueue,
  WahubSharedFilters,
  WahubStatus,
  WahubTag,
} from '@/types/wahub';
import { useContactMutations, type ContactStore } from '../hooks/useContactMutations';
import { useNow } from '../hooks/useNow';
import { usePagedContacts } from '../hooks/usePagedContacts';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import { useWahubTags, wahubKeys } from '../hooks/useWahubQueries';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../shared/bits';
import { NUMBER_TONE, cx } from '../shared/tones';
import s from '../wahub.module.css';
import LeadCard from './LeadCard';
import NewLeadForm from './NewLeadForm';

const SEARCH_DELAY_MS = 300;

interface Filters {
  search: string;
  topic: string;
  interest: string;
  branch: string;
  outcome: string;
  tag: string;
}

const NO_FILTERS: Filters = { search: '', topic: '', interest: '', branch: '', outcome: '', tag: '' };
const NO_TAGS: WahubTag[] = [];

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={s.field}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CardsSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="טוען לידים">
      {Array.from({ length: 4 }).map((_, card) => (
        <div key={card} className={s.card}>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-3 h-16 !rounded-xl" />
          <Skeleton className="mt-3 h-8 w-3/4" />
        </div>
      ))}
    </div>
  );
}

interface LeadsTabProps {
  live: WahubLiveHandle;
  queue: WahubQueue;
  status: WahubStatus | undefined;
  onQueue: (queue: WahubQueue) => void;
  onOpenChat: (id: number) => void;
  onOpenSettings: () => void;
}

/**
 * The leads tab: work queues with their counts, filters, and a card per lead.
 *
 * Two rules shape it. The order is the server's and a mark never moves a card:
 * a card marked while a queue is chosen stays where it is until the view is
 * changed. And registered customers, and people whose trial is still ahead,
 * are not shown unless the switch at the bottom asks for them.
 */
export default function LeadsTab({ live, queue, status, onQueue, onOpenChat, onOpenSettings }: LeadsTabProps) {
  const now = useNow(60_000);
  const today = israelToday(now);
  const queryClient = useQueryClient();
  const tags = useWahubTags();
  const { branches } = useScopedBranches();

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Leads that came in, or came to belong here, since the list was read. They are offered, not inserted. */
  const [arrived, setArrived] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(filters.search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const shared = useMemo<WahubSharedFilters>(
    () => ({
      search: searchQuery,
      topic: filters.topic,
      interest: filters.interest,
      branch: filters.branch,
      outcome: filters.outcome,
      tag: filters.tag,
    }),
    [searchQuery, filters.topic, filters.interest, filters.branch, filters.outcome, filters.tag],
  );
  const query = useMemo(() => ({ view: 'leads' as const, queue, showHidden, ...shared }), [queue, showHidden, shared]);
  const list = usePagedContacts({ query, enabled: true, live, sorted: false });
  const { update: updateList, find: findInList, itemsRef, markDirty, reload } = list;

  const countsKey = countsParams(shared, { showHidden });
  const counts = useQuery({
    queryKey: ['wahub', 'counts', countsKey],
    queryFn: () => fetchWahubCounts(shared, { showHidden }),
    refetchInterval: 30_000,
    staleTime: 5_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const refetchCounts = counts.refetch;

  const viewRef = useRef({ queue, showHidden, filters: shared });
  viewRef.current = { queue, showHidden, filters: shared };

  // A change of view starts a fresh list, so what "arrived" since the old one no longer applies.
  const viewKey = JSON.stringify([queue, showHidden, countsKey]);
  useEffect(() => {
    setArrived(new Set());
  }, [viewKey]);

  const store = useMemo<ContactStore>(
    () => ({
      get: findInList,
      // In place, always: the card keeps its position whatever the mark says.
      put: (contact) => updateList((items) => replaceContactInPlace(items, contact)),
    }),
    [findInList, updateList],
  );
  const mutations = useContactMutations(store, live, () => {
    // The card stays; the numbers on the tiles and in the menu follow the mark.
    markDirty();
    void refetchCounts();
    void queryClient.invalidateQueries({ queryKey: wahubKeys.summary });
  });
  const { isPending } = mutations;

  useEffect(
    () =>
      live.subscribe(({ contacts }) => {
        const fresh = contacts.filter((contact) => !isPending(contact.id));
        if (!fresh.length) return;
        const onScreen = new Set(itemsRef.current.map((contact) => contact.id));
        updateList((items) => patchContactsInPlace(items, fresh));
        const view = viewRef.current;
        const newcomers = fresh.filter(
          (contact) => !onScreen.has(contact.id) && matchesLeadView(contact, view) === true,
        );
        if (newcomers.length) {
          setArrived((prev) => {
            const next = new Set(prev);
            newcomers.forEach((contact) => next.add(contact.id));
            return next;
          });
          void refetchCounts();
        }
      }),
    [isPending, itemsRef, live, refetchCounts, updateList],
  );

  const onFollowup = useCallback(
    (id: number, patch: WahubFollowupPatch) => void mutations.followup(id, patch),
    [mutations],
  );
  const onTags = useCallback((id: number, next: WahubTag[]) => void mutations.tags(id, next), [mutations]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function refreshList() {
    setArrived(new Set());
    void reload();
    void refetchCounts();
  }

  const learned = useMemo(() => learnLabels(list.items), [list.items]);
  const branchOptions = useMemo(
    () =>
      branches
        .map((branch) => ({ value: String(branch.id), label: branch.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'he')),
    [branches],
  );
  const allTags: WahubTag[] = tags.data ?? NO_TAGS;
  const tagOptions = allTags.map((tag) => ({ value: String(tag.id), label: tag.name }));

  const filtersOn = Object.values(filters).some(Boolean);
  const current = queueDef(queue);
  const queueCounts = counts.data?.queues;
  const hiddenCount = queueCount(queueCounts, 'hidden');
  const shownTotal = queueCount(queueCounts, queue) ?? list.total;

  return (
    <div className={cx(s.pg, 'flex flex-col gap-3.5')}>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8" aria-label="תורי עבודה">
        {LEAD_QUEUES.map((def) => {
          const active = queue === def.key;
          const count = queueCount(queueCounts, def.key);
          return (
            <button
              key={def.key}
              type="button"
              onClick={() => onQueue(def.key)}
              aria-pressed={active}
              title={def.hint || undefined}
              className={cx(s.card, s.kpi, active && s.kpiOn)}
            >
              <span className={s.kpiLabel}>{def.label}</span>
              <span className={cx(s.kpiValue, s.num, NUMBER_TONE[def.tone])}>
                {count === null ? '–' : count.toLocaleString('he-IL')}
              </span>
            </button>
          );
        })}
      </section>

      <section className={cx(s.card, 'flex flex-col gap-2.5')}>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className={cx(s.search, 'min-w-[220px] flex-1 !h-[38px]')}>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilter('search', event.target.value)}
              placeholder="חיפוש לפי שם, טלפון או טקסט"
              aria-label="חיפוש בלידים"
            />
            {filters.search && (
              <button type="button" onClick={() => setFilter('search', '')} aria-label="נקה חיפוש">
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            aria-expanded={creating}
            className={cx(s.btn, s.btnP, '!h-[38px]')}
          >
            <UserPlus aria-hidden="true" />
            ליד חדש
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="כל הנושאים"
            value={filters.topic}
            onChange={(value) => setFilter('topic', value)}
            options={labelOptions(TOPIC_LABELS, learned.topic)}
          />
          <FilterSelect
            label="כל רמות העניין"
            value={filters.interest}
            onChange={(value) => setFilter('interest', value)}
            options={labelOptions(INTEREST_LABELS, learned.interest)}
          />
          <FilterSelect
            label="כל הסניפים"
            value={filters.branch}
            onChange={(value) => setFilter('branch', value)}
            options={branchOptions}
          />
          <FilterSelect
            label="מה קרה אחרי הפנייה"
            value={filters.outcome}
            onChange={(value) => setFilter('outcome', value)}
            options={labelOptions(OUTCOME_LABELS, learned.outcome)}
          />
          <FilterSelect
            label="כל התגיות"
            value={filters.tag}
            onChange={(value) => setFilter('tag', value)}
            options={tagOptions}
          />
        </div>
        {filtersOn && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className={cx(s.chipbtn, 'self-start')}>
            <X aria-hidden="true" />
            ניקוי הסינון
          </button>
        )}
      </section>

      {creating && (
        <NewLeadForm
          onClose={() => setCreating(false)}
          onCreated={(contact: WahubContact) => {
            toast.success(`הליד נוסף${contact.name ? `: ${contact.name}` : ''}`);
            refreshList();
            void queryClient.invalidateQueries({ queryKey: wahubKeys.summary });
          }}
          onOpenExisting={onOpenChat}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className={cx(s.t1, 'm-0')}>
          {current.label}
          {shownTotal !== null && shownTotal !== undefined ? ` · ${shownTotal.toLocaleString('he-IL')}` : ''}
          {current.hint ? <span className={cx(s.muted, 'font-medium')}> — {current.hint}</span> : null}
        </p>
        {arrived.size > 0 && (
          <button type="button" onClick={refreshList} className={cx(s.chipbtn, s.on, s.feedin)}>
            <RefreshCw aria-hidden="true" />
            {arrived.size === 1 ? 'נכנסה פנייה חדשה' : `נכנסו ${arrived.size} פניות חדשות`} · הצג
          </button>
        )}
      </div>

      {list.status === 'loading' ? (
        <CardsSkeleton />
      ) : list.status === 'error' ? (
        <div className={s.card}>
          <ErrorState title="לא הצלחנו לטעון את הלידים" text={list.error} onRetry={() => void reload()} />
        </div>
      ) : list.items.length === 0 ? (
        <div className={s.card}>
          {filtersOn ? (
            <EmptyState icon={<Search />} title="אין פניות שמתאימות לסינון" />
          ) : queue !== 'all' ? (
            <EmptyState icon={<Inbox />} title="אין כאן אף אחד כרגע" />
          ) : status && !status.inbound_configured ? (
            <EmptyState
              icon={<Plug />}
              title="הוואטסאפ עוד לא מחובר"
              text="כשמחברים את ההעתק מ-ManyChat, כל מי שכותב ייכנס לכאן לבד. אפשר גם להוסיף ליד ביד."
            >
              <button type="button" onClick={onOpenSettings} className={cx(s.btn, s.btnP)}>
                להגדרות החיבור
              </button>
            </EmptyState>
          ) : (
            <EmptyState icon={<Inbox />} title="אין פניות עדיין" />
          )}
        </div>
      ) : (
        <section
          className={cx('flex flex-col gap-3.5 transition-opacity', list.status === 'refreshing' && 'opacity-60')}
          aria-busy={list.status === 'refreshing'}
        >
          {list.items.map((contact) => (
            <LeadCard
              key={contact.id}
              contact={contact}
              today={today}
              now={now}
              allTags={allTags}
              onFollowup={onFollowup}
              onTags={onTags}
              onOpenChat={onOpenChat}
            />
          ))}
        </section>
      )}

      {list.hasMore && list.status !== 'loading' && (
        <button
          type="button"
          onClick={() => void list.loadMore()}
          disabled={list.loadingMore}
          className={cx(s.btn, 'mx-auto')}
        >
          {list.loadingMore && <Spinner />}
          הצג עוד
        </button>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={showHidden}
        onClick={() => setShowHidden((value) => !value)}
        className={cx(s.switchRow, 'mx-auto')}
      >
        <span className={s.switch} aria-hidden="true" />
        הצג גם לקוחות רשומים וממתינים לניסיון
        {hiddenCount !== null ? ` (${hiddenCount.toLocaleString('he-IL')})` : ''}
      </button>
    </div>
  );
}
