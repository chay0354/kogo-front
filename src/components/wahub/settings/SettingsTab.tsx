'use client';

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, MessageSquareText, Pencil, Plug, Plus, Radio, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  createWahubInboundKey,
  createWahubQuickReply,
  createWahubTag,
  deleteWahubQuickReply,
  deleteWahubTag,
  setWahubLiveTest,
  updateWahubQuickReply,
  updateWahubTag,
} from '@/lib/wahubApi';
import { displayName, formatDateTime, hasName } from '@/lib/wahub/format';
import { liveTestCount } from '@/lib/wahub/liveTest';
import type { WahubContact, WahubQuickReply, WahubStatus, WahubTag } from '@/types/wahub';
import { useBotMode } from '../hooks/useBotMode';
import { useNow } from '../hooks/useNow';
import { useLiveTestContacts, useWahubQuickReplies, useWahubTags, wahubKeys } from '../hooks/useWahubQueries';
import AutoApplySection from '../refine/AutoApplySwitch';
import { EmptyState, ErrorState, InlineConfirm, LiveTestTag, Skeleton, Spinner, TagChip } from '../shared/bits';
import { ColorDots, TAG_COLORS } from '../shared/ContactParts';
import { Tick } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import LeadsAutomationCard from './LeadsAutomationCard';
import SystemStatusCard from './SystemStatusCard';
import WhoAnswersCard from './WhoAnswersCard';

function SettingsCard({
  icon,
  title,
  sub,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className={s.card}>
      <div className="mb-3 flex items-start gap-3">
        <span aria-hidden="true" className={s.iconBox}>
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-extrabold">{title}</h3>
          {sub && <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          // The mark turns into a tick for a moment, and back.
          window.setTimeout(() => setCopied(false), 1400);
        } else {
          toast.error('ההעתקה לא הצליחה. סמנו את הטקסט והעתיקו ביד.');
        }
      }}
      className={s.btn}
    >
      {copied ? <Tick className={s.goodText} /> : <Copy aria-hidden="true" />}
      {copied ? 'הועתק' : label}
    </button>
  );
}

const B = ({ children }: { children: ReactNode }) => <strong className="font-extrabold">{children}</strong>;

// ---------------------------------------------------------------------------
// החיבור ל-ManyChat
// ---------------------------------------------------------------------------

function ConnectionSection({ status, onChanged }: { status: WahubStatus; onChanged: () => void }) {
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');

  async function createKey() {
    setCreating(true);
    try {
      const { key } = await createWahubInboundKey();
      setNewKey(key);
      setConfirming(false);
      onChanged();
    } catch (error) {
      toast.error(readableError(error, 'המפתח לא נוצר'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <SettingsCard
      icon={<Plug className="h-[18px] w-[18px]" />}
      title="החיבור ל-ManyChat"
      sub="ManyChat שולח לכאן העתק של כל הודעה. הכתובת והמפתח מוזנים שם, בצעד External Request."
    >
      <h4 className={cx(s.sectTitle, 'mb-1.5')}>הכתובת</h4>
      <div className="flex flex-wrap items-center gap-2">
        <code className={s.code}>{status.inbound_url || '—'}</code>
        {status.inbound_url && <CopyButton text={status.inbound_url} label="העתק כתובת" />}
      </div>

      <h4 className={cx(s.sectTitle, 'mb-1.5 mt-4')}>המפתח</h4>
      {newKey ? (
        <div className={s.noteGood}>
          <p className="m-0">
            <B>המפתח החדש מוצג פעם אחת בלבד.</B> העתיקו אותו עכשיו ל-ManyChat, לכותרת{' '}
            <code dir="ltr">X-Wahub-Key</code>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className={s.code} style={{ background: 'var(--surface)' }}>
              {newKey}
            </code>
            <CopyButton text={newKey} label="העתק מפתח" />
          </div>
          <button type="button" onClick={() => setNewKey('')} className={cx(s.link, 'mt-2 text-[13px]')}>
            העתקתי, אפשר להסתיר
          </button>
        </div>
      ) : confirming ? (
        <InlineConfirm
          text={
            status.inbound_configured ? (
              <>
                <B>המפתח החדש מחליף את הקודם.</B> עד שמעדכנים אותו ב-ManyChat, הודעות חדשות לא ייכנסו לכאן.
              </>
            ) : (
              <>
                ייווצר מפתח חדש. <B>הוא מוצג פעם אחת בלבד</B> – הכינו את ManyChat להדבקה.
              </>
            )
          }
          confirmLabel="כן, צור מפתח"
          busy={creating}
          onConfirm={() => void createKey()}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setConfirming(true)} className={cx(s.btn, s.btnP)}>
            <KeyRound aria-hidden="true" />
            צור מפתח חדש
          </button>
          <span className={cx(s.t2, '!text-[13px]')}>
            {status.inbound_configured
              ? `יש מפתח פעיל${status.inbound_key_set_at ? ` · נוצר ${formatDateTime(status.inbound_key_set_at, now)}` : ''}`
              : 'עוד לא נוצר מפתח'}
          </span>
        </div>
      )}
    </SettingsCard>
  );
}

// ---------------------------------------------------------------------------
// בדיקה חיה
// ---------------------------------------------------------------------------

/**
 * Who is in a live test, as a list: name, phone, the way to the conversation
 * and a way to stop the test. Drawn from what it is given, so it can be shown
 * without a server.
 */
export function LiveTestList({
  contacts,
  total,
  stoppingId,
  onOpenChat,
  onStop,
}: {
  contacts: WahubContact[];
  /** How many the server counts — it may know of more than the list could read. */
  total: number;
  stoppingId: number | null;
  onOpenChat: (id: number) => void;
  onStop: (contact: WahubContact) => void;
}) {
  if (contacts.length === 0 && total === 0) {
    return (
      <p className={cx(s.muted, 'm-0 text-[13.5px] leading-relaxed')}>
        אין אנשי קשר בבדיקה חיה. מפעילים אותה מפרטי איש הקשר, בתוך השיחה שלו.
      </p>
    );
  }
  const missing = Math.max(0, total - contacts.length);
  return (
    <>
      <ul className={cx(s.rows, 'm-0 list-none p-0')} aria-label="אנשי קשר בבדיקה חיה">
        {contacts.map((contact) => (
          <li key={contact.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className={cx(s.t1, 'm-0 flex flex-wrap items-center gap-1.5')}>
                <span dir="auto" className="truncate">
                  {displayName(contact)}
                </span>
                <LiveTestTag />
              </p>
              {hasName(contact) && (
                <p dir="ltr" className={cx(s.t2, s.num, 'm-0 text-end !text-[12.5px]')}>
                  {contact.phone_display || contact.phone}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => onOpenChat(contact.id)} className={cx(s.btn, s.btnSm)}>
                לשיחה
              </button>
              <button
                type="button"
                onClick={() => onStop(contact)}
                disabled={stoppingId !== null}
                aria-label={`כבה את הבדיקה החיה של ${displayName(contact)}`}
                className={cx(s.btn, s.btnSm)}
              >
                {stoppingId === contact.id && <Spinner className="h-3.5 w-3.5" />}
                כבה
              </button>
            </div>
          </li>
        ))}
      </ul>
      {missing > 0 && (
        <p className={cx(s.t2, 'm-0 mt-2 !text-[12.5px]')}>
          {missing === 1 ? 'יש עוד איש קשר אחד בבדיקה חיה שלא מוצג כאן.' : `יש עוד ${missing} אנשי קשר בבדיקה חיה שלא מוצגים כאן.`}
        </p>
      )}
    </>
  );
}

function LiveTestSection({
  status,
  everybody,
  onChanged,
  onOpenChat,
}: {
  status: WahubStatus;
  /** The new bot was chosen to answer everybody ("מי עונה ללקוחות"): the list no longer says who is answered. */
  everybody: boolean;
  onChanged: () => void;
  onOpenChat: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const contacts = useLiveTestContacts(true);
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  async function stop(contact: WahubContact) {
    setStoppingId(contact.id);
    try {
      await setWahubLiveTest(contact.id, false);
      queryClient.setQueryData<WahubContact[]>(wahubKeys.liveTestContacts, (prev) =>
        (prev ?? []).filter((row) => row.id !== contact.id),
      );
      void queryClient.invalidateQueries({ queryKey: wahubKeys.liveTestContacts });
      onChanged();
    } catch (error) {
      toast.error(readableError(error, 'הבדיקה החיה לא כובתה'));
    } finally {
      setStoppingId(null);
    }
  }

  return (
    <SettingsCard
      icon={<Radio className="h-[18px] w-[18px]" />}
      title="בדיקה חיה"
      sub={
        everybody
          ? 'למי שמסומן כאן הבוט החדש עונה באמת, בוואטסאפ — גם אחרי חזרה ל“בדיקה בלבד”.'
          : 'למי שמסומן כאן הבוט החדש עונה באמת, בוואטסאפ, והבוט הישן מושתק. לכל השאר שום דבר לא משתנה.'
      }
    >
      {contacts.isLoading ? (
        <p className={cx(s.muted, 'm-0 flex items-center gap-2')}>
          <Spinner /> טוען…
        </p>
      ) : contacts.isError ? (
        <ErrorState title="לא הצלחנו לטעון את הרשימה" onRetry={() => void contacts.refetch()} tight />
      ) : (
        <LiveTestList
          contacts={contacts.data ?? []}
          total={liveTestCount(status) ?? 0}
          stoppingId={stoppingId}
          onOpenChat={onOpenChat}
          onStop={(contact) => void stop(contact)}
        />
      )}
    </SettingsCard>
  );
}

// ---------------------------------------------------------------------------
// תשובות מוכנות
// ---------------------------------------------------------------------------

function QuickReplyForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: WahubQuickReply;
  saving: boolean;
  onSave: (body: { title: string; text: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const ready = title.trim() && text.trim() && !saving;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSave({ title: title.trim(), text: text.trim() });
      }}
      className={s.inset}
    >
      <div className={s.form}>
        <label className={s.full}>
          כותרת
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            autoFocus
            placeholder="למשל: מחיר"
          />
        </label>
        <label className={s.full}>
          הטקסט
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            maxLength={4096}
            placeholder="היי {{first_name}}, …"
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={!ready} className={cx(s.btn, s.btnSm, s.btnP)}>
          {saving && <Spinner />}
          שמור
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={cx(s.btn, s.btnSm)}>
          ביטול
        </button>
      </div>
    </form>
  );
}

function QuickRepliesSection() {
  const queryClient = useQueryClient();
  const replies = useWahubQuickReplies();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const setCache = (change: (prev: WahubQuickReply[]) => WahubQuickReply[]) =>
    queryClient.setQueryData<WahubQuickReply[]>(wahubKeys.quickReplies, (prev) => change(prev ?? []));

  async function add(body: { title: string; text: string }) {
    setSaving(true);
    try {
      const created = await createWahubQuickReply(body);
      setCache((prev) => [...prev, created]);
      setAdding(false);
    } catch (error) {
      toast.error(readableError(error, 'התשובה לא נשמרה'));
    } finally {
      setSaving(false);
    }
  }

  async function edit(id: number, body: { title: string; text: string }) {
    const before = queryClient.getQueryData<WahubQuickReply[]>(wahubKeys.quickReplies) ?? [];
    setSaving(true);
    setCache((prev) => prev.map((reply) => (reply.id === id ? { ...reply, ...body } : reply)));
    setEditingId(null);
    try {
      const saved = await updateWahubQuickReply(id, body);
      setCache((prev) => prev.map((reply) => (reply.id === id ? saved : reply)));
    } catch (error) {
      queryClient.setQueryData(wahubKeys.quickReplies, before);
      toast.error(readableError(error, 'השינוי לא נשמר'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    const before = queryClient.getQueryData<WahubQuickReply[]>(wahubKeys.quickReplies) ?? [];
    setCache((prev) => prev.filter((reply) => reply.id !== id));
    setDeletingId(null);
    try {
      await deleteWahubQuickReply(id);
    } catch (error) {
      queryClient.setQueryData(wahubKeys.quickReplies, before);
      toast.error(readableError(error, 'המחיקה נכשלה'));
    }
  }

  const list = replies.data ?? [];

  return (
    <SettingsCard
      icon={<MessageSquareText className="h-[18px] w-[18px]" />}
      title="תשובות מוכנות"
      sub="נבחרות מתיבת הכתיבה. {{first_name}} מוחלף בשם הפרטי של הלקוח."
    >
      {replies.isLoading ? (
        <p className={cx(s.muted, 'm-0 flex items-center gap-2')}>
          <Spinner /> טוען…
        </p>
      ) : replies.isError ? (
        <ErrorState title="לא הצלחנו לטעון את התשובות המוכנות" onRetry={() => void replies.refetch()} tight />
      ) : (
        <>
          {list.length === 0 && !adding && (
            <EmptyState
              icon={<MessageSquareText />}
              title="עוד אין תשובות מוכנות"
              text="תשובה מוכנה חוסכת הקלדה של אותו משפט שוב ושוב."
              tight
            />
          )}
          <ul className={cx(s.rows, 'm-0 list-none p-0')}>
            {list.map((reply) => (
              <li key={reply.id} className="py-2.5">
                {editingId === reply.id ? (
                  <QuickReplyForm
                    initial={reply}
                    saving={saving}
                    onSave={(body) => void edit(reply.id, body)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : deletingId === reply.id ? (
                  <InlineConfirm
                    danger
                    text={
                      <>
                        למחוק את התשובה <B>{reply.title}</B>?
                      </>
                    }
                    confirmLabel="מחק"
                    onConfirm={() => void remove(reply.id)}
                    onCancel={() => setDeletingId(null)}
                  />
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={cx(s.t1, 'm-0')}>{reply.title}</p>
                      <p className={cx(s.t2, 'm-0 mt-0.5 whitespace-pre-line !text-[13px] leading-relaxed')}>{reply.text}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(reply.id)}
                        aria-label={`ערוך את ${reply.title}`}
                        className={cx(s.ib, s.ibSm)}
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(reply.id)}
                        aria-label={`מחק את ${reply.title}`}
                        className={cx(s.ib, s.ibSm, s.ibBad)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            {adding ? (
              <QuickReplyForm saving={saving} onSave={(body) => void add(body)} onCancel={() => setAdding(false)} />
            ) : (
              <button type="button" onClick={() => setAdding(true)} className={s.btn}>
                <Plus aria-hidden="true" />
                תשובה חדשה
              </button>
            )}
          </div>
        </>
      )}
    </SettingsCard>
  );
}

// ---------------------------------------------------------------------------
// תגיות
// ---------------------------------------------------------------------------

function TagForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: WahubTag;
  saving: boolean;
  onSave: (body: { name: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color || TAG_COLORS[0]);
  const ready = name.trim() && !saving;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSave({ name: name.trim(), color });
      }}
      className={s.inset}
    >
      <div className={s.form}>
        <label className={s.full}>
          שם התגית
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoFocus />
        </label>
      </div>
      <p className={cx(s.fieldLabel, 'mb-1 mt-2.5')}>צבע</p>
      <ColorDots value={color} onChange={setColor} />
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={!ready} className={cx(s.btn, s.btnSm, s.btnP)}>
          {saving && <Spinner />}
          שמור
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={cx(s.btn, s.btnSm)}>
          ביטול
        </button>
      </div>
    </form>
  );
}

function TagsSection() {
  const queryClient = useQueryClient();
  const tags = useWahubTags();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const setCache = (change: (prev: WahubTag[]) => WahubTag[]) =>
    queryClient.setQueryData<WahubTag[]>(wahubKeys.tags, (prev) => change(prev ?? []));

  async function add(body: { name: string; color: string }) {
    setSaving(true);
    try {
      const created = await createWahubTag(body);
      setCache((prev) => [...prev, created]);
      setAdding(false);
    } catch (error) {
      toast.error(readableError(error, 'התגית לא נשמרה'));
    } finally {
      setSaving(false);
    }
  }

  async function edit(id: number, body: { name: string; color: string }) {
    const before = queryClient.getQueryData<WahubTag[]>(wahubKeys.tags) ?? [];
    setSaving(true);
    setCache((prev) => prev.map((tag) => (tag.id === id ? { ...tag, ...body } : tag)));
    setEditingId(null);
    try {
      const saved = await updateWahubTag(id, body);
      setCache((prev) => prev.map((tag) => (tag.id === id ? saved : tag)));
    } catch (error) {
      queryClient.setQueryData(wahubKeys.tags, before);
      toast.error(readableError(error, 'השינוי לא נשמר'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    const before = queryClient.getQueryData<WahubTag[]>(wahubKeys.tags) ?? [];
    setCache((prev) => prev.filter((tag) => tag.id !== id));
    setDeletingId(null);
    try {
      await deleteWahubTag(id);
    } catch (error) {
      queryClient.setQueryData(wahubKeys.tags, before);
      toast.error(readableError(error, 'המחיקה נכשלה'));
    }
  }

  const list = tags.data ?? [];

  return (
    <SettingsCard
      icon={<Tags className="h-[18px] w-[18px]" />}
      title="תגיות"
      sub="לסימון חופשי של אנשי קשר, ולסינון לפיהן."
    >
      {tags.isLoading ? (
        <p className={cx(s.muted, 'm-0 flex items-center gap-2')}>
          <Spinner /> טוען…
        </p>
      ) : tags.isError ? (
        <ErrorState title="לא הצלחנו לטעון את התגיות" onRetry={() => void tags.refetch()} tight />
      ) : (
        <>
          {list.length === 0 && !adding && <EmptyState icon={<Tags />} title="עוד אין תגיות" tight />}
          <ul className={cx(s.rows, 'm-0 list-none p-0')}>
            {list.map((tag) => (
              <li key={tag.id} className="py-2">
                {editingId === tag.id ? (
                  <TagForm
                    initial={tag}
                    saving={saving}
                    onSave={(body) => void edit(tag.id, body)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : deletingId === tag.id ? (
                  <InlineConfirm
                    danger
                    text={
                      <>
                        למחוק את התגית <B>{tag.name}</B>? היא תרד מכל מי שמסומן בה.
                      </>
                    }
                    confirmLabel="מחק"
                    onConfirm={() => void remove(tag.id)}
                    onCancel={() => setDeletingId(null)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <TagChip tag={tag} />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(tag.id)}
                        aria-label={`ערוך את התגית ${tag.name}`}
                        className={cx(s.ib, s.ibSm)}
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(tag.id)}
                        aria-label={`מחק את התגית ${tag.name}`}
                        className={cx(s.ib, s.ibSm, s.ibBad)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            {adding ? (
              <TagForm saving={saving} onSave={(body) => void add(body)} onCancel={() => setAdding(false)} />
            ) : (
              <button type="button" onClick={() => setAdding(true)} className={s.btn}>
                <Plus aria-hidden="true" />
                תגית חדשה
              </button>
            )}
          </div>
        </>
      )}
    </SettingsCard>
  );
}

interface SettingsTabProps {
  status: WahubStatus | undefined;
  statusLoading: boolean;
  statusError: boolean;
  onRetryStatus: () => void;
  /** A conversation, from the live-test list: the chats tab opens on it. */
  onOpenChat: (id: number) => void;
  /** A card that was asked for by name (the strip on the leads tab): the page is brought to it. */
  focus?: 'automation' | null;
}

export default function SettingsTab({ status, statusLoading, statusError, onRetryStatus, onOpenChat, focus = null }: SettingsTabProps) {
  // Whom the new bot answers (docs/WAHUB-CONTRACT-GO-LIVE.md): read once, by the card and by the rows that name it.
  const botMode = useBotMode().data ?? null;
  return (
    // One column on a phone; two columns of cards where the page is wide enough (the stylesheet decides).
    <div className={cx(s.pg, s.settingsGrid)}>
      {/* "מי עונה ללקוחות": the first thing on the page, and the one place where every customer is moved to the new bot.
          Reads for itself; on a server that does not have it yet, it is not there. */}
      <WhoAnswersCard />
      {/* How things stand: a title and a word a row; the details are a press away (docs/WAHUB-CONTRACT-POLISH-1.md, ג). */}
      {status && <SystemStatusCard status={status} botMode={botMode} />}
      {/* "הכול אוטומטי": is the bot coming back to the leads by itself, and what is missing (docs/WAHUB-CONTRACT-LEADS-V2.md, י).
          Reads for itself; on a server that does not have it yet, it is not there. */}
      <LeadsAutomationCard focus={focus === 'automation'} />
      {status ? (
        <ConnectionSection status={status} onChanged={onRetryStatus} />
      ) : statusError ? (
        <div className={s.card}>
          <ErrorState title="לא הצלחנו לטעון את מצב החיבור" onRetry={onRetryStatus} />
        </div>
      ) : (
        statusLoading && <Skeleton className="h-64 !rounded-2xl" />
      )}
      {/* Only on a server that knows the live test (docs/WAHUB-CONTRACT-LIVE-TEST.md). */}
      {status && liveTestCount(status) !== null && (
        <LiveTestSection status={status} everybody={botMode?.mode === 'all'} onChanged={onRetryStatus} onOpenChat={onOpenChat} />
      )}
      {/* "דיוק" and the reviewer fix the bot; this decides whether a clear fix waits for a press (docs/WAHUB-CONTRACT-REFINE.md). */}
      <AutoApplySection />
      <QuickRepliesSection />
      <TagsSection />
    </div>
  );
}
