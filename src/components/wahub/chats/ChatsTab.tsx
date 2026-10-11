'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { attachShadowReplies } from '@/lib/wahub/bot';
import { matchesBox } from '@/lib/wahub/boxes';
import { isDemoContact } from '@/lib/wahub/demo';
import { israelToday } from '@/lib/wahub/format';
import { mergeLiveContacts } from '@/lib/wahub/live';
import { lastServerMessageId } from '@/lib/wahub/messages';
import { chatLayout, chatPanes, PHONE_MEDIA_QUERY } from '@/lib/wahub/screens';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { WahubBox, WahubBoxCounts, WahubContact, WahubStatus, WahubTag } from '@/types/wahub';
import { useVerdict } from '../bot/shadow/useVerdict';
import { useContactShadow } from '../hooks/useBotQueries';
import { useContactMutations, type ContactStore } from '../hooks/useContactMutations';
import { useContactThread, type ContactThread } from '../hooks/useContactThread';
import { useDemoChat } from '../hooks/useDemoChat';
import { useElementWidth } from '../hooks/useElementWidth';
import { useNow } from '../hooks/useNow';
import { usePagedContacts } from '../hooks/usePagedContacts';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import { useWahubTags, wahubKeys } from '../hooks/useWahubQueries';
import { EmptyState } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import ChatList from './ChatList';
import ChatThread from './ChatThread';
import ContactPanel from './ContactPanel';

const SEARCH_DELAY_MS = 300;
/** A search hides contacts the screen cannot place by itself; it re-reads the list for them, this often at most. */
const QUIET_REFRESH_GAP_MS = 5000;

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
  const queryClient = useQueryClient();
  const now = useNow();
  const today = israelToday(now);
  const tags = useWahubTags();
  const { ref: frameRef, width } = useElementWidth<HTMLDivElement>();
  // A phone is one screen at a time whatever the frame measures — the same
  // line the stylesheet draws the phone from, so the two never disagree.
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  const layout = chatLayout(width, phone);

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

  // A demo conversation is typed by the owner — words, a recording, a picture, several in a row — and the
  // new bot answers in it (docs/WAHUB-CONTRACT-REAL-DEMO.md, ג). Nothing goes out to WhatsApp.
  const demoChat = useDemoChat({
    contactId,
    // Only once the conversation on screen is this contact's own — never by the one that was open a moment ago.
    demo: contact != null && contact.id === contactId && isDemoContact(contact),
    threadRef,
    onContact: applyContact,
  });

  /**
   * "בדיקה חיה" on or off (docs/WAHUB-CONTRACT-LIVE-TEST.md): the server tags the person in ManyChat and answers
   * with the contact as it now stands. The list of settings and the status are due a fresh read afterwards.
   */
  function setLiveTest(id: number, on: boolean) {
    return withBusy('liveTest', async () => {
      const saved = await mutations.liveTest(id, on);
      if (!saved) return;
      void queryClient.invalidateQueries({ queryKey: wahubKeys.liveTestContacts });
      void queryClient.invalidateQueries({ queryKey: wahubKeys.status });
    });
  }
  const isManager = user?.role === 'manager';
  const allTags: WahubTag[] = tags.data ?? NO_TAGS;

  const panes = chatPanes(layout, contactId, detailsOpen);
  const showList = panes.list;
  const showThread = panes.thread;
  const showDetails = panes.details && contact != null;
  const showPlaceholder = panes.placeholder;

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
            onSimulate={demoChat.send}
            demoReply={demoChat.reply}
          />
        </section>
      )}

      {showDetails && contact && (
        <aside
          aria-label="פרטי איש הקשר"
          className={cx(s.pane, s.detailsPane, layout === 'wide' ? cx(s.paneLineStart, 'w-[348px] shrink-0') : 'flex-1')}
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
            liveTest={
              // Not for an invented customer, and not before the server knows the live test at all.
              contact.live_test === undefined || isDemoContact(contact) || !(isManager || contact.live_test)
                ? undefined
                : {
                    canEdit: isManager,
                    busy: Boolean(busy.liveTest),
                    onToggle: (on) => void setLiveTest(contact.id, on),
                  }
            }
            // The details stand in for the conversation here, so its actions come along; a wide
            // screen has them in the conversation's own header, right beside.
            actions={
              layout === 'wide'
                ? undefined
                : {
                    handoverBusy: Boolean(busy.handover),
                    resolveBusy: Boolean(busy.resolve),
                    onTakeover: () => void withBusy('handover', () => mutations.takeover(contact.id)),
                    onRelease: () => void withBusy('handover', () => mutations.release(contact.id)),
                    onResolveNeedsHuman: () => void withBusy('resolve', () => mutations.resolveNeedsHuman(contact.id)),
                  }
            }
          />
        </aside>
      )}
    </div>
  );
}
