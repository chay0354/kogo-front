'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  Hand,
  Info,
  MessageCircle,
  Undo2,
  UserRound,
} from 'lucide-react';
import { formatWhatsAppLink } from '@/lib/customerUtils';
import { agoText, displayName, formatClock, hasName, messageTypeLabel } from '@/lib/wahub/format';
import { groupMessagesByDay, isOptimistic } from '@/lib/wahub/messages';
import type { WahubContactDetail, WahubMessage } from '@/types/wahub';
import type { ContactThread } from '../hooks/useContactThread';
import { ContactAvatar, ErrorState, Skeleton, Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import Composer from './Composer';

/** Scrolling is settled before the browser paints; where there is no browser there is nothing to settle. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const NO_IDS: ReadonlySet<number> = new Set();

/** Close enough to the end to count as "reading the newest". */
const NEAR_BOTTOM_PX = 80;

/**
 * Whose bubble it is, in the section's colours: the customer on a plain
 * surface, the bot in light lavender, the office in navy, and a system message
 * or a template in gold. A message that did not go out is red, whoever sent it.
 */
function bubbleTone(message: WahubMessage): string {
  if (message.status === 'failed') return s.bFailed;
  if (message.sender === 'customer') return s.bCustomer;
  if (message.sender === 'system' || message.message_type === 'template') return s.bSystem;
  if (message.sender === 'bot') return s.bBot;
  return s.bOffice;
}

function senderLine(message: WahubMessage): string {
  if (message.sender === 'customer') return '';
  const label = message.sender_label || '';
  if (message.sender === 'office' && message.sender_name) return `${label || 'משרד'} · ${message.sender_name}`;
  return label;
}

/**
 * One bubble. The customer stands on one side; the bot, the office and the
 * system on the other, each in its own shade and with a small label saying who.
 */
const MessageBubble = memo(function MessageBubble({ message, arrived }: { message: WahubMessage; arrived: boolean }) {
  const mine = message.direction === 'out';
  const failed = message.status === 'failed';
  const sending = message.local_state === 'sending';
  const typeLabel = messageTypeLabel(message.message_type);
  const who = senderLine(message);

  return (
    <div className={cx(s.bubbleRow, mine && s.bubbleRowOut, arrived && s.feedinUp)}>
      <div className={s.bubbleCol}>
        <div className={cx(s.bubble, bubbleTone(message), sending && s.bSending)}>
          {(who || typeLabel || message.status === 'simulated') && (
            <p className={s.bubbleMeta}>
              {who && <span>{who}</span>}
              {typeLabel && <span>{who ? '· ' : ''}{typeLabel}</span>}
              {message.status === 'simulated' && <span className={s.simMark}>הדמיה</span>}
            </p>
          )}
          {message.text && (
            <p className={s.bubbleText} dir="auto">
              {message.text}
            </p>
          )}
          {message.media_url && (
            <a
              href={message.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              פתח את הקובץ
            </a>
          )}
          <p className={cx(s.bubbleTime, mine && 'justify-end')}>
            {sending ? (
              <>
                <Spinner className="h-3 w-3" /> נשלח…
              </>
            ) : (
              <>
                {formatClock(message.sent_at)}
                {mine && message.status === 'sent' && <Check aria-label="נשלח" />}
              </>
            )}
          </p>
        </div>
        {failed && (
          <p className={s.failNote} role="alert">
            <AlertCircle aria-hidden="true" />
            לא נשלח{message.error ? ` – ${message.error}` : ''}
          </p>
        )}
      </div>
    </div>
  );
});

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
  /** Which of the two handover buttons is waiting for the server. */
  handoverBusy: boolean;
  resolveBusy: boolean;
  /** Narrow screens show one pane at a time and need a way back to the list. */
  showBack: boolean;
  /** The details pane is not beside the conversation, so the header offers it. */
  showDetailsButton: boolean;
  onBack: () => void;
  onDetails: () => void;
  onTakeover: () => void;
  onRelease: () => void;
  onResolveNeedsHuman: () => void;
  onOpenSettings: () => void;
}

function ThreadHeader({
  contact,
  now,
  handoverBusy,
  showBack,
  showDetailsButton,
  onBack,
  onDetails,
  onTakeover,
  onRelease,
}: {
  contact: WahubContactDetail;
  now: Date;
} & Pick<
  ChatThreadProps,
  'handoverBusy' | 'showBack' | 'showDetailsButton' | 'onBack' | 'onDetails' | 'onTakeover' | 'onRelease'
>) {
  const human = contact.chat.handled_by === 'human';
  const whatsapp = formatWhatsAppLink(contact.phone);
  const phone = contact.phone_display || contact.phone;

  return (
    <header className={s.threadHead}>
      {showBack && (
        <button type="button" onClick={onBack} aria-label="חזרה לרשימת השיחות" className={s.ib}>
          <ArrowRight aria-hidden="true" />
        </button>
      )}
      <ContactAvatar contact={contact} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[15px] font-extrabold" dir="auto">
          {displayName(contact)}
        </p>
        <p className={cx(s.t2, 'm-0 flex flex-wrap items-center gap-x-2')}>
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
        <span className={cx(s.pill, human ? s.handHuman : s.handBot)}>
          {human ? <UserRound aria-hidden="true" /> : <Bot aria-hidden="true" />}
          {human ? 'בטיפול שלך' : contact.chat.handled_by_label || 'הבוט עונה'}
        </span>
        {human ? (
          <button type="button" onClick={onRelease} disabled={handoverBusy} className={cx(s.btn, s.btnSm)}>
            {handoverBusy ? <Spinner className="h-3.5 w-3.5" /> : <Undo2 aria-hidden="true" />}
            החזר לבוט
          </button>
        ) : (
          <button type="button" onClick={onTakeover} disabled={handoverBusy} className={cx(s.btn, s.btnSm, s.btnP)}>
            {handoverBusy ? <Spinner className="h-3.5 w-3.5" /> : <Hand aria-hidden="true" />}
            קח שיחה
          </button>
        )}
        {showDetailsButton && (
          <button
            type="button"
            onClick={onDetails}
            aria-label="פרטי איש הקשר"
            title="פרטי איש הקשר"
            className={s.ib}
          >
            <Info aria-hidden="true" />
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
  simulated,
  handoverBusy,
  resolveBusy,
  showBack,
  showDetailsButton,
  onBack,
  onDetails,
  onTakeover,
  onRelease,
  onResolveNeedsHuman,
  onOpenSettings,
}: ChatThreadProps) {
  const { contact, messages, status } = thread;
  const scroller = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const seen = useRef<{ contactId: number | null; ids: Set<number>; height: number; olderLoads: number }>({
    contactId: null,
    ids: new Set(),
    height: 0,
    olderLoads: 0,
  });

  const days = useMemo(() => groupMessagesByDay(messages, now), [messages, now]);

  // Messages that were not on screen at the last draw of this conversation come
  // in softly. A conversation that was just opened, or earlier messages loaded
  // above, are not arrivals; nor is the server's copy of what was just typed.
  const arrived = useMemo(() => {
    const before = seen.current;
    if (before.contactId !== thread.contactId || before.ids.size === 0 || before.olderLoads !== thread.olderLoads) {
      return NO_IDS;
    }
    const current = new Set(messages.map((message) => message.id));
    const settled = Array.from(before.ids).some((id) => id < 0 && !current.has(id));
    const fresh = messages.filter(
      (message) => !before.ids.has(message.id) && !(settled && message.sender === 'office' && message.id > 0),
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

    if (!element) {
      seen.current = { contactId: thread.contactId, ids, height: 0, olderLoads: thread.olderLoads };
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
        // The server's copy replacing the bubble the office just typed is not news.
        const settled = Array.from(before.ids).some((id) => id < 0 && !ids.has(id));
        const news = added.filter((message) => !isOptimistic(message) && !(settled && message.sender === 'office'));
        if (typedHere || atBottom.current) {
          element.scrollTop = element.scrollHeight;
          atBottom.current = true;
        } else if (news.length) {
          setUnseen((count) => count + news.length);
        }
      }
    }

    seen.current = { contactId: thread.contactId, ids, height: element.scrollHeight, olderLoads: thread.olderLoads };
  }, [messages, thread.contactId, thread.olderLoads, status]);

  // Out of view the scroller has no size, so "stay at the newest" could not be
  // kept while messages arrived. Coming back into view puts it right.
  useBeforePaint(() => {
    if (visible && atBottom.current) scrollToEnd();
  }, [visible, scrollToEnd]);

  if (!contact) {
    return (
      <div className={cx(s.pane, 'flex-1')}>
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
        onBack={onBack}
        onDetails={onDetails}
        onTakeover={onTakeover}
        onRelease={onRelease}
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
                      {day.messages.map((message) => (
                        <MessageBubble key={message.id} message={message} arrived={arrived.has(message.id)} />
                      ))}
                    </div>
                  </section>
                ))
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

      <Composer
        contact={contact}
        sending={thread.sending}
        simulated={simulated}
        onSend={thread.send}
        onSendFlow={thread.sendFlow}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
