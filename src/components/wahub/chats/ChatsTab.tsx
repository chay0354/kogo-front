'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { attachShadowReplies } from '@/lib/wahub/bot';
import { matchesBox } from '@/lib/wahub/boxes';
import { simulateInboundBody, type DemoSender } from '@/lib/wahub/demo';
import { israelToday } from '@/lib/wahub/format';
import { mergeLiveContacts } from '@/lib/wahub/live';
import { lastServerMessageId } from '@/lib/wahub/messages';
import { simulateWahubInbound } from '@/lib/wahubApi';
import type { WahubBox, WahubBoxCounts, WahubContact, WahubStatus, WahubTag } from '@/types/wahub';
import { useVerdict } from '../bot/shadow/useVerdict';
import { useContactShadow } from '../hooks/useBotQueries';
import { useContactMutations, type ContactStore } from '../hooks/useContactMutations';
import { useContactThread, type ContactThread } from '../hooks/useContactThread';
import { useElementWidth } from '../hooks/useElementWidth';
import { useNow } from '../hooks/useNow';
import { usePagedContacts } from '../hooks/usePagedContacts';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import { useWahubTags } from '../hooks/useWahubQueries';
import { EmptyState } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import ChatList from './ChatList';
import ChatThread from './ChatThread';
import ContactPanel from './ContactPanel';

/** Room for all three columns side by side. */
const WIDE_FROM = 1040;
/** Room for the list beside the conversation. Below it: one pane at a time. */
const MEDIUM_FROM = 680;
const SEARCH_DELAY_MS = 300;
/** A search hides contacts the screen cannot place by itself; it re-reads the list for them, this often at most. */
const QUIET_REFRESH_GAP_MS = 5000;

type Layout = 'wide' | 'medium' | 'narrow';

const NO_TAGS: WahubTag[] = [];

interface ChatsTabProps {
  /** The tab is the one on screen. Off screen it keeps its list but stops polling the open conversation. */
  active: boolean;
  live: WahubLiveHandle;
  counts: WahubBoxCounts | null;
  box: WahubBox;
  contactId: number | null;
  status: WahubStatus | undefined;
  onBox: (box: WahubBox) => void;
  onOpenContact: (id: number | null) => void;
  onOpenSettings: () => void;
  /** A knowledge item named under a shadow reply: the bot tab opens on it. */
  onOpenKnowledgeItem: (id: number) => void;
}

/**
 * The conversations screen: the list on the right, the conversation in the
 * middle, the person's details on the left. On a phone, one of them at a time.
 *
 * It is live: every three seconds the contacts that changed are merged into
 * the list by id and the list is put back in order — nothing is fetched again
 * and nothing blinks.
 */
export default function ChatsTab({
  active,
  live,
  counts,
  box,
  contactId,
  status,
  onBox,
  onOpenContact,
  onOpenSettings,
  onOpenKnowledgeItem,
}: ChatsTabProps) {
  const { user } = useAuth();
  const now = useNow();
  const today = israelToday(now);
  const tags = useWahubTags();
  const { ref: frameRef, width } = useElementWidth<HTMLDivElement>();
  const layout: Layout = width === null || width >= WIDE_FROM ? 'wide' : width >= MEDIUM_FROM ? 'medium' : 'narrow';

  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setDetailsOpen(false);
  }, [contactId]);

  const query = useMemo(() => ({ view: 'chats' as const, box, search: searchQuery }), [box, searchQuery]);
  const list = usePagedContacts({ query, enabled: true, live, sorted: true, keepId: contactId });
  const { update: updateList, find: findInList, itemsRef, markDirty, refreshQuietly: refreshListQuietly } = list;

  const boxRef = useRef(box);
  boxRef.current = box;
  const searchRef = useRef(searchQuery);
  searchRef.current = searchQuery;
  const openIdRef = useRef(contactId);
  openIdRef.current = contactId;
  const threadRef = useRef<ContactThread | null>(null);
  const lastQuietRefresh = useRef(0);

  const mergeIntoList = useCallback(
    (contacts: WahubContact[]) => {
      const openId = openIdRef.current;
      const result = mergeLiveContacts(itemsRef.current, contacts, {
        accepts: (contact) => matchesBox(contact, boxRef.current),
        keepIds: openId != null ? new Set([openId]) : undefined,
        insertUnknown: !searchRef.current,
      });
      updateList(() => result.list);
      if (result.removed) markDirty();
      if (result.unplaced && Date.now() - lastQuietRefresh.current > QUIET_REFRESH_GAP_MS) {
        lastQuietRefresh.current = Date.now();
        void refreshListQuietly();
      }
    },
    [itemsRef, markDirty, refreshListQuietly, updateList],
  );

  /** A newer copy of one contact, from any request: into the list, and into the open conversation. */
  const applyContact = useCallback(
    (contact: WahubContact) => {
      mergeIntoList([contact]);
      threadRef.current?.putContact(contact);
    },
    [mergeIntoList],
  );

  // Set below, once the saves exist; the conversation only calls it later, from its own requests.
  const isSavingRef = useRef<(id: number) => boolean>(() => false);
  const isSaving = useCallback((id: number) => isSavingRef.current(id), []);

  const thread = useContactThread({
    contactId,
    active,
    seed: contactId != null ? findInList(contactId) : undefined,
    onContact: applyContact,
    senderName: user?.first_name || null,
    isSaving,
  });
  threadRef.current = thread;

  const store = useMemo<ContactStore>(
    () => ({
      get(id) {
        const open = threadRef.current?.stateRef.current.contact;
        return open && open.id === id ? open : findInList(id);
      },
      put: applyContact,
    }),
    [applyContact, findInList],
  );
  const mutations = useContactMutations(store, live, (saved) => {
    // The log and the children found in Kogo only come with the whole contact.
    if (saved.id === openIdRef.current) void threadRef.current?.refreshQuietly();
  });
  const { isPending } = mutations;
  isSavingRef.current = isPending;

  // The live update: contacts that changed since the last poll.
  useEffect(
    () =>
      live.subscribe(({ contacts }) => {
        // A contact whose save is still on its way is left alone; the poll repeats it afterwards.
        const fresh = contacts.filter((contact) => !isPending(contact.id));
        if (!fresh.length) return;
        mergeIntoList(fresh);
        const openId = openIdRef.current;
        const mine = openId != null ? fresh.find((contact) => contact.id === openId) : undefined;
        if (mine) threadRef.current?.onLiveContact(mine);
      }),
    [isPending, live, mergeIntoList],
  );

  // Back after a while away, or more changed than one poll carries: read again, quietly.
  useEffect(
    () =>
      live.onResync(() => {
        void refreshListQuietly();
        void threadRef.current?.refreshQuietly();
      }),
    [live, refreshListQuietly],
  );

  async function withBusy(key: string, action: () => Promise<unknown>) {
    if (busy[key]) return;
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      await action();
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }

  const openContact = useCallback((id: number) => onOpenContact(id), [onOpenContact]);
  const contact = thread.contact;

  // The shadow bot's proposals for the open conversation (stage 2). Asked for
  // again whenever a newer message is in hand, because a proposal follows a
  // customer's message by a minute or so.
  const messagesVersion = lastServerMessageId(thread.messages) ?? 0;
  const shadow = useContactShadow(contactId, active && contactId != null, messagesVersion);
  const shadowReplies = shadow.data;
  const shadowByMessage = useMemo(
    () => attachShadowReplies(thread.messages, shadowReplies ?? []),
    [thread.messages, shadowReplies],
  );
  const shadowSummary = useMemo(
    () => (shadowReplies ? { count: shadowReplies.length, lastAt: shadowReplies[0]?.created_at ?? null } : null),
    [shadowReplies],
  );
  const { verdict: shadowVerdict, busyId: shadowBusyId } = useVerdict();

  /** A demo conversation: "the customer sent" / "the old bot answered", typed by the owner. Nothing goes out. */
  const simulate = useCallback(
    async (text: string, sender: DemoSender): Promise<boolean> => {
      const id = openIdRef.current;
      const body = simulateInboundBody(text, sender);
      if (id == null || !body) return false;
      try {
        const result = await simulateWahubInbound(id, body);
        if (result.contact) applyContact(result.contact);
        if (!result.stored) {
          // The server keeps one copy of the same line within thirty seconds (the inbound rule); the text stays in the box.
          toast.warning('לא נרשם: אותה הודעה נכנסה לפני פחות מ-30 שניות.');
          return false;
        }
        // The message itself comes with the conversation's own read, like any other.
        void threadRef.current?.refreshQuietly();
        return true;
      } catch (error) {
        toast.error(readableError(error, 'ההודעה המדומה לא נרשמה'));
        return false;
      }
    },
    [applyContact],
  );
  const allTags: WahubTag[] = tags.data ?? NO_TAGS;

  const showList = layout !== 'narrow' || contactId == null;
  const showThread = contactId != null && (layout === 'wide' || !detailsOpen);
  const showDetails = contactId != null && contact != null && (layout === 'wide' || detailsOpen);
  const showPlaceholder = contactId == null && layout !== 'narrow';

  // A pane that is out of view is hidden, not removed: its scroll position and
  // whatever was typed in it are still there when it comes back.
  return (
    <div ref={frameRef} className={s.chatFrame}>
      <aside
        aria-label="רשימת השיחות"
        className={
          showList
            ? cx(
                s.pane,
                'shrink-0',
                layout === 'narrow' ? 'w-full' : cx(s.paneLineEnd, layout === 'medium' ? 'w-[300px]' : 'w-[336px]'),
              )
            : 'hidden'
        }
      >
        <ChatList
          items={list.items}
          status={list.status}
          error={list.error}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          box={box}
          counts={counts}
          search={search}
          selectedId={contactId}
          now={now}
          notConnected={status ? !status.inbound_configured : false}
          onSearch={setSearch}
          onBox={onBox}
          onOpen={openContact}
          onLoadMore={() => void list.loadMore()}
          onRetry={() => void list.reload()}
          onOpenSettings={onOpenSettings}
        />
      </aside>

      {showPlaceholder && (
        <div className={cx(s.threadBg, 'flex min-w-0 flex-1 items-center justify-center')}>
          <EmptyState
            icon={<MessagesSquare />}
            title="בחרו שיחה מהרשימה"
            text="הודעות חדשות נכנסות לכאן לבד, בלי לרענן."
          />
        </div>
      )}

      {contactId != null && (
        <section aria-label="השיחה" className={showThread ? cx(s.pane, 'flex-1') : 'hidden'}>
          <ChatThread
            thread={thread}
            now={now}
            visible={active && showThread}
            simulated={Boolean(status?.simulate_send)}
            sendingOff={status ? !status.sending_enabled && !status.simulate_send : false}
            handoverBusy={Boolean(busy.handover)}
            resolveBusy={Boolean(busy.resolve)}
            showBack={layout === 'narrow'}
            showDetailsButton={layout !== 'wide'}
            onBack={() => onOpenContact(null)}
            onDetails={() => setDetailsOpen(true)}
            onTakeover={() => void withBusy('handover', () => mutations.takeover(contactId))}
            onRelease={() => void withBusy('handover', () => mutations.release(contactId))}
            onResolveNeedsHuman={() => void withBusy('resolve', () => mutations.resolveNeedsHuman(contactId))}
            onOpenSettings={onOpenSettings}
            shadowByMessage={shadowByMessage}
            shadowBusyId={shadowBusyId}
            onShadowVerdict={(reply, value, note) => void shadowVerdict(reply, value, note)}
            onOpenKnowledgeItem={onOpenKnowledgeItem}
            onSimulate={simulate}
          />
        </section>
      )}

      {showDetails && contact && (
        <aside
          aria-label="פרטי איש הקשר"
          className={cx(s.pane, layout === 'wide' ? cx(s.paneLineStart, 'w-[348px] shrink-0') : 'flex-1')}
        >
          <ContactPanel
            contact={contact}
            now={now}
            today={today}
            allTags={allTags}
            analyzing={Boolean(busy.analyze)}
            rechecking={Boolean(busy.recheck)}
            showBack={layout !== 'wide'}
            onBack={() => setDetailsOpen(false)}
            onFollowup={(patch) => void mutations.followup(contact.id, patch)}
            onTags={(next) => void mutations.tags(contact.id, next)}
            onRename={(name) => void mutations.rename(contact.id, name)}
            onRecheck={() => void withBusy('recheck', () => mutations.recheck(contact.id))}
            onAnalyze={() => void withBusy('analyze', () => mutations.analyze(contact.id))}
            shadow={shadowSummary}
          />
        </aside>
      )}
    </div>
  );
}
