'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, CalendarDays, MessagesSquare, Settings, Users, WifiOff } from 'lucide-react';
import { badgeText } from '@/lib/wahub/boxes';
import { buildWahubUrl, parseWahubUrl, type WahubUrlState } from '@/lib/wahub/params';
import type { WahubBotSub, WahubBox, WahubQueue, WahubTab } from '@/types/wahub';
import ChatsTab from './chats/ChatsTab';
import { useWahubLive } from './hooks/useWahubLive';
import { useWahubStatus, wahubKeys } from './hooks/useWahubQueries';
import { cx } from './shared/tones';
import s from './wahub.module.css';
import WahubStatusChips from './WahubStatusChips';

function TabLoading() {
  return <span className={cx(s.skeleton, 'h-72 !rounded-2xl')} aria-busy="true" aria-label="טוען" />;
}

// The page opens on the conversations. The other tabs — the chart library with
// them — are fetched when they are first opened.
const TodayTab = dynamic(() => import('./TodayTab'), { ssr: false, loading: TabLoading });
const LeadsTab = dynamic(() => import('./leads/LeadsTab'), { ssr: false, loading: TabLoading });
const SettingsTab = dynamic(() => import('./settings/SettingsTab'), { ssr: false, loading: TabLoading });
const BotTab = dynamic(() => import('./bot/BotTab'), { ssr: false, loading: TabLoading });
// The floating "יש הצעות לעדכון הבוט" button: part of the whole section, not of a tab.
const ProposalsFab = dynamic(() => import('./bot/review/ProposalsFab'), { ssr: false });

const TABS: Array<{ key: WahubTab; label: string; icon: typeof Users }> = [
  { key: 'chats', label: 'שיחות', icon: MessagesSquare },
  { key: 'today', label: 'היום', icon: CalendarDays },
  { key: 'leads', label: 'לידים', icon: Users },
  { key: 'bot', label: 'הבוט', icon: Bot },
  { key: 'settings', label: 'הגדרות', icon: Settings },
];

/**
 * The "וואטסאפ ולידים" section.
 *
 * One page, five tabs. The tab and the open conversation live in the address
 * (/wahub?tab=chats&contact=12), so a link opens exactly what was on screen.
 * The live update runs here, above the tabs, for as long as the page is open.
 */
export default function WahubPage() {
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
  const kept = useRef({ box: url.box, contact: url.contact, queue: url.queue, sub: url.sub, item: url.item });
  if (url.tab === 'chats') {
    kept.current.box = url.box;
    kept.current.contact = url.contact;
  }
  if (url.tab === 'leads') kept.current.queue = url.queue;
  if (url.tab === 'bot') {
    kept.current.sub = url.sub;
    kept.current.item = url.item;
  }
  const chatsBox = kept.current.box;
  const chatsContact = kept.current.contact;
  const leadsQueue = kept.current.queue;
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
    (target: { tab: WahubTab; box?: WahubBox; queue?: WahubQueue }) =>
      go({
        tab: target.tab,
        box: target.box ?? kept.current.box,
        // A box chosen from the "היום" tab opens on its list, not on whatever conversation was open before.
        contact: target.box ? null : kept.current.contact,
        queue: target.queue ?? kept.current.queue,
      }),
    [go],
  );
  const setBox = useCallback((box: WahubBox) => go({ box }, 'replace'), [go]);
  const setQueue = useCallback((queue: WahubQueue) => go({ queue }, 'replace'), [go]);
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

  const waitingForPerson = boxes ? (boxes.waiting ?? 0) + (boxes.needs_human ?? 0) : 0;
  const onChats = url.tab === 'chats';

  // The section paints its own ground, edge to edge of the page area: the
  // negative margins undo the shell's padding and the padding puts it back, so
  // the lavender ground of the sketch reaches the menu and the window's edges.
  const bleed = '-mx-4 -my-4 px-4 py-4 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-6';

  return (
    // The conversations tab fills the window like a messaging app; the other tabs scroll with the page.
    <div
      data-reveal-root
      className={cx(
        s.wahub,
        bleed,
        'flex flex-col gap-3',
        onChats ? 'h-[100dvh] min-h-[560px]' : 'min-h-[100dvh]',
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 max-lg:ps-12">
        <h1 className={s.h1}>וואטסאפ ולידים</h1>
        {/* The pulsing dot of the sketch: shown once a poll has answered, and while they keep answering. */}
        {boxes !== null && !offline && (
          <span className={s.subT} title="המסך מתעדכן לבד">
            <span className={s.dot} aria-hidden="true" />
            חי
          </span>
        )}
        <span className="flex-1" />
        <WahubStatusChips status={status.data} failed={status.isError} onOpenSettings={openSettings} />
      </header>

      {offline && (
        <p role="status" className={cx(s.strip, 'shrink-0')}>
          <WifiOff aria-hidden="true" />
          אין חיבור, מנסה שוב
        </p>
      )}

      <div role="tablist" aria-label="לשוניות" className={cx(s.seg, s.segLg, 'shrink-0 max-sm:!w-full')}>
        {TABS.map((tab) => {
          const active = url.tab === tab.key;
          const Icon = tab.icon;
          const badge = tab.key === 'chats' ? badgeText(waitingForPerson) : '';
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`wahub-tab-${tab.key}`}
              aria-selected={active}
              aria-controls={`wahub-panel-${tab.key}`}
              onClick={() => openTab(tab.key)}
              className={cx(active && s.on, 'max-sm:flex-1 max-sm:!px-2')}
            >
              <Icon aria-hidden="true" />
              {tab.label}
              {badge && (
                <span className={cx(s.segBadge, s.num)} aria-label={`${waitingForPerson} מחכים לתשובה או מבקשים נציג`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
        <div role="tabpanel" id="wahub-panel-today" aria-labelledby="wahub-tab-today">
          <TodayTab status={status.data} onGo={goTo} onOpenChat={openChat} />
        </div>
      )}

      {(visited.has('bot') || url.tab === 'bot') && (
        <div
          role="tabpanel"
          id="wahub-panel-bot"
          aria-labelledby="wahub-tab-bot"
          className={url.tab === 'bot' ? '' : 'hidden'}
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
          className={url.tab === 'leads' ? '' : 'hidden'}
        >
          <LeadsTab
            live={live}
            queue={leadsQueue}
            status={status.data}
            onQueue={setQueue}
            onOpenChat={openChat}
            onOpenSettings={openSettings}
          />
        </div>
      )}

      {url.tab === 'settings' && (
        <div role="tabpanel" id="wahub-panel-settings" aria-labelledby="wahub-tab-settings">
          <SettingsTab
            status={status.data}
            statusLoading={status.isLoading}
            statusError={status.isError}
            onRetryStatus={() => void status.refetch()}
          />
        </div>
      )}

      <ProposalsFab onOpenChat={openChat} onOpenItem={(id) => openKnowledgeItem(id)} onOpenReview={openReview} />
    </div>
  );
}
