'use client';

import { useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Lock, MessageSquareText, Send, StickyNote } from 'lucide-react';
import { fillQuickReply, formatClock } from '@/lib/wahub/format';
import { automationDisplayLabel, type WhatsAppAutomation } from '@/lib/whatsappApi';
import type { WahubContact, WahubQuickReply } from '@/types/wahub';
import { useWahubAutomations, useWahubQuickReplies } from '../hooks/useWahubQueries';
import { Spinner, useDismiss } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { NoteBox } from './Notes';

const MAX_LENGTH = 4096;

type Menu = 'replies' | 'templates' | null;

/** The note's box, closed and empty. What was typed is kept while the box is only put away. */
const NO_NOTE = { open: false, text: '', saving: false, error: '' };

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
    <div className={s.popList}>
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
    <div className={s.popList}>
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
  /**
   * A note about the customer (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.6): resolves '' once it was saved, or
   * why it was not. Absent on a server that has no notes — the button is then not offered.
   */
  onNote?: (text: string) => Promise<string>;
}

/** The small "פתק" button beside the writing box. A button, not a switch: it opens the note's own box. */
function NoteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="פתק על הלקוח" title="פתק על הלקוח – לא נשלח לאף אחד" className={cx(s.btn, s.btnSm)}>
      <StickyNote aria-hidden="true" />
      <span className={s.toolLabel}>פתק</span>
    </button>
  );
}

/**
 * The writing box. Enter sends, Shift+Enter breaks the line. More than 24
 * hours after the customer's last message WhatsApp takes a template only, so
 * the box locks and says why.
 *
 * A note is written here as well, in a box of its own that takes the writing
 * box's place — and is there whether or not a message can be sent: a note is
 * sent to nobody.
 */
export default function Composer({ contact, sending, simulated, sendingOff, onSend, onSendFlow, onOpenSettings, onNote }: ComposerProps) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<Menu>(null);
  const [note, setNote] = useState<{ open: boolean; text: string; saving: boolean; error: string }>(NO_NOTE);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useDismiss(menu !== null, () => setMenu(null));

  const replies = useWahubQuickReplies();
  const automations = useWahubAutomations(menu === 'templates');
  const canType = contact.chat.can_free_text && !sendingOff;
  const name = contact.name || contact.phone_display || contact.phone;
  const idRef = useRef(contact.id);
  idRef.current = contact.id;

  // Each conversation starts with an empty box.
  useEffect(() => {
    setText('');
    setMenu(null);
    setNote(NO_NOTE);
  }, [contact.id]);

  function openNote() {
    setMenu(null);
    setNote((current) => ({ ...current, open: true, error: '' }));
  }

  async function saveNote() {
    const body = note.text.trim();
    if (!onNote || !body || note.saving) return;
    const id = contact.id;
    setNote((current) => ({ ...current, saving: true, error: '' }));
    const problem = await onNote(body);
    // Another conversation was opened meanwhile: its box is its own.
    if (idRef.current !== id) return;
    // Saved: the box closes, and the note stands in the conversation. Not saved: the words stay, with the reason.
    setNote((current) => (problem ? { ...current, saving: false, error: problem } : NO_NOTE));
  }

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
      {/* On a phone the hint line is folded away, so the one warning that matters is said above the box. */}
      {canType && simulated && (
        <p className={cx(s.warnText, s.composerSim)}>הדמיה – ההודעה נרשמת ולא נשלחת</p>
      )}
      <div ref={menuRef} className={cx(s.composerBody, 'relative')}>
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

        {onNote && note.open ? (
          <NoteBox
            name={name}
            text={note.text}
            saving={note.saving}
            error={note.error}
            onText={(value) => setNote((current) => ({ ...current, text: value }))}
            onSave={() => void saveNote()}
            onClose={() => setNote((current) => ({ ...current, open: false, error: '' }))}
          />
        ) : canType ? (
          <>
            <div className={cx(s.composerLine, 'flex items-end gap-2')}>
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
            <div className={cx(s.composerTools, onNote && s.composerToolsTight, 'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1')}>
              <button
                type="button"
                onClick={() => setMenu(menu === 'replies' ? null : 'replies')}
                aria-expanded={menu === 'replies'}
                aria-label="תשובות מוכנות"
                title="תשובות מוכנות"
                className={cx(s.btn, s.btnSm, menu === 'replies' && s.btnOn)}
              >
                <MessageSquareText aria-hidden="true" />
                <span className={s.toolLabel}>תשובות מוכנות</span>
              </button>
              <button
                type="button"
                onClick={() => setMenu(menu === 'templates' ? null : 'templates')}
                aria-expanded={menu === 'templates'}
                aria-label="שלח תבנית"
                title="שלח תבנית"
                className={cx(s.btn, s.btnSm, menu === 'templates' && s.btnOn)}
              >
                <LayoutTemplate aria-hidden="true" />
                <span className={s.toolLabel}>שלח תבנית</span>
              </button>
              {onNote && <NoteButton onClick={openNote} />}
              <span className={cx(s.t2, s.composerHint, 'ms-auto !text-[11px]')}>
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
            {/* Nothing can be sent — a note still can be written: it goes to nobody. */}
            {onNote && <NoteButton onClick={openNote} />}
          </div>
        )}
      </div>
    </div>
  );
}
