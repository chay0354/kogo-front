'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { menuBadgeCount } from '@/lib/wahub/boxes';
import { buildWahubUrl, parseWahubUrl, type WahubUrlState } from '@/lib/wahub/params';
import { conversationOpen } from '@/lib/wahub/screens';
import type { WahubBotSub, WahubBox, WahubQueue, WahubTab } from '@/types/wahub';
import ChatsTab from './chats/ChatsTab';
import { useWahubLive } from './hooks/useWahubLive';
import { useWahubStatus, wahubKeys } from './hooks/useWahubQueries';
import { RefineHost, RefineProvider } from './refine/RefineContext';
import { PanelSkeleton } from './shared/loading';
import { cx } from './shared/tones';
import s from './wahub.module.css';
import WahubHead from './WahubHead';

/** A tab's code is on its way: the shape of a tab — a row of tiles and a card — holds its place. */
function TabLoading() {
  return <PanelSkeleton />;
}

// The page opens on the conversations. The other tabs — the chart library with
// them — are fetched when they are first opened.
const TodayTab = dynamic(() => import('./TodayTab'), { ssr: false, loading: TabLoading });
const LeadsTab = dynamic(() => import('./leads/LeadsTab'), { ssr: false, loading: TabLoading });
const SettingsTab = dynamic(() => import('./settings/SettingsTab'), { ssr: false, loading: TabLoading });
const BotTab = dynamic(() => import('./bot/BotTab'), { ssr: false, loading: TabLoading });
// The floating "יש הצעות לעדכון הבוט" button: part of the whole section, not of a tab.
const ProposalsFab = dynamic(() => import('./bot/review/ProposalsFab'), { ssr: false });

/**
 * The "וואטסאפ ולידים" section.
 *
 * One page, five tabs. The tab and the open conversation live in the address
 * (/wahub?tab=chats&contact=12), so a link opens exactly what was on screen.
 * The live update runs here, above the tabs, for as long as the page is open.
 *
 * "דיוק" — the small chat that fixes the bot — is held above the tabs as well:
 * a conversation and the bot tab both open the same one.
 */
export default function WahubPage() {
  return (
    <RefineProvider>
      <WahubSection />
    </RefineProvider>
  );
}

function WahubSection() {
  const searchParams = useSearchParams();
  const url = useMemo(() => parseWahubUrl(searchParams), [searchParams]);
  const { handle: live, boxes, offline } = useWahubLive();
  const status = useWahubStatus();
  const queryClient = useQueryClient();

  // A tab is built the first time it is opened and then kept: the conversations
  // list keeps its place, and a lead that was just marked is still where it was.
  const [visited, setVisited] = useState<ReadonlySet<WahubTab>>(() => new Set([url.tab]));
  useEffect(() => {
    setVisited((prev) => (prev.has(url.tab) ? prev : new Set(prev).add(url.tab)));
  }, [url.tab]);

  /**
   * Change what the address holds. Written straight to the history, which the
   * router follows — the page is not navigated, so nothing reloads or fades.
   */
  const go = useCallback((patch: Partial<WahubUrlState>, mode: 'push' | 'replace' = 'push') => {
    const current = parseWahubUrl(new URLSearchParams(window.location.search));
    const next = buildWahubUrl({ ...current, ...patch }, window.location.pathname);
    if (next === `${window.location.pathname}${window.location.search}`) return;
    if (mode === 'replace') window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
  }, []);

  // The address only carries the box, the open conversation and the queue of
  // the tab it is on. Each tab's own are remembered here while another tab is in
  // front, so coming back finds the same conversation and the same queue — and a
  // tab that is out of view is not told its view changed.
  const kept = useRef({
    box: url.box,
    contact: url.contact,
    queue: url.queue,
    stage: url.stage ?? null,
    sub: url.sub,
    item: url.item,
  });
  if (url.tab === 'chats') {
    kept.current.box = url.box;
    kept.current.contact = url.contact;
  }
  if (url.tab === 'leads') {
    kept.current.queue = url.queue;
    kept.current.stage = url.stage ?? null;
  }
  if (url.tab === 'bot') {
    kept.current.sub = url.sub;
    kept.current.item = url.item;
  }
  const chatsBox = kept.current.box;
  const chatsContact = kept.current.contact;
  const leadsQueue = kept.current.queue;
  const leadsStage = kept.current.stage;
  const botSub = kept.current.sub;
  const botItem = kept.current.item;

  // A question handed to "נסה שאלה" from elsewhere in the section (a fact just added).
  const [tryQuestion, setTryQuestion] = useState('');

  const openTab = useCallback(
    (tab: WahubTab) =>
      go({
        tab,
        box: kept.current.box,
        contact: kept.current.contact,
        queue: kept.current.queue,
        stage: kept.current.stage,
        sub: kept.current.sub,
        item: kept.current.item,
      }),
    [go],
  );
  const setBotSub = useCallback((sub: WahubBotSub) => go({ tab: 'bot', sub, item: null }, 'replace'), [go]);
  /** A knowledge item, from anywhere: the bot tab opens on it. */
  const openKnowledgeItem = useCallback(
    (id: number | null) => {
      const current = parseWahubUrl(new URLSearchParams(window.location.search));
      go({ tab: 'bot', sub: 'knowledge', item: id }, current.tab === 'bot' ? 'replace' : 'push');
    },
    [go],
  );
  const openTry = useCallback(
    (question: string) => {
      setTryQuestion(question);
      go({ tab: 'bot', sub: 'try', item: null });
    },
    [go],
  );
  const openReview = useCallback(() => go({ tab: 'bot', sub: 'review', item: null }), [go]);
  const openSettings = useCallback(() => go({ tab: 'settings' }), [go]);
  const openChat = useCallback(
    (id: number) => go({ tab: 'chats', contact: id, box: kept.current.box }),
    [go],
  );
  const goTo = useCallback(
    (target: { tab: WahubTab; box?: WahubBox; queue?: WahubQueue; stage?: string }) =>
      go({
        tab: target.tab,
        box: target.box ?? kept.current.box,
        // A box chosen from the "היום" tab opens on its list, not on whatever conversation was open before.
        contact: target.box ? null : kept.current.contact,
        queue: target.queue ?? kept.current.queue,
        // A lead state chosen from "היום" opens the leads tab on that state.
        stage: target.stage ?? kept.current.stage,
      }),
    [go],
  );
  const setBox = useCallback((box: WahubBox) => go({ box }, 'replace'), [go]);
  const setQueue = useCallback((queue: WahubQueue) => go({ queue }, 'replace'), [go]);
  const setStage = useCallback(
    (stage: string | null) => {
      // From the board into a state is a step "back" can undo (a phone shows one of the two at a time).
      const current = parseWahubUrl(new URLSearchParams(window.location.search));
      go({ tab: 'leads', stage }, !current.stage && stage ? 'push' : 'replace');
    },
    [go],
  );
  const openContact = useCallback(
    (id: number | null) => {
      // From the list into a conversation is a step "back" can undo; moving
      // between conversations, or closing one, is not worth a history entry each.
      const current = parseWahubUrl(new URLSearchParams(window.location.search));
      go({ contact: id }, current.contact == null && id != null ? 'push' : 'replace');
    },
    [go],
  );

  // The boxes moved: the day's figures and the number in the menu are due a fresh read.
  useEffect(() => {
    if (boxes) void queryClient.invalidateQueries({ queryKey: wahubKeys.summary });
  }, [boxes, queryClient]);

  const onChats = url.tab === 'chats';
  // On a phone an open conversation takes the whole screen: the title row, the
  // bottom bar and the floating button step aside (the stylesheet reads this mark).
  const chatOpen = conversationOpen(url);

  // The section paints its own ground, edge to edge of the page area: the
  // negative margins undo the shell's padding, and the stylesheet gives each
  // part its own (the title row, a tab that scrolls). The conversations run to
  // the edges, so the lavender ground of the sketch reaches the menu and the window.
  const bleed = '-mx-4 -my-4 sm:-mx-6 sm:-my-8';

  return (
    // The conversations tab fills the window like a messaging app; the other tabs scroll with the page.
    <div
      data-reveal-root
      data-chat-open={chatOpen ? '' : undefined}
      className={cx(
        s.wahub,
        s.shell,
        onChats && s.tabChats,
        bleed,
        'flex flex-col',
        onChats ? 'h-[100dvh] min-h-[560px]' : 'min-h-[100dvh]',
      )}
    >
      {/* The title, "חי" and the five tabs. The state of the connection is in the settings ("מצב המערכת"). */}
      <WahubHead active={url.tab} live={boxes !== null && !offline} needsHuman={menuBadgeCount(boxes)} onSelect={openTab} />

      {offline && (
        <p role="status" className={cx(s.strip, s.offlineStrip, 'shrink-0')}>
          <WifiOff aria-hidden="true" />
          אין חיבור, מנסה שוב
        </p>
      )}

      {(visited.has('chats') || onChats) && (
        <div
          role="tabpanel"
          id="wahub-panel-chats"
          aria-labelledby="wahub-tab-chats"
          className={onChats ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
        >
          <ChatsTab
            active={onChats}
            live={live}
            counts={boxes}
            box={chatsBox}
            contactId={chatsContact}
            status={status.data}
            onBox={setBox}
            onOpenContact={openContact}
            onOpenSettings={openSettings}
            onOpenKnowledgeItem={openKnowledgeItem}
          />
        </div>
      )}

      {url.tab === 'today' && (
        <div role="tabpanel" id="wahub-panel-today" aria-labelledby="wahub-tab-today" className={s.panel}>
          <TodayTab status={status.data} onGo={goTo} onOpenChat={openChat} />
        </div>
      )}

      {(visited.has('bot') || url.tab === 'bot') && (
        <div
          role="tabpanel"
          id="wahub-panel-bot"
          aria-labelledby="wahub-tab-bot"
          className={url.tab === 'bot' ? s.panel : 'hidden'}
        >
          <BotTab
            sub={botSub}
            status={status.data}
            openItemId={botItem}
            tryQuestion={tryQuestion}
            onSub={setBotSub}
            onOpenItem={openKnowledgeItem}
            onTryQuestion={openTry}
            onOpenChat={openChat}
            onDemoChanged={() => live.resync()}
          />
        </div>
      )}

      {(visited.has('leads') || url.tab === 'leads') && (
        <div
          role="tabpanel"
          id="wahub-panel-leads"
          aria-labelledby="wahub-tab-leads"
          className={url.tab === 'leads' ? s.panel : 'hidden'}
        >
          <LeadsTab
            active={url.tab === 'leads'}
            live={live}
            queue={leadsQueue}
            stage={leadsStage}
            status={status.data}
            onQueue={setQueue}
            onStage={setStage}
            onOpenChat={openChat}
            onOpenSettings={openSettings}
          />
        </div>
      )}

      {url.tab === 'settings' && (
        <div role="tabpanel" id="wahub-panel-settings" aria-labelledby="wahub-tab-settings" className={s.panel}>
          <SettingsTab
            status={status.data}
            statusLoading={status.isLoading}
            statusError={status.isError}
            onRetryStatus={() => void status.refetch()}
            onOpenChat={openChat}
          />
        </div>
      )}

      <ProposalsFab onOpenChat={openChat} onOpenItem={(id) => openKnowledgeItem(id)} onOpenReview={openReview} />
      {/* Inside the wrapper, where the section's colours are set. */}
      <RefineHost />
    </div>
  );
}
