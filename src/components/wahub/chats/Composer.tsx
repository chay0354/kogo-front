'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react';
import { FileText, Film, Image as ImageIcon, LayoutTemplate, Lock, MessageSquareText, Paperclip, Reply, Send, StickyNote, X } from 'lucide-react';
import {
  ATTACH_ACCEPT,
  attachKind,
  attachProblem,
  openerOrder,
  pastedImage,
  placeholderHint,
  quickReplyPlan,
  replyExcerpt,
  unfilledPlaceholders,
  withReply,
  type AttachKind,
  type OpenerKind,
  type OpeningOutcome,
} from '@/lib/wahub/composer';
import { formatFileSize } from '@/lib/wahub/demo';
import { formatClock } from '@/lib/wahub/format';
import { automationDisplayLabel, type WhatsAppAutomation } from '@/lib/whatsappApi';
import type { WahubContact, WahubMessage, WahubQuickReply } from '@/types/wahub';
import { useWahubAutomations, useWahubQuickReplies } from '../hooks/useWahubQueries';
import f from '../future.module.css';
import { Spinner, useDismiss } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { NoteBox } from '../shared/FutureParts';
import c from './composer.module.css';

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

export function QuickRepliesMenu({
  replies,
  loading,
  failed,
  sending = false,
  onPick,
  onManage,
}: {
  replies: WahubQuickReply[];
  loading: boolean;
  failed: boolean;
  /** A message is on its way: a reply goes out on a press, so no second one is taken meanwhile. */
  sending?: boolean;
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
              <button type="button" role="menuitem" onClick={() => onPick(reply)} disabled={sending} className={s.menuItem}>
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
  /**
   * "פתיחת שיחה" / "המשך שיחה" (15.10.2026): the only two ways out of a closed conversation, sent on a press.
   * Absent (a thread made by hand), the locked box offers the list of templates as it always did.
   */
  onSendOpening?: (kind: OpenerKind) => Promise<OpeningOutcome>;
  /** A file with the box's words as its caption; resolves true once the server took it. Absent: no 📎. */
  onSendMedia?: (file: File, caption: string, onPhase?: (phase: 'upload' | 'send') => void) => Promise<boolean>;
  /** "השב": the message being answered — quoted at the head of what is sent next. */
  replyTo?: WahubMessage | null;
  onClearReply?: () => void;
  onOpenSettings: () => void;
  /**
   * A note about the customer (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.6): resolves '' once it was saved, or
   * why it was not. Absent on a server that has no notes — the button is then not offered.
   */
  onNote?: (text: string) => Promise<string>;
}

/** The small "פתק" button beside the writing box. A button, not a switch: it opens the note's own box. */
function NoteButton({ onClick, alone = false }: { onClick: () => void; /** Beside a locked box rather than in the row of tools. */ alone?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="פתק על הלקוח"
      title="פתק על הלקוח – לא נשלח לאף אחד"
      className={cx(s.btn, s.btnSm, alone && f.noteBtnAlone)}
    >
      <StickyNote aria-hidden="true" />
      {/* In the row of tools a phone keeps the icons alone; beside a locked box there is room for the word, and it is said. */}
      <span className={alone ? undefined : s.toolLabel}>פתק</span>
    </button>
  );
}

const ATTACH_ICON: Record<AttachKind, typeof ImageIcon> = { image: ImageIcon, video: Film, file: FileText };

/** A file chosen to be sent, until it is: the file, its kind, and a picture's own preview. */
interface Attachment {
  file: File;
  kind: AttachKind;
  /** An object URL of a picture, for the thumbnail; '' for a video or a document. */
  preview: string;
}

/** The file waiting above the box: what it is, how large, which step it is at, and × to put it away. */
export function AttachmentStrip({
  attachment,
  phase,
  onRemove,
}: {
  attachment: Pick<Attachment, 'kind' | 'preview'> & { file: { name: string; size: number } };
  /** The step a send is at; null while it only waits. */
  phase: 'upload' | 'send' | null;
  onRemove: () => void;
}) {
  const Icon = ATTACH_ICON[attachment.kind];
  return (
    <div className={c.strip} role="group" aria-label="הקובץ שיישלח">
      <span className={c.attachThumb}>
        <Icon aria-hidden="true" />
        {attachment.preview && (
          <img
            src={attachment.preview}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        )}
      </span>
      <p className={c.stripText}>
        <span className={c.stripName} dir="auto">
          {attachment.file.name || 'קובץ'}
        </span>
        {phase === 'upload' ? 'מעלה את הקובץ…' : phase === 'send' ? 'שולח…' : `${formatFileSize(attachment.file.size)} · מה שכתוב בתיבה יישלח איתו`}
      </p>
      {phase ? (
        <Spinner />
      ) : (
        <button type="button" onClick={onRemove} aria-label="הסר את הקובץ" title="הסר את הקובץ" className={cx(s.ib, s.ibSm)}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** "משיב ל: …" above the box, with × to answer nobody in particular. */
export function ReplyStrip({ excerpt, onClear }: { excerpt: string; onClear: () => void }) {
  return (
    <div className={cx(c.strip, c.replyStrip)} role="group" aria-label="משיב להודעה">
      <Reply className="h-4 w-4 shrink-0 -scale-x-100" aria-hidden="true" />
      <p className={c.stripText} dir="auto">
        <strong>משיב ל:</strong> {excerpt}
      </p>
      <button type="button" onClick={onClear} aria-label="ביטול התשובה להודעה" title="ביטול" className={cx(s.ib, s.ibSm)}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * A closed conversation's only two ways out (owner, 15.10.2026): "פתיחת שיחה" and "המשך שיחה", each a press
 * that sends at once. Who never wrote is opened first; who wrote and went quiet is continued first.
 */
export function OpenersBox({
  contact,
  sending,
  busy,
  outcome,
  onPress,
  note,
}: {
  contact: Pick<WahubContact, 'last_inbound_at' | 'first_inbound_at'>;
  sending: boolean;
  /** The opener whose press is on its way. */
  busy: OpenerKind | null;
  outcome: OpeningOutcome | null;
  onPress: (kind: OpenerKind) => void;
  note?: ReactNode;
}) {
  const openers = openerOrder(contact);
  return (
    <div className={c.openers}>
      {openers.map((opener, index) => (
        <button
          key={opener.kind}
          type="button"
          onClick={() => onPress(opener.kind)}
          disabled={sending}
          aria-busy={busy === opener.kind || undefined}
          title={`שולח עכשיו את התבנית "${opener.flowName}"`}
          className={cx(s.btn, s.btnSm, index === 0 && s.btnP)}
        >
          {busy === opener.kind ? <Spinner /> : <Send className="-scale-x-100" aria-hidden="true" />}
          {opener.label}
        </button>
      ))}
      {note}
      {(busy || outcome?.text) && (
        <p role="status" className={cx(c.openerNote, outcome && !busy && (outcome.ok ? c.openerOk : c.openerBad))}>
          {busy ? 'שולח…' : outcome?.text}
        </p>
      )}
    </div>
  );
}

/**
 * The writing box. Enter sends, Shift+Enter breaks the line. More than 24
 * hours after the customer's last message WhatsApp takes a template only, so
 * the box locks, says why, and offers the two openers.
 *
 * A ready-made reply goes out on a press (one that still has a {{…}} to fill
 * goes into the box instead); 📎 or a pasted picture waits above the box and
 * leaves with the box's words as its caption; "השב" on a bubble quotes it at
 * the head of what is sent next.
 *
 * A note is written here as well, in a box of its own that takes the writing
 * box's place — and is there whether or not a message can be sent: a note is
 * sent to nobody.
 */
export default function Composer({
  contact,
  sending,
  simulated,
  sendingOff,
  onSend,
  onSendFlow,
  onSendOpening,
  onSendMedia,
  replyTo = null,
  onClearReply,
  onOpenSettings,
  onNote,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<Menu>(null);
  const [note, setNote] = useState<{ open: boolean; text: string; saving: boolean; error: string }>(NO_NOTE);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [phase, setPhase] = useState<'upload' | 'send' | null>(null);
  // A word above the box: a {{…}} still to fill in, or why a file was not taken. The first goes once filled in.
  const [hint, setHint] = useState<{ text: string; kind: 'placeholder' | 'file' } | null>(null);
  const [opening, setOpening] = useState<{ busy: OpenerKind | null; outcome: OpeningOutcome | null }>({ busy: null, outcome: null });
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  // A press that is on its way — set at once, before the state that disables the buttons has drawn.
  const pressing = useRef(false);
  const menuRef = useDismiss(menu !== null, () => setMenu(null));

  const replies = useWahubQuickReplies();
  const automations = useWahubAutomations(menu === 'templates');
  const canType = contact.chat.can_free_text && !sendingOff;
  const name = contact.name || contact.phone_display || contact.phone;
  const idRef = useRef(contact.id);
  idRef.current = contact.id;
  const busy = sending || phase !== null;
  const excerpt = replyTo ? replyExcerpt(replyTo) : '';

  // Each conversation starts with an empty box.
  useEffect(() => {
    setText('');
    setMenu(null);
    setNote(NO_NOTE);
    setHint(null);
    setPhase(null);
    setOpening({ busy: null, outcome: null });
    setAttachment(null);
  }, [contact.id]);

  // A picture's preview is let go of once the file is sent, put away or replaced — and with the box.
  useEffect(
    () => () => {
      if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    },
    [attachment],
  );

  // The note about a {{…}} to fill goes once nothing is left to fill.
  useEffect(() => {
    if (hint?.kind === 'placeholder' && !unfilledPlaceholders(text).length) setHint(null);
  }, [hint, text]);

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

  function attach(file: File | null | undefined) {
    if (!file || !onSendMedia) return;
    const problem = attachProblem(file);
    const kind = attachKind(file);
    if (problem || !kind) {
      setHint({ text: problem, kind: 'file' });
      return;
    }
    setHint(null);
    setAttachment({ file, kind, preview: kind === 'image' ? URL.createObjectURL(file) : '' });
    textarea.current?.focus();
  }

  function dropAttachment() {
    setAttachment(null);
  }

  /** A screenshot pasted into the box is attached; pasted words are words. */
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onSendMedia) return;
    const image = pastedImage(event.clipboardData);
    if (!image) return;
    event.preventDefault();
    attach(image);
  }

  async function submit() {
    const body = text.trim();
    if (busy || !canType || pressing.current) return;
    // Why an earlier file was not taken is old news once something is sent.
    setHint((held) => (held?.kind === 'file' ? null : held));
    if (attachment && onSendMedia) {
      pressing.current = true;
      const id = contact.id;
      const held = attachment;
      try {
        const taken = await onSendMedia(held.file, body ? withReply(excerpt, body) : '', (step) => {
          if (idRef.current === id) setPhase(step);
        });
        if (idRef.current !== id) return;
        if (taken) {
          setText((current) => (current.trim() === body ? '' : current));
          dropAttachment();
          onClearReply?.();
        }
      } finally {
        pressing.current = false;
        if (idRef.current === id) setPhase(null);
      }
      textarea.current?.focus();
      return;
    }
    if (!body) return;
    if (unfilledPlaceholders(body).length) {
      // A ready-made reply put into the box to be completed: it does not leave with a {{…}} in it.
      setHint({ text: placeholderHint(unfilledPlaceholders(body)), kind: 'placeholder' });
      return;
    }
    setText('');
    // A second Enter before the first has drawn is not a second message.
    pressing.current = true;
    let taken = false;
    try {
      taken = await onSend(withReply(excerpt, body));
    } finally {
      pressing.current = false;
    }
    // Not taken: the words go back into the box, unless something new was typed meanwhile.
    if (!taken) setText((current) => (current ? current : body));
    else onClearReply?.();
    textarea.current?.focus();
  }

  function insertReply(filled: string) {
    const element = textarea.current;
    setText((current) => {
      if (!element || !current) return filled.slice(0, MAX_LENGTH);
      const start = element.selectionStart ?? current.length;
      const end = element.selectionEnd ?? current.length;
      return (current.slice(0, start) + filled + current.slice(end)).slice(0, MAX_LENGTH);
    });
    window.requestAnimationFrame(() => textarea.current?.focus());
  }

  /**
   * A ready-made reply goes out on the press (owner, 15.10.2026). One with
   * something still to fill in by hand ({{video_url}}) goes into the box
   * instead, with a word saying what is missing.
   */
  async function pickReply(reply: WahubQuickReply) {
    setMenu(null);
    const plan = quickReplyPlan(reply.text, contact.name, MAX_LENGTH);
    if (plan.kind === 'edit') {
      insertReply(plan.text);
      setHint({ text: plan.hint, kind: 'placeholder' });
      return;
    }
    if (busy || pressing.current || !plan.text) return;
    pressing.current = true;
    try {
      const taken = await onSend(withReply(excerpt, plan.text));
      if (taken) onClearReply?.();
    } finally {
      pressing.current = false;
    }
  }

  async function sendTemplate(automation: WhatsAppAutomation) {
    const sent = await onSendFlow(automation.automation_id);
    if (sent) setMenu(null);
  }

  async function pressOpener(kind: OpenerKind) {
    if (!onSendOpening || sending || pressing.current) return;
    pressing.current = true;
    const id = contact.id;
    setOpening({ busy: kind, outcome: null });
    try {
      const outcome = await onSendOpening(kind);
      if (idRef.current === id) setOpening({ busy: null, outcome });
    } finally {
      pressing.current = false;
    }
  }

  const closesAt = canType && contact.chat.window_closes_at ? formatClock(contact.chat.window_closes_at) : '';
  const writing = canType && !(onNote && note.open);

  return (
    <div className={s.composer}>
      {/* On a phone the hint line is folded away, so the one warning that matters is said above the box. */}
      {canType && simulated && (
        <p className={cx(s.warnText, s.composerSim)}>הדמיה – ההודעה נרשמת ולא נשלחת</p>
      )}
      {writing && replyTo && onClearReply && <ReplyStrip excerpt={excerpt} onClear={onClearReply} />}
      {writing && attachment && <AttachmentStrip attachment={attachment} phase={phase} onRemove={dropAttachment} />}
      {writing && hint && (
        <p className={c.hint} role="alert">
          {hint.text}
        </p>
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
                sending={busy}
                onPick={(reply) => void pickReply(reply)}
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
                onPaste={onPaste}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                maxLength={MAX_LENGTH}
                dir="auto"
                placeholder={attachment ? 'כיתוב לקובץ (לא חובה)…' : 'כתבו הודעה…'}
                aria-label={`הודעה אל ${name}`}
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={(!text.trim() && !attachment) || busy}
                aria-label="שלח הודעה"
                className={cx(s.btn, s.btnP, '!h-[38px]')}
              >
                {busy ? <Spinner /> : <Send className="-scale-x-100" aria-hidden="true" />}
                <span className="hidden sm:inline">שלח</span>
              </button>
            </div>
            <div
              className={cx(
                s.composerTools,
                (onNote || onSendMedia) && s.composerToolsTight,
                'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1',
              )}
            >
              <button
                type="button"
                onClick={() => setMenu(menu === 'replies' ? null : 'replies')}
                aria-expanded={menu === 'replies'}
                aria-label="תשובות מוכנות"
                title="תשובות מוכנות – נשלחת בלחיצה"
                className={cx(s.btn, s.btnSm, menu === 'replies' && s.btnOn)}
              >
                <MessageSquareText aria-hidden="true" />
                <span className={s.toolLabel}>תשובות מוכנות</span>
              </button>
              {onSendMedia && (
                <>
                  <button
                    type="button"
                    onClick={() => picker.current?.click()}
                    disabled={busy}
                    aria-label="צרף קובץ"
                    title="צרף תמונה, סרטון או מסמך (אפשר גם להדביק צילום מסך)"
                    className={cx(s.btn, s.btnSm, attachment && s.btnOn)}
                  >
                    <Paperclip aria-hidden="true" />
                    <span className={s.toolLabel}>צרף</span>
                  </button>
                  <input
                    ref={picker}
                    type="file"
                    accept={ATTACH_ACCEPT}
                    hidden
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={(event) => {
                      attach(event.target.files?.[0]);
                      // The same file can be chosen again right after.
                      event.target.value = '';
                    }}
                  />
                </>
              )}
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
          <div className={cx(s.lockBox, !sendingOff && onSendOpening && c.openLock)}>
            <Lock aria-hidden="true" />
            <p>
              {sendingOff
                ? 'השליחה ללקוחות כבויה. כלום לא יוצא מכאן עד שמפעילים אותה בהגדרות המערכת.'
                : contact.last_inbound_at
                  ? 'עברו 24 שעות מההודעה האחרונה של הלקוח. אפשר לשלוח רק תבנית.'
                  : 'הלקוח עוד לא כתב לנו. אפשר לשלוח רק תבנית.'}
            </p>
            {!sendingOff && onSendOpening ? (
              <OpenersBox
                contact={contact}
                sending={sending}
                busy={opening.busy}
                outcome={opening.outcome}
                onPress={(kind) => void pressOpener(kind)}
                // Nothing else can be sent — a note still can be written: it goes to nobody.
                note={onNote && <NoteButton onClick={openNote} alone />}
              />
            ) : (
              <>
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
                {onNote && <NoteButton onClick={openNote} alone />}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
