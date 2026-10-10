'use client';

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, MessageSquareText, Pencil, Plug, Plus, Sparkles, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  createWahubInboundKey,
  createWahubQuickReply,
  createWahubTag,
  deleteWahubQuickReply,
  deleteWahubTag,
  updateWahubQuickReply,
  updateWahubTag,
} from '@/lib/wahubApi';
import { agoText, formatDateTime } from '@/lib/wahub/format';
import type { WahubQuickReply, WahubStatus, WahubTag } from '@/types/wahub';
import { useNow } from '../hooks/useNow';
import { useWahubQuickReplies, useWahubTags, wahubKeys } from '../hooks/useWahubQueries';
import { EmptyState, ErrorState, InlineConfirm, Pill, Skeleton, Spinner, TagChip } from '../shared/bits';
import { ColorDots, TAG_COLORS } from '../shared/ContactParts';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

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
          window.setTimeout(() => setCopied(false), 2000);
        } else {
          toast.error('ההעתקה לא הצליחה. סמנו את הטקסט והעתיקו ביד.');
        }
      }}
      className={s.btn}
    >
      {copied ? <Check className={s.goodText} aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'הועתק' : label}
    </button>
  );
}

function StateRow({ ok, title, text }: { ok: boolean | null; title: string; text: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span className={cx(s.pill, ok === null ? s.pMute : ok ? s.pGood : s.pWarn, 'mt-0.5 shrink-0')}>
        <i className={s.pillDot} aria-hidden="true" />
        {title}
      </span>
      <p className="m-0 min-w-0 text-[13.5px] leading-relaxed">{text}</p>
    </li>
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

      <h4 className={cx(s.sectTitle, 'mb-1 mt-4')}>מצב</h4>
      <ul className={cx(s.rows, 'm-0 list-none p-0')}>
        <StateRow
          ok={status.last_inbound_at ? true : status.inbound_configured ? false : null}
          title="הודעות נכנסות"
          text={
            status.last_inbound_at ? (
              <>
                האחרונה התקבלה <B>{agoText(status.last_inbound_at, now)}</B> ({formatDateTime(status.last_inbound_at, now)})
              </>
            ) : status.inbound_configured ? (
              'יש מפתח, אבל עוד לא התקבלה הודעה. בדקו שההעתק מחובר ב-ManyChat.'
            ) : (
              'עוד לא מחובר.'
            )
          }
        />
        <StateRow
          ok={status.bot_replies_seen}
          title="תשובות הבוט"
          text={
            status.bot_replies_seen ? (
              'מתקבלות.'
            ) : (
              <>
                לא התקבלו בשבוע האחרון. <B>בלי זה “מחכים לתשובה” אינו מדויק</B> – גם מי שהבוט כבר ענה לו נספר כמחכה.
              </>
            )
          }
        />
        <StateRow
          ok={status.simulate_send || !status.sending_enabled ? false : status.send_configured}
          title="שליחה"
          text={
            status.simulate_send ? (
              <>
                <B>מצב הדמיה</B> – הודעות נרשמות ולא נשלחות.
              </>
            ) : !status.sending_enabled ? (
              <>
                <B>כבויה</B> – שום הודעה לא יוצאת ללקוחות, ו"קח שיחה" לא נוגע בבוט. מפעילים בהגדרות המערכת (WAHUB_SENDING_ENABLED) כשמוכנים.
              </>
            ) : status.send_configured ? (
              'פעילה, דרך ManyChat.'
            ) : (
              'לא מוגדרת – חסר מפתח ManyChat, ולכן אי אפשר לשלוח מכאן.'
            )
          }
        />
        <StateRow
          ok={null}
          title="בסך הכול"
          text={`${status.contacts_total.toLocaleString('he-IL')} אנשי קשר · ${status.messages_last_24h.toLocaleString('he-IL')} הודעות ב-24 השעות האחרונות`}
        />
      </ul>
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

// ---------------------------------------------------------------------------
// סיכום אוטומטי
// ---------------------------------------------------------------------------

function SummarySection({ status }: { status: WahubStatus }) {
  const on = status.ai_configured;
  return (
    <SettingsCard icon={<Sparkles className="h-[18px] w-[18px]" />} title="סיכום אוטומטי">
      <Pill tone={on ? 'success' : 'muted'} dot>
        {on ? 'פעיל' : 'כבוי'}
      </Pill>
      <p className={cx(s.muted, 'm-0 mt-2 text-[13.5px] leading-relaxed')}>
        {on
          ? 'כמה דקות אחרי שהשיחה נרגעת, המערכת מסכמת אותה וממלאת את “מה ידוע”: נושא, סניף, גיל ורמת עניין. את סימוני המעקב היא לא ממלאת – הם שלך בלבד.'
          : 'חסר מפתח לשירות הסיכום. בינתיים “מה ידוע” מתמלא לפי מילים בשיחה בלבד, בלי סיכום כתוב. המפתח מוגדר בהגדרות המערכת.'}
      </p>
    </SettingsCard>
  );
}

interface SettingsTabProps {
  status: WahubStatus | undefined;
  statusLoading: boolean;
  statusError: boolean;
  onRetryStatus: () => void;
}

export default function SettingsTab({ status, statusLoading, statusError, onRetryStatus }: SettingsTabProps) {
  return (
    <div className={cx(s.pg, 'mx-auto flex w-full max-w-3xl flex-col gap-3.5')}>
      {status ? (
        <ConnectionSection status={status} onChanged={onRetryStatus} />
      ) : statusError ? (
        <div className={s.card}>
          <ErrorState title="לא הצלחנו לטעון את מצב החיבור" onRetry={onRetryStatus} />
        </div>
      ) : (
        statusLoading && <Skeleton className="h-64 !rounded-2xl" />
      )}
      <QuickRepliesSection />
      <TagsSection />
      {status && <SummarySection status={status} />}
    </div>
  );
}
