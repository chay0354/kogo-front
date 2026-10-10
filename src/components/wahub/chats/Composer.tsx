'use client';

import { useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Lock, MessageSquareText, Send } from 'lucide-react';
import { fillQuickReply, formatClock } from '@/lib/wahub/format';
import { automationDisplayLabel, type WhatsAppAutomation } from '@/lib/whatsappApi';
import type { WahubContact, WahubQuickReply } from '@/types/wahub';
import { useWahubAutomations, useWahubQuickReplies } from '../hooks/useWahubQueries';
import { Spinner, useDismiss } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

const MAX_LENGTH = 4096;

type Menu = 'replies' | 'templates' | null;

/** Automations that can go to someone who has no enrollment: the plain ManyChat ones. */
function sendableAutomations(list: WhatsAppAutomation[] | undefined): WhatsAppAutomation[] {
  return (list ?? []).filter(
    (item) => item.automation_type === 'flow' && !item.needs_enrollment_context && item.in_manychat !== false,
  );
}

function QuickRepliesMenu({
  replies,
  loading,
  failed,
  onPick,
  onManage,
}: {
  replies: WahubQuickReply[];
  loading: boolean;
  failed: boolean;
  onPick: (reply: WahubQuickReply) => void;
  onManage: () => void;
}) {
  return (
    <div className="max-h-72 overflow-y-auto">
      {loading ? (
        <p className={cx(s.muted, 'm-0 flex items-center gap-2 p-3')}>
          <Spinner /> טוען…
        </p>
      ) : failed ? (
        <p className={cx(s.badText, 'm-0 p-3 font-semibold')}>לא הצלחנו לטעון את התשובות המוכנות.</p>
      ) : replies.length === 0 ? (
        <div className={cx(s.muted, 'p-3')}>
          <p className="m-0">עוד אין תשובות מוכנות.</p>
          <button type="button" onClick={onManage} className={cx(s.link, 'mt-1')}>
            להוסיף בהגדרות
          </button>
        </div>
      ) : (
        <ul role="menu" aria-label="תשובות מוכנות" className="m-0 list-none p-0">
          {replies.map((reply) => (
            <li key={reply.id} role="none">
              <button type="button" role="menuitem" onClick={() => onPick(reply)} className={s.menuItem}>
                <span className={cx(s.t1, 'block')}>{reply.title}</span>
                <span className={cx(s.t2, 'block truncate')}>{reply.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplatesMenu({
  contactName,
  automations,
  loading,
  failed,
  sending,
  onSend,
}: {
  contactName: string;
  automations: WhatsAppAutomation[];
  loading: boolean;
  failed: boolean;
  sending: boolean;
  onSend: (automation: WhatsAppAutomation) => void;
}) {
  const [chosen, setChosen] = useState<WhatsAppAutomation | null>(null);

  // A template is a real message on its way out: choosing one asks first.
  if (chosen) {
    return (
      <div className="p-3">
        <p className="m-0 leading-relaxed">
          לשלוח את התבנית <strong className="font-extrabold">{automationDisplayLabel(chosen)}</strong> אל{' '}
          <strong className="font-extrabold" dir="auto">
            {contactName}
          </strong>
          ?
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onSend(chosen)} disabled={sending} className={cx(s.btn, s.btnSm, s.btnP)}>
            {sending ? <Spinner /> : <Send className="-scale-x-100" aria-hidden="true" />}
            שלח
          </button>
          <button type="button" onClick={() => setChosen(null)} disabled={sending} className={cx(s.btn, s.btnSm)}>
            חזרה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      {loading ? (
        <p className={cx(s.muted, 'm-0 flex items-center gap-2 p-3')}>
          <Spinner /> טוען את התבניות…
        </p>
      ) : failed ? (
        <p className={cx(s.badText, 'm-0 p-3 font-semibold')}>לא הצלחנו לטעון את התבניות מ-ManyChat.</p>
      ) : automations.length === 0 ? (
        <p className={cx(s.muted, 'm-0 p-3')}>אין תבניות שאפשר לשלוח מכאן.</p>
      ) : (
        <ul role="menu" aria-label="תבניות" className="m-0 list-none p-0">
          {automations.map((automation) => (
            <li key={automation.automation_id} role="none">
              <button type="button" role="menuitem" onClick={() => setChosen(automation)} className={cx(s.menuItem, s.t1)}>
                {automationDisplayLabel(automation)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ComposerProps {
  contact: WahubContact;
  sending: boolean;
  /** The server records the message and sends nothing (local simulation). */
  simulated: boolean;
  /** The owner's switch is off: nothing may be sent to a customer yet. */
  sendingOff: boolean;
  onSend: (text: string) => Promise<boolean>;
  onSendFlow: (automationId: string) => Promise<boolean>;
  onOpenSettings: () => void;
}

/**
 * The writing box. Enter sends, Shift+Enter breaks the line. More than 24
 * hours after the customer's last message WhatsApp takes a template only, so
 * the box locks and says why.
 */
export default function Composer({ contact, sending, simulated, sendingOff, onSend, onSendFlow, onOpenSettings }: ComposerProps) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<Menu>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useDismiss(menu !== null, () => setMenu(null));

  const replies = useWahubQuickReplies();
  const automations = useWahubAutomations(menu === 'templates');
  const canType = contact.chat.can_free_text && !sendingOff;
  const name = contact.name || contact.phone_display || contact.phone;

  // Each conversation starts with an empty box.
  useEffect(() => {
    setText('');
    setMenu(null);
  }, [contact.id]);

  // The box grows with what is typed, up to a few lines.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [text, canType]);

  async function submit() {
    const body = text.trim();
    if (!body || sending || !canType) return;
    setText('');
    const taken = await onSend(body);
    // Not taken: the words go back into the box, unless something new was typed meanwhile.
    if (!taken) setText((current) => (current ? current : body));
    textarea.current?.focus();
  }

  function insertReply(reply: WahubQuickReply) {
    const filled = fillQuickReply(reply.text, contact.name);
    const element = textarea.current;
    setText((current) => {
      if (!element || !current) return filled.slice(0, MAX_LENGTH);
      const start = element.selectionStart ?? current.length;
      const end = element.selectionEnd ?? current.length;
      return (current.slice(0, start) + filled + current.slice(end)).slice(0, MAX_LENGTH);
    });
    setMenu(null);
    window.requestAnimationFrame(() => textarea.current?.focus());
  }

  async function sendTemplate(automation: WhatsAppAutomation) {
    const sent = await onSendFlow(automation.automation_id);
    if (sent) setMenu(null);
  }

  const closesAt = canType && contact.chat.window_closes_at ? formatClock(contact.chat.window_closes_at) : '';

  return (
    <div className={s.composer}>
      <div ref={menuRef} className="relative">
        {menu && (
          <div
            className={cx(s.pop, 'absolute bottom-full start-0 z-20 mb-2 w-80 max-w-full')}
            role="dialog"
            aria-label={menu === 'replies' ? 'תשובות מוכנות' : 'שלח תבנית'}
          >
            <p className={s.popTitle}>{menu === 'replies' ? 'תשובות מוכנות' : 'שלח תבנית'}</p>
            {menu === 'replies' ? (
              <QuickRepliesMenu
                replies={replies.data ?? []}
                loading={replies.isLoading}
                failed={replies.isError}
                onPick={insertReply}
                onManage={() => {
                  setMenu(null);
                  onOpenSettings();
                }}
              />
            ) : (
              <TemplatesMenu
                contactName={name}
                automations={sendableAutomations(automations.data?.automations)}
                loading={automations.isLoading}
                failed={automations.isError}
                sending={sending}
                onSend={(automation) => void sendTemplate(automation)}
              />
            )}
          </div>
        )}

        {canType ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                ref={textarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                maxLength={MAX_LENGTH}
                dir="auto"
                placeholder="כתבו הודעה…"
                aria-label={`הודעה אל ${name}`}
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!text.trim() || sending}
                aria-label="שלח הודעה"
                className={cx(s.btn, s.btnP, '!h-[38px]')}
              >
                {sending ? <Spinner /> : <Send className="-scale-x-100" aria-hidden="true" />}
                <span className="hidden sm:inline">שלח</span>
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={() => setMenu(menu === 'replies' ? null : 'replies')}
                aria-expanded={menu === 'replies'}
                className={cx(s.btn, s.btnSm, menu === 'replies' && s.btnOn)}
              >
                <MessageSquareText aria-hidden="true" />
                תשובות מוכנות
              </button>
              <button
                type="button"
                onClick={() => setMenu(menu === 'templates' ? null : 'templates')}
                aria-expanded={menu === 'templates'}
                className={cx(s.btn, s.btnSm, menu === 'templates' && s.btnOn)}
              >
                <LayoutTemplate aria-hidden="true" />
                שלח תבנית
              </button>
              <span className={cx(s.t2, 'ms-auto !text-[11px]')}>
                {simulated ? (
                  <strong className={cx(s.warnText, 'font-bold')}>הדמיה – ההודעה נרשמת ולא נשלחת</strong>
                ) : (
                  <>Enter שולח · Shift+Enter שורה חדשה{closesAt ? ` · אפשר לכתוב עד ${closesAt}` : ''}</>
                )}
              </span>
            </div>
          </>
        ) : (
          <div className={s.lockBox}>
            <Lock aria-hidden="true" />
            <p>
              {sendingOff
                ? 'השליחה ללקוחות כבויה. כלום לא יוצא מכאן עד שמפעילים אותה בהגדרות המערכת.'
                : contact.last_inbound_at
                  ? 'עברו 24 שעות מההודעה האחרונה של הלקוח. אפשר לשלוח רק תבנית.'
                  : 'הלקוח עוד לא כתב לנו. אפשר לשלוח רק תבנית.'}
            </p>
            {!sendingOff && (
              <button
                type="button"
                onClick={() => setMenu(menu === 'templates' ? null : 'templates')}
                aria-expanded={menu === 'templates'}
                className={cx(s.btn, s.btnSm, s.btnP)}
              >
                <LayoutTemplate aria-hidden="true" />
                שלח תבנית
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
