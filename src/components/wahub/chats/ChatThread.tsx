'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, Bot, Check, Crosshair, Hand, Info, MessageCircle, PanelLeftOpen, Undo2, UserRound } from 'lucide-react';
import { formatWhatsAppLink } from '@/lib/customerUtils';
import { isDemoContact, type DemoInput } from '@/lib/wahub/demo';
import { agoText, displayName, hasName } from '@/lib/wahub/format';
import { groupMessagesByDay, isOptimistic } from '@/lib/wahub/messages';
import { SHADOW_HEADING, excerptLine, excerptOf, shadowExcerpt } from '@/lib/wahub/refine';
import { phoneStatusLine } from '@/lib/wahub/screens';
import type { WahubContactDetail, WahubSender, WahubShadowReply } from '@/types/wahub';
import type { ContactThread } from '../hooks/useContactThread';
import { useRefine } from '../refine/RefineContext';
import { RefineRow, RefineSelectBar } from '../refine/RefineRow';
import { useRefineSelection } from '../refine/useRefineSelection';
import { ContactAvatar, DemoTag, ErrorState, LiveTestTag, Skeleton, Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import Composer from './Composer';
import DemoComposer, { type DemoReplyControls } from './DemoComposer';
import MessageBubble, { TypingBubble } from './MessageBubble';
import ShadowRow from './ShadowRow';

/** Scrolling is settled before the browser paints; where there is no browser there is nothing to settle. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const NO_IDS: ReadonlySet<number> = new Set();

/** Close enough to the end to count as "reading the newest". */
const NEAR_BOTTOM_PX = 80;

/**
 * The senders whose made-up bubble (an id below zero) was on screen at the
 * last draw and is gone now: the server's copy took its place, so a message
 * from that sender that has just appeared is not a new arrival.
 */
function settledSenders(pending: ReadonlyMap<number, WahubSender>, messages: ReadonlyArray<{ id: number }>): Set<WahubSender> {
  const settled = new Set<WahubSender>();
  if (!pending.size) return settled;
  const current = new Set(messages.map((message) => message.id));
  pending.forEach((sender, id) => {
    if (!current.has(id)) settled.add(sender);
  });
  return settled;
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="טוען הודעות">
      {[56, 40, 64, 36, 52].map((width, index) => (
        <div key={index} className={cx(s.bubbleRow, index % 2 === 1 && s.bubbleRowOut)}>
          <Skeleton className="h-10 !rounded-[14px]" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}

interface ChatThreadProps {
  thread: ContactThread;
  now: Date;
  /** The conversation is on screen right now (not behind another tab or pane). */
  visible: boolean;
  simulated: boolean;
  /** The owner's switch is off: nothing may be sent to a customer yet. */
  sendingOff: boolean;
  /** Which of the two handover buttons is waiting for the server. */
  handoverBusy: boolean;
  resolveBusy: boolean;
  /** Narrow screens show one pane at a time and need a way back to the list. */
  showBack: boolean;
  /** The details pane is not beside the conversation, so the header offers it. */
  showDetailsButton: boolean;
  /**
   * A desktop whose card was put away ("הסתר כרטיס"): the header offers it back
   * ("הצג כרטיס") and carries "קח שיחה", which the card would otherwise hold.
   */
  onShowCard?: () => void;
  onBack: () => void;
  onDetails: () => void;
  onTakeover: () => void;
  onRelease: () => void;
  onResolveNeedsHuman: () => void;
  onOpenSettings: () => void;
  /** Stage 2: the shadow bot's proposal under the customer message it answers. */
  shadowByMessage?: ReadonlyMap<number, WahubShadowReply>;
  shadowBusyId?: number | null;
  onShadowVerdict?: (reply: WahubShadowReply, verdict: 'good' | 'bad', note: string) => void;
  onOpenKnowledgeItem?: (id: number) => void;
  /**
   * A demo contact's conversation is typed by the owner: words, a recording or
   * a picture "from the customer", and the old bot's answers. Resolves true
   * when the server kept the message.
   */
  onSimulate?: (input: DemoInput) => Promise<boolean>;
  /** The new bot answering in a demo conversation: its switch, "ענה עכשיו", and "הבוט כותב…". */
  demoReply?: DemoReplyControls;
}

/** Until the tab hands the real one over: the switch shows on, and nothing is asked of the server. */
const NO_REPLY: DemoReplyControls = { auto: true, armed: false, inFlight: false, setAuto: () => {}, replyNow: () => {} };

function ThreadHeader({
  contact,
  now,
  handoverBusy,
  showBack,
  showDetailsButton,
  onShowCard,
  onBack,
  onDetails,
  onTakeover,
  onRelease,
  refining,
  onRefine,
}: {
  contact: WahubContactDetail;
  now: Date;
  /** Messages are being marked for "דיוק". */
  refining: boolean;
  /** "דיוק": start marking messages, or stop. Absent where there is no small chat to open. */
  onRefine?: () => void;
} & Pick<
  ChatThreadProps,
  'handoverBusy' | 'showBack' | 'showDetailsButton' | 'onShowCard' | 'onBack' | 'onDetails' | 'onTakeover' | 'onRelease'
>) {
  const human = contact.chat.handled_by === 'human';
  const whatsapp = formatWhatsAppLink(contact.phone);
  const phone = contact.phone_display || contact.phone;
  const demo = isDemoContact(contact);
  const liveTest = contact.live_test === true;
  // The card and its actions are not on screen: a press away (a tablet), or put away (a desktop).
  const cardAway = showDetailsButton || Boolean(onShowCard);

  return (
    <header className={s.threadHead}>
      {showBack && (
        <button type="button" onClick={onBack} aria-label="חזרה לרשימת השיחות" className={s.ib}>
          <ArrowRight aria-hidden="true" />
        </button>
      )}
      <ContactAvatar contact={contact} />
      <div className="min-w-0 flex-1">
        {/* The name is a press away from the details; on a phone a short state line sits under it, as in a messaging app. */}
        <button type="button" onClick={onDetails} title="פרטי איש הקשר" className={s.threadName}>
          <span dir="auto">{displayName(contact)}</span>
          <span className={s.threadStatus}>{phoneStatusLine(contact.chat, demo, liveTest)}</span>
        </button>
        <p className={cx(s.t2, s.threadSub, 'm-0 flex flex-wrap items-center gap-x-2')}>
          {demo && <DemoTag />}
          {liveTest && <LiveTestTag />}
          {hasName(contact) && (
            <span dir="ltr" className={cx(s.num, 'select-all')}>
              {phone}
            </span>
          )}
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              WhatsApp
            </a>
          )}
          {contact.last_inbound_at && <span>כתב {agoText(contact.last_inbound_at, now)}</span>}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* "דיוק": mark what was not good in this conversation, and say why (docs/WAHUB-CONTRACT-REFINE.md). The
            only way into marking: a bubble has no shortcut of its own (docs/WAHUB-CONTRACT-POLISH-1.md, ב). */}
        {onRefine && (
          <>
            <button
              type="button"
              onClick={onRefine}
              aria-pressed={refining}
              title="דיוק: סמנו הודעות שלא היו טובות. המערכת מסכמת אותן ושואלת מה הבעיה"
              className={cx(s.btn, s.btnSm, s.deskOnly, refining && s.btnOn)}
            >
              <Crosshair aria-hidden="true" />
              דיוק
            </button>
            <button
              type="button"
              onClick={onRefine}
              aria-pressed={refining}
              aria-label="דיוק"
              title="דיוק"
              className={cx(s.ib, s.phoneIb, refining && s.ibNavy)}
            >
              <Crosshair aria-hidden="true" />
            </button>
          </>
        )}
        <span className={cx(s.pill, s.deskOnly, human ? s.handHuman : s.handBot)}>
          {human ? <UserRound aria-hidden="true" /> : <Bot aria-hidden="true" />}
          {human ? 'בטיפול שלך' : contact.chat.handled_by_label || 'הבוט עונה'}
        </span>
        {/*
          On a desktop the contact's card is open beside the conversation and carries this action
          ("פעולות"), so it is not said twice. Where the card is a press away — a tablet — or was put
          away, it stays here.
        */}
        {!cardAway ? null : human ? (
          <button type="button" onClick={onRelease} disabled={handoverBusy} className={cx(s.btn, s.btnSm, s.deskOnly)}>
            {handoverBusy ? <Spinner className="h-3.5 w-3.5" /> : <Undo2 aria-hidden="true" />}
            החזר לבוט
          </button>
        ) : (
          <button type="button" onClick={onTakeover} disabled={handoverBusy} className={cx(s.btn, s.btnSm, s.btnP, s.deskOnly)}>
            {handoverBusy ? <Spinner className="h-3.5 w-3.5" /> : <Hand aria-hidden="true" />}
            קח שיחה
          </button>
        )}
        {/* The phone keeps the same action as one icon at the end of the title row. */}
        <button
          type="button"
          onClick={human ? onRelease : onTakeover}
          disabled={handoverBusy}
          aria-label={human ? 'החזר לבוט' : 'קח שיחה'}
          title={human ? 'החזר לבוט' : 'קח שיחה'}
          className={cx(s.ib, s.phoneIb, human ? s.ibGold : s.ibNavy)}
        >
          {handoverBusy ? <Spinner /> : human ? <Undo2 aria-hidden="true" /> : <Hand aria-hidden="true" />}
        </button>
        {showDetailsButton && (
          <button
            type="button"
            onClick={onDetails}
            aria-label="פרטי איש הקשר"
            title="פרטי איש הקשר"
            className={cx(s.ib, s.deskOnly)}
          >
            <Info aria-hidden="true" />
          </button>
        )}
        {/* The card was put away: one small button brings it back, at the width it had. */}
        {onShowCard && (
          <button type="button" onClick={onShowCard} title="הצג את כרטיס איש הקשר" className={cx(s.btn, s.btnSm, s.deskOnly)}>
            <PanelLeftOpen aria-hidden="true" />
            הצג כרטיס
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * The middle column: who this is and who is answering, the messages by day,
 * and the writing box. New messages land at the bottom by themselves; a reader
 * who scrolled up is told, and not dragged down.
 */
export default function ChatThread({
  thread,
  now,
  visible,
  simulated, sendingOff,
  handoverBusy,
  resolveBusy,
  showBack,
  showDetailsButton,
  onShowCard,
  onBack,
  onDetails,
  onTakeover,
  onRelease,
  onResolveNeedsHuman,
  onOpenSettings,
  shadowByMessage,
  shadowBusyId = null,
  onShadowVerdict,
  onOpenKnowledgeItem,
  onSimulate,
  demoReply = NO_REPLY,
}: ChatThreadProps) {
  const { contact, messages, status } = thread;
  // "הבוט כותב…" stands at the end of a demo conversation while the new bot's answer is on its way.
  const typing = demoReply.inFlight && isDemoContact(contact);
  const scroller = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const seen = useRef<{
    contactId: number | null;
    ids: Set<number>;
    /** Who "sent" each bubble that is still on its way (its id is below zero). */
    pending: Map<number, WahubSender>;
    height: number;
    olderLoads: number;
  }>({
    contactId: null,
    ids: new Set(),
    pending: new Map(),
    height: 0,
    olderLoads: 0,
  });

  const days = useMemo(() => groupMessagesByDay(messages, now), [messages, now]);

  // "דיוק": marking messages here, and the small chat it opens (docs/WAHUB-CONTRACT-REFINE.md, ב). The marks
  // come up only from the button at the top of the conversation (docs/WAHUB-CONTRACT-POLISH-1.md, ב).
  const refine = useRefine();
  const { open: openRefineChat, target: refineTarget } = refine;
  const picking = useRefineSelection(thread.contactId, messages);
  // The messages the small chat is open on stay marked in the conversation behind it.
  const marked = useMemo(
    () => (refineTarget && refineTarget.contactId === thread.contactId ? new Set(refineTarget.messageIds) : NO_IDS),
    [refineTarget, thread.contactId],
  );
  const onScreen = useRef({ contact, messages, onShadowVerdict });
  onScreen.current = { contact, messages, onShadowVerdict };
  /** Open the small chat on these messages; with a shadow reply, on the answer itself ("לתקן"). */
  const openRefine = useCallback(
    (ids: ReadonlyArray<number>, shadow?: WahubShadowReply) => {
      const shown = onScreen.current;
      if (!shown.contact) return;
      const quoted = shadow
        ? shadowExcerpt(shadow, shown.messages)
        : { messageIds: ids.slice(), lines: excerptOf(shown.messages, ids) };
      if (!shadow && !quoted.messageIds.length) return;
      openRefineChat({
        contactId: shown.contact.id,
        contactName: displayName(shown.contact),
        messageIds: quoted.messageIds,
        excerpt: quoted.lines,
        heading: shadow ? SHADOW_HEADING : undefined,
        pool: shown.messages.filter((message) => !isOptimistic(message)).map(excerptLine),
        shadowId: shadow?.id ?? null,
        // Marked messages: the system speaks first — a short summary of the piece, and "מה לא היה טוב כאן?".
        // "לתקן" on an answer keeps to what it was: she says what was wrong with it.
        summarize: !shadow,
        // Once she has said what was wrong with the answer, it is marked 👎 — without a note, so no second proposal is made of it.
        onSent: shadow && shadow.verdict !== 'bad' ? () => onScreen.current.onShadowVerdict?.(shadow, 'bad', '') : undefined,
      });
    },
    [openRefineChat],
  );

  // Messages that were not on screen at the last draw of this conversation come
  // in softly. A conversation that was just opened, or earlier messages loaded
  // above, are not arrivals; nor is the server's copy of what was just typed.
  const arrived = useMemo(() => {
    const before = seen.current;
    if (before.contactId !== thread.contactId || before.ids.size === 0 || before.olderLoads !== thread.olderLoads) {
      return NO_IDS;
    }
    const settled = settledSenders(before.pending, messages);
    const fresh = messages.filter(
      (message) => !before.ids.has(message.id) && !(message.id > 0 && settled.has(message.sender)),
    );
    return fresh.length > 0 && fresh.length <= 5 ? new Set(fresh.map((message) => message.id)) : NO_IDS;
  }, [messages, thread.contactId, thread.olderLoads]);

  const scrollToEnd = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    atBottom.current = true;
    setUnseen(0);
  }, []);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
    atBottom.current = near;
    if (near) setUnseen((count) => (count ? 0 : count));
  }

  // Runs after each change to the messages, before the browser paints.
  useBeforePaint(() => {
    const element = scroller.current;
    const before = seen.current;
    const ids = new Set(messages.map((message) => message.id));
    const pending = new Map(messages.filter(isOptimistic).map((message) => [message.id, message.sender] as const));

    if (!element) {
      seen.current = { contactId: thread.contactId, ids, pending, height: 0, olderLoads: thread.olderLoads };
      return;
    }

    if (before.contactId !== thread.contactId || before.ids.size === 0) {
      // Another conversation, or its first messages: start at the newest.
      element.scrollTop = element.scrollHeight;
      atBottom.current = true;
      setUnseen(0);
    } else if (thread.olderLoads !== before.olderLoads) {
      // Earlier messages were added above: keep the line the reader was on in place.
      element.scrollTop += element.scrollHeight - before.height;
    } else {
      const added = messages.filter((message) => !before.ids.has(message.id));
      if (added.length) {
        const typedHere = added.some(isOptimistic);
        // The server's copy replacing a bubble that was just typed here is not news.
        const settled = settledSenders(before.pending, messages);
        const news = added.filter((message) => !isOptimistic(message) && !settled.has(message.sender));
        if (typedHere || atBottom.current) {
          element.scrollTop = element.scrollHeight;
          atBottom.current = true;
        } else if (news.length) {
          setUnseen((count) => count + news.length);
        }
      } else if (atBottom.current) {
        // Nothing new, but the end may have grown ("הבוט כותב…" came or went): stay on it.
        element.scrollTop = element.scrollHeight;
      }
    }

    seen.current = { contactId: thread.contactId, ids, pending, height: element.scrollHeight, olderLoads: thread.olderLoads };
  }, [messages, thread.contactId, thread.olderLoads, status, typing]);

  // Out of view the scroller has no size, so "stay at the newest" could not be
  // kept while messages arrived. Coming back into view puts it right.
  useBeforePaint(() => {
    if (visible && atBottom.current) scrollToEnd();
  }, [visible, scrollToEnd]);

  if (!contact) {
    return (
      <div className={cx(s.pane, 'flex-1')}>
        {/* A screen that stands alone keeps its way back even before the conversation is here. */}
        {showBack && (
          <header className={s.threadHead}>
            <button type="button" onClick={onBack} aria-label="חזרה לרשימת השיחות" className={s.ib}>
              <ArrowRight aria-hidden="true" />
            </button>
          </header>
        )}
        {status === 'error' ? (
          <ErrorState title="לא הצלחנו לטעון את השיחה" text={thread.error} onRetry={thread.retry} className="flex-1" />
        ) : (
          <ThreadSkeleton />
        )}
      </div>
    );
  }

  return (
    <div className={cx(s.pane, 'flex-1')}>
      <ThreadHeader
        contact={contact}
        now={now}
        handoverBusy={handoverBusy}
        showBack={showBack}
        showDetailsButton={showDetailsButton}
        onShowCard={onShowCard}
        onBack={onBack}
        onDetails={onDetails}
        onTakeover={onTakeover}
        onRelease={onRelease}
        refining={picking.active}
        onRefine={refine.available ? () => (picking.active ? picking.cancel() : picking.start()) : undefined}
      />

      {contact.chat.needs_human && (
        <div role="status" className={s.needStrip}>
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="m-0 min-w-0 flex-1">
            <strong>מבקש נציג</strong>
            {contact.chat.needs_human_reason ? ` · ${contact.chat.needs_human_reason}` : ''}
            {contact.chat.needs_human_at ? <span> · {agoText(contact.chat.needs_human_at, now)}</span> : null}
          </p>
          <button
            type="button"
            onClick={onResolveNeedsHuman}
            disabled={resolveBusy}
            className={cx(s.btn, s.btnSm, s.btnBad)}
          >
            <Check aria-hidden="true" />
            טופל
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          className={cx(s.threadBg, 'absolute inset-0 overflow-y-auto overscroll-contain px-3 py-3 [overflow-anchor:none] sm:px-5')}
          aria-live="polite"
          aria-label="הודעות השיחה"
        >
          {status === 'error' && messages.length === 0 ? (
            <ErrorState title="לא הצלחנו לטעון את ההודעות" text={thread.error} onRetry={thread.retry} />
          ) : status === 'loading' && messages.length === 0 ? (
            <ThreadSkeleton />
          ) : (
            <>
              {thread.hasOlder && (
                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void thread.loadOlder()}
                    disabled={thread.loadingOlder}
                    className={cx(s.btn, s.btnSm)}
                  >
                    {thread.loadingOlder && <Spinner className="h-3.5 w-3.5" />}
                    הודעות קודמות
                  </button>
                </div>
              )}

              {messages.length === 0 ? (
                <p className={cx(s.muted, 'py-10 text-center')}>עוד אין הודעות בשיחה הזו.</p>
              ) : (
                days.map((day) => (
                  <section key={day.key} aria-label={day.label}>
                    <p className={s.dayMark}>
                      <span>{day.label}</span>
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {day.messages.map((message) => {
                        const shadow = message.direction === 'in' ? shadowByMessage?.get(message.id) : undefined;
                        return (
                          <RefineRow
                            key={message.id}
                            id={message.id}
                            selecting={picking.active}
                            selected={picking.ids.has(message.id)}
                            selectable={!isOptimistic(message)}
                            marked={marked.has(message.id)}
                            onPress={picking.press}
                          >
                            <MessageBubble message={message} arrived={arrived.has(message.id)} />
                            {shadow && (
                              <ShadowRow
                                reply={shadow}
                                busy={shadowBusyId === shadow.id}
                                onVerdict={(value, note) => onShadowVerdict?.(shadow, value, note)}
                                onOpenItem={(id) => onOpenKnowledgeItem?.(id)}
                                onFix={refine.available ? () => openRefine([], shadow) : undefined}
                              />
                            )}
                          </RefineRow>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
              {typing && (
                <div className="mt-1.5">
                  <TypingBubble />
                </div>
              )}
            </>
          )}
        </div>

        {unseen > 0 && (
          <button type="button" onClick={scrollToEnd} className={s.newPill}>
            {unseen === 1 ? 'הודעה חדשה' : `${unseen} הודעות חדשות`}
            <ArrowDown aria-hidden="true" />
          </button>
        )}
      </div>

      {/* While marking, the bar stands where the writing boxes do; they stay in the page, out of view. */}
      {picking.active && (
        <RefineSelectBar
          count={picking.picked.length}
          onContinue={() => {
            openRefine(picking.picked);
            picking.cancel();
          }}
          onCancel={picking.cancel}
        />
      )}

      <Composer
        contact={contact}
        sending={thread.sending}
        simulated={simulated}
        sendingOff={sendingOff}
        onSend={thread.send}
        onSendFlow={thread.sendFlow}
        onOpenSettings={onOpenSettings}
      />
      {onSimulate && isDemoContact(contact) && <DemoComposer contact={contact} onSend={onSimulate} reply={demoReply} />}
    </div>
  );
}
